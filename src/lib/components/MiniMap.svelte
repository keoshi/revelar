<script lang="ts">
	/**
	 * A small, non-interactive map centred on one photo's location, for the info panel. Links
	 * to the album map focused on the same photo when `href` is given. MapLibre is loaded on
	 * first mount only, so the viewer bundle stays free of it.
	 */
	import { onMount } from 'svelte';
	import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
	import type { PhotoGps } from '../types.ts';
	import { currentTheme, loadMapLibre, watchTheme } from '../utils/maplibre.ts';

	type Props = {
		gps: PhotoGps;
		styleLight: string;
		styleDark: string;
		/** album map URL (the photo id is appended as `#photo=`) */
		href?: string;
	};

	let { gps, styleLight, styleDark, href }: Props = $props();

	let container: HTMLDivElement | undefined = $state();
	let map = $state.raw<MapLibreMap | undefined>();
	let marker: Marker | undefined;
	let failed = $state(false);

	function zoomFor(g: PhotoGps): number {
		return g.precision === 'exact' ? 14 : 11;
	}
	function styleUrl(): string {
		return currentTheme() === 'light' ? styleLight : styleDark;
	}

	onMount(() => {
		let cleanup: (() => void) | undefined;
		let cancelled = false;
		(async () => {
			let maplibre: Awaited<ReturnType<typeof loadMapLibre>>;
			try {
				maplibre = await loadMapLibre();
			} catch {
				failed = true;
				return;
			}
			if (cancelled || !container) return;
			let m: MapLibreMap;
			try {
				m = new maplibre.Map({
					container,
					style: styleUrl(),
					center: [gps.lng, gps.lat],
					zoom: zoomFor(gps),
					interactive: false,
					attributionControl: { compact: true }
				});
			} catch {
				failed = true;
				return;
			}
			m.on('error', () => {
				if (!m.isStyleLoaded()) failed = true;
			});
			// MapLibre opens the compact attribution until the map is first dragged, which never
			// happens on a non-interactive map; start it collapsed (the (i) button still expands it).
			const collapseAttribution = () => {
				const attrib = container?.querySelector('.maplibregl-ctrl-attrib');
				attrib?.classList.remove('maplibregl-compact-show');
				attrib?.removeAttribute('open');
			};
			collapseAttribution();
			m.on('load', () => {
				failed = false;
				collapseAttribution();
			});
			const el = document.createElement('div');
			el.className = 'revelar-mini-marker';
			marker = new maplibre.Marker({ element: el }).setLngLat([gps.lng, gps.lat]).addTo(m);
			const unwatch = watchTheme(() => m.setStyle(styleUrl()));
			cleanup = () => {
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

	// Follow the current photo without recreating the map.
	$effect(() => {
		const g = gps;
		const m = map;
		if (!m) return;
		m.jumpTo({ center: [g.lng, g.lat], zoom: zoomFor(g) });
		marker?.setLngLat([g.lng, g.lat]);
	});
</script>

{#if !failed}
	{#if href}
		<a
			class="mini-map"
			{href}
			aria-label="Open the album map at this photo's location"
			onclick={(e) => {
				// The attribution's (i) toggle sits inside the link; expanding it must not navigate.
				if ((e.target as Element).closest('.maplibregl-ctrl-attrib')) e.preventDefault();
			}}
		>
			<div
				bind:this={container}
				class="mini-map-canvas"
				class:approximate={gps.precision === 'approximate'}
			></div>
		</a>
	{:else}
		<div class="mini-map" role="img" aria-label="Map of this photo's location">
			<div
				bind:this={container}
				class="mini-map-canvas"
				class:approximate={gps.precision === 'approximate'}
			></div>
		</div>
	{/if}
{/if}

<style>
	.mini-map {
		display: block;
		position: relative;
		height: 160px;
		margin-bottom: 8px;
		border-radius: var(--radius);
		overflow: hidden;
		background: var(--surface-2);
	}
	a.mini-map:focus-visible {
		outline: none;
		box-shadow: var(--focus-ring);
	}
	.mini-map-canvas {
		position: absolute;
		inset: 0;
	}
	.mini-map :global(.maplibregl-canvas) {
		cursor: inherit;
	}
	.mini-map :global(.maplibregl-ctrl-attrib) {
		font-size: 10px;
	}
	.mini-map :global(.revelar-mini-marker) {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--accent);
		border: 2px solid #ffffff;
		box-shadow: 0 1px 4px rgb(0 0 0 / 0.4);
	}
	/* Rounded coordinates: a soft disc instead of a pin, so the map does not claim a precise spot. */
	.mini-map .approximate :global(.revelar-mini-marker) {
		width: 36px;
		height: 36px;
		background: color-mix(in srgb, var(--accent) 35%, transparent);
		border: 1.5px solid var(--accent);
		box-shadow: none;
	}
	@media (max-width: 639px) {
		.mini-map {
			height: 120px;
		}
	}
</style>
