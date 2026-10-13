<script lang="ts">
	/**
	 * Map of photo locations. MapLibre GL is dynamically imported only here. Markers are
	 * circular photo thumbnails as HTML markers (MapLibre positions them; the GL sprite atlas
	 * does not reliably show images added at runtime), clustered with MapLibre's GeoJSON
	 * clustering. Clicking a marker opens the photo; clicking a cluster zooms in, or, when its
	 * photos share one location (GPS is rounded for privacy, so many do), opens a grid of their
	 * thumbnails.
	 */
	import { onMount } from 'svelte';
	import type { Map as MapLibreMap } from 'maplibre-gl';
	import type { FeatureCollection, Point } from 'geojson';
	import { currentTheme, loadMapLibre, watchTheme } from '../utils/maplibre.ts';
	import type { PhotoGps } from '../types.ts';
	import type { PhotoSources } from '../utils/sources.ts';
	import { expandSources } from '../utils/sources.ts';
	import { withBase } from '../utils/href.ts';
	import { prefersReducedMotion } from '../utils/formats.ts';

	export type MapPhoto = {
		id: string;
		title?: string;
		alt: string;
		gps: PhotoGps;
		sources: PhotoSources;
		color: string;
		href: string;
	};

	type Props = {
		photos: MapPhoto[];
		bounds: [[number, number], [number, number]];
		styleLight: string;
		styleDark: string;
		/** open centred on this point at street level instead of fitting `bounds` */
		focus?: { lng: number; lat: number };
		onSelect: (photo: MapPhoto) => void;
	};

	let { photos, bounds, styleLight, styleDark, focus, onSelect }: Props = $props();

	const FOCUS_ZOOM = 16;

	let container: HTMLDivElement | undefined = $state();
	let map = $state.raw<MapLibreMap | undefined>();
	let failed = $state(false);

	$effect(() => {
		const f = focus;
		const m = map;
		if (f && m) m.jumpTo({ center: [f.lng, f.lat], zoom: FOCUS_ZOOM });
	});

	const SOURCE = 'revelar-photos';
	/** Keep coincident photos as a counted cluster up to street level rather than a stack of markers. */
	const CLUSTER_MAX_ZOOM = 19;

	function styleUrl(): string {
		return currentTheme() === 'light' ? styleLight : styleDark;
	}

	function geojson(): FeatureCollection<Point> {
		return {
			type: 'FeatureCollection',
			features: photos.map((p) => ({
				type: 'Feature',
				id: p.id,
				geometry: { type: 'Point', coordinates: [p.gps.lng, p.gps.lat] },
				properties: { id: p.id }
			}))
		};
	}

	function addLayers(m: MapLibreMap) {
		if (m.getSource(SOURCE)) return;
		m.addSource(SOURCE, {
			type: 'geojson',
			data: geojson(),
			cluster: true,
			clusterRadius: 56,
			clusterMaxZoom: CLUSTER_MAX_ZOOM,
			maxzoom: CLUSTER_MAX_ZOOM + 1
		});
		m.addLayer({
			id: 'revelar-clusters',
			type: 'circle',
			source: SOURCE,
			filter: ['has', 'point_count'],
			paint: {
				'circle-color': '#1a1a1a',
				'circle-radius': ['step', ['get', 'point_count'], 22, 10, 26, 50, 32],
				'circle-stroke-width': 2,
				'circle-stroke-color': '#ffffff'
			}
		});
		m.addLayer({
			id: 'revelar-cluster-count',
			type: 'symbol',
			source: SOURCE,
			filter: ['has', 'point_count'],
			layout: {
				'text-field': ['get', 'point_count_abbreviated'],
				'text-size': 14,
				'text-font': ['Noto Sans Regular']
			},
			paint: { 'text-color': '#ffffff' }
		});
	}

	function thumbUrl(photo: MapPhoto): string {
		const s = expandSources(photo.sources);
		return withBase(s.webp[0]?.url ?? s.jpeg);
	}

	onMount(() => {
		let cleanup: (() => void) | undefined;
		let cancelled = false;
		(async () => {
			if (!container) return;
			let maplibre: Awaited<ReturnType<typeof loadMapLibre>>;
			try {
				maplibre = await loadMapLibre();
			} catch {
				failed = true;
				return;
			}
			if (cancelled) return;
			const byId = new Map(photos.map((p) => [p.id, p]));
			let m: MapLibreMap;
			try {
				m = new maplibre.Map({
					container,
					style: styleUrl(),
					...(focus
						? { center: [focus.lng, focus.lat], zoom: FOCUS_ZOOM }
						: { bounds, fitBoundsOptions: { padding: 48, maxZoom: 15 } }),
					attributionControl: { compact: true }
				});
			} catch {
				failed = true;
				return;
			}
			// Exposed for the e2e tests (not enumerable, not part of the public DOM API).
			Object.defineProperty(container, 'revelarMap', { value: m, configurable: true });
			m.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right');
			m.on('error', () => {
				// Style or tiles unreachable: keep the list below the map usable.
				if (!m.isStyleLoaded()) failed = true;
			});
			// Unclustered photos are HTML markers, kept in sync with the clustered source: whatever
			// the loaded tiles expose as single points at the current zoom gets a marker.
			// eslint-disable-next-line svelte/prefer-svelte-reactivity -- map bookkeeping, not component state
			const markers = new Map<string, import('maplibre-gl').Marker>();
			const syncMarkers = () => {
				if (!m.getSource(SOURCE)) return;
				// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local scratch set
				const seen = new Set<string>();
				for (const f of m.querySourceFeatures(SOURCE)) {
					if (f.properties?.point_count) continue;
					const id = f.properties?.id as string;
					const photo = byId.get(id);
					if (!photo) continue;
					seen.add(id);
					if (markers.has(id)) continue;
					const el = document.createElement('button');
					el.type = 'button';
					el.className = 'revelar-marker';
					el.setAttribute('aria-label', photo.title ?? photo.alt);
					el.style.setProperty('--marker-color', photo.color);
					const img = new Image();
					img.alt = '';
					img.decoding = 'async';
					img.src = thumbUrl(photo);
					el.append(img);
					el.addEventListener('click', (e) => {
						e.stopPropagation();
						onSelect(photo);
					});
					markers.set(
						id,
						new maplibre.Marker({ element: el }).setLngLat([photo.gps.lng, photo.gps.lat]).addTo(m)
					);
				}
				for (const [id, marker] of markers) {
					if (seen.has(id)) continue;
					marker.remove();
					markers.delete(id);
				}
			};
			m.on('load', () => {
				failed = false;
				addLayers(m);
			});
			m.on('data', (e) => {
				if ('sourceId' in e && e.sourceId === SOURCE && e.isSourceLoaded) syncMarkers();
			});
			m.on('moveend', syncMarkers);
			let popup: import('maplibre-gl').Popup | undefined;
			const showCluster = (lngLat: [number, number], items: MapPhoto[]) => {
				popup?.remove();
				const el = document.createElement('div');
				el.className = 'revelar-popup';
				const heading = document.createElement('p');
				heading.textContent = `${items.length} photos at this location`;
				const grid = document.createElement('div');
				grid.className = 'revelar-popup-grid';
				grid.style.setProperty('--cols', String(Math.min(4, items.length)));
				for (const photo of items) {
					const button = document.createElement('button');
					button.type = 'button';
					button.setAttribute('aria-label', photo.title ?? photo.alt);
					const img = new Image();
					img.alt = '';
					img.loading = 'lazy';
					img.decoding = 'async';
					img.src = thumbUrl(photo);
					button.append(img);
					button.addEventListener('click', () => {
						popup?.remove();
						onSelect(photo);
					});
					grid.append(button);
				}
				el.append(heading, grid);
				popup = new maplibre.Popup({ maxWidth: '336px', offset: 20, focusAfterOpen: true })
					.setLngLat(lngLat)
					.setDOMContent(el)
					.addTo(m);
			};
			m.on('click', 'revelar-clusters', async (e) => {
				const feature = e.features?.[0];
				if (!feature) return;
				const clusterId = feature.properties?.cluster_id as number;
				const count = feature.properties?.point_count as number;
				const source = m.getSource(SOURCE) as import('maplibre-gl').GeoJSONSource;
				const [lng, lat] = (feature.geometry as Point).coordinates as [number, number];
				const zoom = await source.getClusterExpansionZoom(clusterId);
				if (zoom <= CLUSTER_MAX_ZOOM && zoom > m.getZoom()) {
					m.easeTo({ center: [lng, lat], zoom, duration: prefersReducedMotion() ? 0 : 400 });
					return;
				}
				// Zooming cannot separate these photos: they share one (rounded) location.
				const leaves = await source.getClusterLeaves(clusterId, count, 0);
				const items = leaves
					.map((f) => byId.get(f.properties?.id as string))
					.filter((p): p is MapPhoto => Boolean(p));
				showCluster([lng, lat], items);
			});
			m.on('mouseenter', 'revelar-clusters', () => (m.getCanvas().style.cursor = 'pointer'));
			m.on('mouseleave', 'revelar-clusters', () => (m.getCanvas().style.cursor = ''));

			// Follow theme changes (manual toggle or OS preference), keeping our source and layers.
			const swap = () => {
				m.setStyle(styleUrl(), {
					transformStyle: (prev, nextStyle) =>
						prev
							? {
									...nextStyle,
									sources: { ...nextStyle.sources, [SOURCE]: prev.sources[SOURCE] },
									layers: [
										...nextStyle.layers,
										...prev.layers.filter((l) => l.id.startsWith('revelar-'))
									]
								}
							: nextStyle
				});
			};
			const unwatch = watchTheme(swap);
			cleanup = () => {
				popup?.remove();
				unwatch();
				m.remove();
			};
			map = m;
			if (cancelled) cleanup();
		})();
		return () => {
			cancelled = true;
			cleanup?.();
		};
	});
