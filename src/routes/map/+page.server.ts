import { error } from '@sveltejs/kit';
import { publicAlbums } from '#lib/server/manifest.ts';
import { siteConfig } from '#lib/server/site.ts';
import { compactSources, type ImageSources } from '#lib/utils/sources.ts';
import type { PageServerLoad } from './$types';

// When the global map is disabled this load responds 404, which the prerenderer is configured
// to tolerate for this path (see vite.config.ts), so no /map/ page is written.

export const load: PageServerLoad = () => {
	const config = siteConfig();
	if (!config.map.enabled || !config.map.globalMap) error(404, 'Map not available');
	const albums = publicAlbums().filter((a) => a.bounds);
	if (!albums.length) error(404, 'No geotagged photos');
	const photos = albums.flatMap((a) =>
		a.photos
			.filter((p) => p.gps)
			.map((p) => ({
				id: p.id,
				album: a.slug,
				albumTitle: a.title,
				title: p.title,
				alt: p.alt,
				gps: p.gps!,
				sources: compactSources(p.sources as ImageSources),
				color: p.color
			}))
	);
	const lngs = photos.map((p) => p.gps.lng);
	const lats = photos.map((p) => p.gps.lat);
	return {
		photos,
		bounds: [
			[Math.min(...lngs), Math.min(...lats)],
			[Math.max(...lngs), Math.max(...lats)]
		] as [[number, number], [number, number]]
	};
};
