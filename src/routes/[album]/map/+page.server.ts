import { error } from '@sveltejs/kit';
import { findAlbum, loadManifest } from '#lib/server/manifest.ts';
import { siteConfig } from '#lib/server/site.ts';
import type { EntryGenerator, PageServerLoad } from './$types';

export const entries: EntryGenerator = () => {
	const config = siteConfig();
	if (!config.map.enabled) return [];
	return loadManifest()
		.albums.filter((a) => a.bounds)
		.map((a) => ({ album: a.slug }));
};

export const load: PageServerLoad = ({ params }) => {
	const album = findAlbum(params.album);
	const config = siteConfig();
	if (!album || !album.bounds || !config.map.enabled) error(404, 'Map not available');
	return {
		slug: album.slug,
		title: album.title,
		visibility: album.visibility,
		bounds: album.bounds,
		photos: album.photos
			.filter((p) => p.gps)
			.map((p) => ({
				id: p.id,
				title: p.title,
				alt: p.alt,
				gps: p.gps!,
				cover: p.sources,
				width: p.width,
				height: p.height,
				thumbhash: p.thumbhash,
				color: p.color
			}))
	};
};
