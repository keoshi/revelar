import { error, json } from '@sveltejs/kit';
import { rootAlbum } from '#lib/server/manifest.ts';
import { albumPageData } from '#lib/server/album.ts';
import type { RequestHandler } from './$types';

/** The photo list of a single-album site's album, which is served at the root. */
export const prerender = true;

export const GET: RequestHandler = () => {
	const root = rootAlbum();
	if (!root) error(404, 'No root album');
	return json({ photos: albumPageData(root).photos });
};
