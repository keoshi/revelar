import { error } from '@sveltejs/kit';
import { findAlbum, loadManifest } from '#lib/server/manifest.ts';
import { albumMeta, photoPageData } from '#lib/server/album.ts';
import { siteConfig } from '#lib/server/site.ts';
import type { EntryGenerator, PageServerLoad } from './$types';

export const entries: EntryGenerator = () =>
	loadManifest().albums.flatMap((a) => a.photos.map((p) => ({ album: a.slug, photo: p.id })));

// A photo page is a thin shell: only this photo and the album's metadata are inline (for the
// crawler-visible image, Open Graph and JSON-LD); the photo list comes from /<album>/album.json.
export const load: PageServerLoad = ({ params }) => {
	const album = findAlbum(params.album);
	if (!album) error(404, 'Album not found');
	const index = album.photos.findIndex((p) => p.id === params.photo);
	if (index < 0) error(404, 'Photo not found');
	const config = siteConfig();
	return {
		album: albumMeta(album),
		photo: photoPageData(album.photos[index]),
		index,
		hasMap: config.map.enabled && Boolean(album.bounds)
	};
};
