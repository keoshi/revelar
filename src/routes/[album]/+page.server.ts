import { error } from '@sveltejs/kit';
import { findAlbum, loadManifest } from '#lib/server/manifest.ts';
import { albumPageData } from '#lib/server/album.ts';
import { siteConfig } from '#lib/server/site.ts';
import type { EntryGenerator, PageServerLoad } from './$types';

export const entries: EntryGenerator = () => loadManifest().albums.map((a) => ({ album: a.slug }));

export const load: PageServerLoad = ({ params }) => {
	const album = findAlbum(params.album);
	if (!album) error(404, 'Album not found');
	const config = siteConfig();
	return {
		album: albumPageData(album),
		hasMap: config.map.enabled && Boolean(album.bounds)
	};
};
