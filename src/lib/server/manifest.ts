import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { EMPTY_MANIFEST, type Manifest, type AlbumSummary } from '#lib/types.ts';
import { albumHref } from '#lib/utils/href.ts';

/** Written by ingest into the site root's .cache/ (REVELAR_SITE_ROOT, else the working directory). */
const MANIFEST_PATH = resolve(
	process.env.REVELAR_SITE_ROOT ?? process.cwd(),
	'.cache/manifest.json'
);

let cached: Manifest | undefined;
let cachedMtime = 0;

/** Reads the manifest written by `scripts/ingest.ts`. Server-only; never shipped to the client. */
export function loadManifest(): Manifest {
	if (cached && import.meta.env.DEV && existsSync(MANIFEST_PATH)) {
		// In dev the watcher re-ingests on changes; pick up the new manifest without a restart.
		if (statSync(MANIFEST_PATH).mtimeMs !== cachedMtime) cached = undefined;
	}
	if (cached) return cached;
	if (!existsSync(MANIFEST_PATH)) {
		console.warn(
			`[revelar] ${MANIFEST_PATH} not found; run \`npm run ingest\` first. Using empty manifest.`
		);
		cached = EMPTY_MANIFEST;
		return cached;
	}
	cached = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Manifest;
	cachedMtime = statSync(MANIFEST_PATH).mtimeMs;
	return cached;
}

export function publicAlbums(): AlbumSummary[] {
	return loadManifest().albums.filter((a) => a.visibility === 'public');
}

/** When exactly one public album exists, its href; the home page redirects there. */
export function soleAlbumHref(): string | undefined {
	const albums = publicAlbums();
	return albums.length === 1 ? albumHref(albums[0].slug) : undefined;
}

export function findAlbum(slug: string): AlbumSummary | undefined {
	return loadManifest().albums.find((a) => a.slug === slug);
}

/** Strip the per-photo list so the home page only ships cover data. */
export function albumCard(album: AlbumSummary) {
	const { photos: _photos, ...rest } = album;
	void _photos;
	return rest;
}
export type AlbumCard = ReturnType<typeof albumCard>;
