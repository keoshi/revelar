import { error, redirect } from '@sveltejs/kit';
import { findAlbum, loadManifest, rootAlbum } from '#lib/server/manifest.ts';
import { photoLoad } from '#lib/server/album.ts';
import { withBase } from '#lib/utils/href.ts';
import type { EntryGenerator, PageServerLoad } from './$types';

// The root album's photos live at `/<photo>/`; their folder addresses redirect there.
export const entries: EntryGenerator = () =>
	loadManifest().albums.flatMap((a) => a.photos.map((p) => ({ album: a.slug, photo: p.id })));

export const load: PageServerLoad = ({ params }) => {
	if (rootAlbum()?.slug === params.album) redirect(308, withBase(`/${params.photo}/`));
	const album = findAlbum(params.album);
	if (!album) error(404, 'Album not found');
	const data = photoLoad(album, params.photo);
	if (!data) error(404, 'Photo not found');
	return data;
};
