import { error } from '@sveltejs/kit';
import { findAlbum, loadManifest, rootAlbum } from '#lib/server/manifest.ts';
import { albumMapLoad } from '#lib/server/album.ts';
import { siteConfig } from '#lib/server/site.ts';
import type { EntryGenerator, PageServerLoad } from './$types';

// The root album's map is /map/ instead.
export const entries: EntryGenerator = () => {
	if (!siteConfig().map.enabled) return [];
	return loadManifest()
		.albums.filter((a) => a.bounds && a.slug !== rootAlbum()?.slug)
		.map((a) => ({ album: a.slug }));
};

export const load: PageServerLoad = ({ params }) => {
	const album = findAlbum(params.album);
	const data = album && albumMapLoad(album);
	if (!data) error(404, 'Map not available');
	return data;
};
