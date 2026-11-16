import { error, redirect } from '@sveltejs/kit';
import { findAlbum, loadManifest, rootAlbum } from '#lib/server/manifest.ts';
import { albumLoad, photoLoad } from '#lib/server/album.ts';
import { withBase } from '#lib/utils/href.ts';
import type { EntryGenerator, PageServerLoad } from './$types';

// On a single-album site this one segment also serves the album's photos (`/<photo>/`), and the
// album's own folder becomes a redirect to the root so links shared before keep working.
export const entries: EntryGenerator = () => [
	...loadManifest().albums.map((a) => ({ album: a.slug })),
	...(rootAlbum()?.photos.map((p) => ({ album: p.id })) ?? [])
];

export const load: PageServerLoad = ({ params }) => {
	const root = rootAlbum();
	if (root) {
		if (params.album === root.slug) redirect(308, withBase('/'));
		const photo = photoLoad(root, params.album);
		if (photo) return { kind: 'photo' as const, ...photo };
	}
	const album = findAlbum(params.album);
	if (!album) error(404, 'Album not found');
	return { kind: 'album' as const, ...albumLoad(album) };
};
