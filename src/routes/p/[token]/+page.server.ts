import { error } from '@sveltejs/kit';
import { loadManifest } from '#lib/server/manifest.ts';
import type { EntryGenerator, PageServerLoad } from './$types';

export const entries: EntryGenerator = () =>
	loadManifest().privateAlbums.map((a) => ({ token: a.token }));

export const load: PageServerLoad = ({ params }) => {
	const entry = loadManifest().privateAlbums.find((a) => a.token === params.token);
	if (!entry) error(404, 'Not found');
	// The slug never reaches the client; only the token, the ciphertext and the KDF parameters.
	return {
		entry: {
			token: entry.token,
			title: entry.title,
			blob: entry.blob,
			salt: entry.salt,
			iterations: entry.iterations,
			wrappedKey: entry.wrappedKey
		}
	};
};
