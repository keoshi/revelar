import { error, json } from '@sveltejs/kit';
import { findAlbum, loadManifest } from '#lib/server/manifest.ts';
import { albumPageData } from '#lib/server/album.ts';
import type { EntryGenerator, RequestHandler } from './$types';

/**
 * One data file per album (`/<album>/album.json`): the photo list that the album page embeds
 * inline. Photo pages are thin shells that fetch this on load instead of each carrying a copy.
 */
export const prerender = true;

export const entries: EntryGenerator = () => loadManifest().albums.map((a) => ({ album: a.slug }));

export const GET: RequestHandler = ({ params }) => {
	const album = findAlbum(params.album);
	if (!album) error(404, 'Album not found');
	return json({ photos: albumPageData(album).photos });
};