</script>

<div class="map-wrap" class:failed>
	<div bind:this={container} class="map" role="region" aria-label="Map of photo locations"></div>
	{#if failed}
		<p class="map-fallback">The map could not be loaded. The photos are listed below.</p>
	{/if}
</div>

<style>
	.map-wrap {
		position: relative;
		height: min(70vh, 720px);
		min-height: 320px;
		background: var(--surface);
	}

	.map {
		position: absolute;
		inset: 0;
	}

	.failed .map {
		visibility: hidden;
	}

	.map-fallback {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	:global(.maplibregl-ctrl-attrib) {
		font-size: 11px;
	}

	/* Photo markers: DOM elements positioned by MapLibre */
	:global(.revelar-marker) {
		display: block;
		width: 56px;
		height: 56px;
		padding: 0;
		border: 2px solid #ffffff;
		border-radius: 50%;
		overflow: hidden;
		background: var(--marker-color, #444);
		box-shadow: 0 2px 10px rgb(0 0 0 / 0.35);
		cursor: pointer;
		transition: transform var(--dur-ui) var(--ease-out);
	}
	:global(.revelar-marker:hover),
	:global(.revelar-marker:focus-visible) {
		transform: scale(1.1);
		z-index: 1;
	}
	:global(.revelar-marker img) {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	/* Cluster popup: a grid of thumbnails for photos sharing one location */
	:global(.maplibregl-popup-content) {
		background: var(--surface);
		color: var(--text);
		border-radius: var(--radius);
		padding: 12px;
		box-shadow: 0 8px 24px rgb(0 0 0 / 0.3);
		font-family: var(--font-ui);
	}
	:global(.maplibregl-popup-anchor-bottom .maplibregl-popup-tip) {
		border-top-color: var(--surface);
	}
	:global(.maplibregl-popup-anchor-top .maplibregl-popup-tip) {
		border-bottom-color: var(--surface);
	}
	:global(.maplibregl-popup-anchor-left .maplibregl-popup-tip) {
		border-right-color: var(--surface);
	}
	:global(.maplibregl-popup-anchor-right .maplibregl-popup-tip) {
		border-left-color: var(--surface);
	}
	:global(.maplibregl-popup-close-button) {
		color: var(--text);
		font-size: 18px;
		padding: 2px 8px;
	}
	:global(.revelar-popup p) {
		margin: 0 24px 10px 0;
		font-size: var(--text-sm);
		color: var(--text-muted);
	}
	:global(.revelar-popup-grid) {
		display: grid;
		grid-template-columns: repeat(var(--cols, 4), 68px);
		gap: 6px;
		max-height: 320px;
		overflow-y: auto;
	}
	:global(.revelar-popup-grid button) {
		display: block;
		width: 68px;
		height: 68px;
		padding: 0;
		border-radius: 4px;
		overflow: hidden;
		background: var(--surface-2);
	}
	:global(.revelar-popup-grid img) {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
</style>
