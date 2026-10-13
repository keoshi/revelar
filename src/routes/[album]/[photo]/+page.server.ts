import { error } from '@sveltejs/kit';
import { findAlbum, loadManifest } from '#lib/server/manifest.ts';
import { albumPageData } from '#lib/server/album.ts';
import { siteConfig } from '#lib/server/site.ts';
import type { EntryGenerator, PageServerLoad } from './$types';

export const entries: EntryGenerator = () =>
	loadManifest().albums.flatMap((a) => a.photos.map((p) => ({ album: a.slug, photo: p.id })));

export const load: PageServerLoad = ({ params }) => {
	const album = findAlbum(params.album);
	if (!album) error(404, 'Album not found');
	const photo = album.photos.find((p) => p.id === params.photo);
	if (!photo) error(404, 'Photo not found');
	const config = siteConfig();
	return {
		album: albumPageData(album),
		photoId: photo.id,
		hasMap: config.map.enabled && Boolean(album.bounds)
	};
};
