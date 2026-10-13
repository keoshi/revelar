/**
 * Shared MapLibre loading and theme helpers for the album map and the info panel's mini map.
 * MapLibre is only ever dynamically imported, so pages without a map never download it.
 */
// MapLibre looks for its worker next to its own module URL, which after bundling is a chunk
// with no such neighbour. Bundle the worker as its own hashed file and point MapLibre at it.
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

type MapLibre = typeof import('maplibre-gl');

let loading: Promise<MapLibre> | undefined;

/** Loads MapLibre (and its stylesheet) once, with the worker URL set before any map exists. */
export function loadMapLibre(): Promise<MapLibre> {
	loading ??= Promise.all([import('maplibre-gl'), import('maplibre-gl/dist/maplibre-gl.css')]).then(
		([maplibre]) => {
			maplibre.setWorkerUrl(mapWorkerUrl);
			return maplibre;
		}
	);
	return loading;
}

export function currentTheme(): 'light' | 'dark' {
	const forced = document.documentElement.dataset.theme;
	if (forced === 'light' || forced === 'dark') return forced;
	return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/** Calls `onChange` whenever the manual theme toggle or the OS preference changes. */
export function watchTheme(onChange: () => void): () => void {
	const observer = new MutationObserver(onChange);
	observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
	const mq = window.matchMedia('(prefers-color-scheme: light)');
	mq.addEventListener('change', onChange);
	return () => {
		observer.disconnect();
		mq.removeEventListener('change', onChange);
	};
}
