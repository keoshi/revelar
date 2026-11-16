import { error, json } from '@sveltejs/kit';
import { findAlbum, loadManifest, rootAlbum } from '#lib/server/manifest.ts';
import { albumPageData } from '#lib/server/album.ts';
import type { EntryGenerator, RequestHandler } from './$types';

/**
 * One data file per album (`/<album>/album.json`): the photo list that the album page embeds
 * inline. Photo pages are thin shells that fetch this on load instead of each carrying a copy.
 */
export const prerender = true;

// The root album's list is /album.json instead.
export const entries: EntryGenerator = () =>
	loadManifest()
		.albums.filter((a) => a.slug !== rootAlbum()?.slug)
		.map((a) => ({ album: a.slug }));

export const GET: RequestHandler = ({ params }) => {
	const album = findAlbum(params.album);
	if (!album) error(404, 'Album not found');
	return json({ photos: albumPageData(album).photos });
};
