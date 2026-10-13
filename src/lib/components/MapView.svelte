<script lang="ts">
	/**
	 * Map of photo locations. MapLibre GL is dynamically imported only here. Markers are
	 * circular photo thumbnails generated on demand (styleimagemissing), clustered with
	 * MapLibre's GeoJSON clustering. Clicking a marker opens the photo; clicking a cluster zooms in.
	 */
	import { onMount } from 'svelte';
	import type { Map as MapLibreMap } from 'maplibre-gl';
	import type { FeatureCollection, Point } from 'geojson';
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
		onSelect: (photo: MapPhoto) => void;
	};

	let { photos, bounds, styleLight, styleDark, onSelect }: Props = $props();

	let container: HTMLDivElement | undefined = $state();
	let failed = $state(false);
	let map: MapLibreMap | undefined;

	const SOURCE = 'revelar-photos';
	const ICON = 40;
	const RING = 2;

	function currentTheme(): 'light' | 'dark' {
		const forced = document.documentElement.dataset.theme;
		if (forced === 'light' || forced === 'dark') return forced;
		return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
	}
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
				properties: { id: p.id, icon: `photo-${p.id}` }
			}))
		};
	}

	/** Circular thumbnail icon at 2× for crisp rendering; a flat colour disc until the image arrives. */
	function makeIcon(photo: MapPhoto, img?: HTMLImageElement): ImageData {
		const size = (ICON + RING * 2) * 2;
		const canvas = document.createElement('canvas');
		canvas.width = size;
		canvas.height = size;
		const ctx = canvas.getContext('2d')!;
		const r = size / 2;
		ctx.beginPath();
		ctx.arc(r, r, r, 0, Math.PI * 2);
		ctx.fillStyle = '#ffffff';
		ctx.fill();
		ctx.save();
		ctx.beginPath();
		ctx.arc(r, r, r - RING * 2, 0, Math.PI * 2);
		ctx.clip();
		ctx.fillStyle = photo.color;
		ctx.fillRect(0, 0, size, size);
		if (img) {
			const scale = Math.max(size / img.naturalWidth, size / img.naturalHeight);
			const w = img.naturalWidth * scale;
			const h = img.naturalHeight * scale;
			ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
		}
		ctx.restore();
		return ctx.getImageData(0, 0, size, size);
	}

	function addLayers(m: MapLibreMap) {
		if (m.getSource(SOURCE)) return;
		m.addSource(SOURCE, {
			type: 'geojson',
			data: geojson(),
			cluster: true,
			clusterRadius: 48,
			clusterMaxZoom: 17
		});
		m.addLayer({
			id: 'revelar-clusters',
			type: 'circle',
			source: SOURCE,
			filter: ['has', 'point_count'],
			paint: {
				'circle-color': '#1a1a1a',
				'circle-radius': ['step', ['get', 'point_count'], 20, 10, 24, 50, 30],
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
				'text-size': 13,
				'text-font': ['Noto Sans Regular']
			},
			paint: { 'text-color': '#ffffff' }
		});
		m.addLayer({
			id: 'revelar-points',
			type: 'symbol',
			source: SOURCE,
			filter: ['!', ['has', 'point_count']],
			layout: {
				'icon-image': ['get', 'icon'],
				'icon-size': 0.5,
				'icon-allow-overlap': true,
				'icon-ignore-placement': true
			}
		});
	}

	onMount(() => {
		let cleanup: (() => void) | undefined;
		let cancelled = false;
		(async () => {
			if (!container) return;
			let maplibre: typeof import('maplibre-gl');
			try {
				[maplibre] = await Promise.all([
					import('maplibre-gl'),
					import('maplibre-gl/dist/maplibre-gl.css')
				]);
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
					bounds,
					fitBoundsOptions: { padding: 48, maxZoom: 15 },
					attributionControl: { compact: true }
				});
			} catch {
				failed = true;
				return;
			}
			map = m;
			m.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right');
			m.on('error', () => {
				// Style or tiles unreachable: keep the list below the map usable.
				if (!m.isStyleLoaded()) failed = true;
			});
			m.on('styleimagemissing', (e) => {
				const id = e.id;
				if (!id.startsWith('photo-')) return;
				const photo = byId.get(id.slice(6));
				if (!photo) return;
				if (!m.hasImage(id)) m.addImage(id, makeIcon(photo), { pixelRatio: 2 });
				const img = new Image();
				img.crossOrigin = 'anonymous';
				img.onload = () => {
					if (m.hasImage(id)) m.updateImage(id, makeIcon(photo, img));
				};
				const s = expandSources(photo.sources);
				img.src = withBase(s.webp[0]?.url ?? s.jpeg);
			});
			m.on('load', () => {
				failed = false;
				addLayers(m);
			});
			m.on('click', 'revelar-clusters', async (e) => {
				const feature = e.features?.[0];
				if (!feature) return;
				const clusterId = feature.properties?.cluster_id as number;
				const source = m.getSource(SOURCE) as import('maplibre-gl').GeoJSONSource;
				const zoom = await source.getClusterExpansionZoom(clusterId);
				const [lng, lat] = (feature.geometry as Point).coordinates;
				m.easeTo({ center: [lng, lat], zoom, duration: prefersReducedMotion() ? 0 : 400 });
			});
			m.on('click', 'revelar-points', (e) => {
				const id = e.features?.[0]?.properties?.id as string | undefined;
				const photo = id ? byId.get(id) : undefined;
				if (photo) onSelect(photo);
			});
			for (const layer of ['revelar-clusters', 'revelar-points']) {
				m.on('mouseenter', layer, () => (m.getCanvas().style.cursor = 'pointer'));
				m.on('mouseleave', layer, () => (m.getCanvas().style.cursor = ''));
			}

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
			const observer = new MutationObserver(swap);
			observer.observe(document.documentElement, {
				attributes: true,
				attributeFilter: ['data-theme']
			});
			const mq = window.matchMedia('(prefers-color-scheme: light)');
			mq.addEventListener('change', swap);
			cleanup = () => {
				observer.disconnect();
				mq.removeEventListener('change', swap);
				m.remove();
				map = undefined;
			};
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
</style>
