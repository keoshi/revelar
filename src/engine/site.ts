/**
 * Site-level operations for tools that manage a site folder on a user's behalf (the desktop
 * app, `revelar init`): creating a site, listing albums, reading and writing `album.yaml`,
 * adding a folder of photos, and reading or rewriting the config.
 */
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync
} from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { parse, stringify } from 'yaml';
import { loadConfig } from './config.ts';
import { scanPhotos, type ScannedAlbum } from './scan.ts';
import { loadSidecar, type Sidecar } from './sidecar.ts';
import type { AlbumSummary, Manifest, Photo } from '../lib/types.ts';
import type { RevelarConfig, RevelarConfigInput } from '../lib/config.ts';
import { expandSources } from '../lib/utils/sources.ts';

export const CONFIG_TEMPLATE = (input: RevelarConfigInput) =>
	`import { defineConfig } from 'revelar/config';

export default defineConfig(${JSON.stringify(input, null, '\t').replace(/"([a-zA-Z_][a-zA-Z0-9_]*)":/g, '$1:')});
`;

export const DEFAULT_CONFIG: RevelarConfigInput = {
	site: {
		title: 'Photographs',
		description: 'Selected work',
		baseUrl: 'https://photos.example.com',
		author: 'Your Name',
		authorUrl: '',
		copyright: '© Your Name',
		language: 'en'
	},
	photosDir: './photos'
};

const GITIGNORE_TEMPLATE = `node_modules
build
static/media
static/media-private
static/downloads
.svelte-kit
.cache/*
!.cache/private-tokens.json
`;

/** Creates revelar.config.ts, photos/ and .gitignore in `root` (existing files are kept). */
export function initSite(root: string, config: RevelarConfigInput = DEFAULT_CONFIG): string[] {
	mkdirSync(join(root, 'photos'), { recursive: true });
	const written: string[] = [];
	const write = (name: string, content: string) => {
		const path = join(root, name);
		if (existsSync(path)) return;
		writeFileSync(path, content);
		written.push(name);
	};
	write('revelar.config.ts', CONFIG_TEMPLATE(config));
	write('.gitignore', GITIGNORE_TEMPLATE);
	return written;
}

export function isSite(root: string): boolean {
	return existsSync(join(root, 'revelar.config.ts'));
}

/** Rewrites revelar.config.ts from a plain object (comments in a hand-written file are lost). */
export function saveConfig(root: string, input: RevelarConfigInput): void {
	writeFileSync(join(root, 'revelar.config.ts'), CONFIG_TEMPLATE(input));
}

export async function readConfig(root: string): Promise<RevelarConfig> {
	return loadConfig(join(root, 'revelar.config.ts'));
}

export function readManifest(root: string): Manifest | undefined {
	const path = join(root, '.cache', 'manifest.json');
	if (!existsSync(path)) return undefined;
	return JSON.parse(readFileSync(path, 'utf8')) as Manifest;
}

export type AlbumListing = {
	slug: string;
	folder: string;
	dir: string;
	/** files on disk (what the next ingest will process) */
	files: number;
	title: string;
	date?: string;
	visibility: 'public' | 'unlisted' | 'private';
	/** from the last ingest, if any */
	built?: { count: number; coverUrl: string; coverColor: string };
};

/** Albums on disk, with sidecar titles and, when an ingest has run, the built cover. */
export async function listAlbums(root: string): Promise<AlbumListing[]> {
	const config = await readConfig(root);
	const scanned = scanPhotos(resolve(root, config.photosDir), () => {});
	const manifest = readManifest(root);
	return scanned.map((album) => {
		const { sidecar } = loadSidecar(album.sidecarPath);
		const built = manifest?.albums.find((a) => a.slug === album.slug);
		return {
			slug: album.slug,
			folder: album.folder,
			dir: album.dir,
			files: album.files.length,
			title: sidecar.title ?? titleFromFolder(album),
			date: (sidecar.date as string | undefined) ?? album.folderDate,
			visibility: sidecar.visibility,
			built: built
				? {
						count: built.count,
						coverUrl: expandSources(built.cover.sources).jpeg,
						coverColor: built.cover.color
					}
				: undefined
		};
	});
}

function titleFromFolder(album: ScannedAlbum): string {
	const name = album.folder.replace(/^((?:19|20)\d{2})(?:-\d{2}(?:-\d{2})?)?[-_ ]+/, '');
	return name.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim() || album.slug;
}

export type AlbumDetail = {
	slug: string;
	folder: string;
	dir: string;
	files: { name: string; size: number }[];
	/** album.yaml as written (unknown keys preserved on save) */
	sidecar: Record<string, unknown>;
	/** validated view of the sidecar with defaults applied */
	settings: Sidecar;
	/** the built album, when an ingest has run */
	built?: Pick<AlbumSummary, 'count' | 'cover'> & {
		photos: (Pick<
			Photo,
			'id' | 'file' | 'title' | 'caption' | 'alt' | 'date' | 'width' | 'height' | 'color'
		> & { thumbUrl: string })[];
	};
};

export async function readAlbum(root: string, slug: string): Promise<AlbumDetail> {
	const config = await readConfig(root);
	const album = scanPhotos(resolve(root, config.photosDir), () => {}).find((a) => a.slug === slug);
	if (!album) throw new Error(`No album "${slug}" in ${config.photosDir}`);
	const raw = album.sidecarPath ? (parse(readFileSync(album.sidecarPath, 'utf8')) ?? {}) : {};
	const { sidecar } = loadSidecar(album.sidecarPath);
	const built = readManifest(root)?.albums.find((a) => a.slug === slug);
	return {
		slug,
		folder: album.folder,
		dir: album.dir,
		files: album.files.map((f) => ({ name: f.name, size: f.size })),
		sidecar: raw as Record<string, unknown>,
		settings: sidecar,
		built: built
			? {
					count: built.count,
					cover: built.cover,
					photos: built.photos.map((p) => ({
						id: p.id,
						file: p.file,
						title: p.title,
						caption: p.caption,
						alt: p.alt,
						date: p.date,
						width: p.width,
						height: p.height,
						color: p.color,
						thumbUrl: thumbUrl(p)
					}))
				}
			: undefined
	};
}

function thumbUrl(p: Photo): string {
	const s = expandSources(p.sources);
	return s.webp[0]?.url ?? s.jpeg;
}

/**
 * Merges `patch` into the album's album.yaml (creating it if needed) and writes it back. Keys
 * set to `undefined` or `''` are removed so the ingest defaults apply again.
 */
export async function saveAlbum(
	root: string,
	slug: string,
	patch: Record<string, unknown>
): Promise<void> {
	const config = await readConfig(root);
	const album = scanPhotos(resolve(root, config.photosDir), () => {}).find((a) => a.slug === slug);
	if (!album) throw new Error(`No album "${slug}" in ${config.photosDir}`);
	const path = album.sidecarPath ?? join(album.dir, 'album.yaml');
	const current = (existsSync(path) ? (parse(readFileSync(path, 'utf8')) ?? {}) : {}) as Record<
		string,
		unknown
	>;
	for (const [key, value] of Object.entries(patch)) {
		if (value === undefined || value === '') delete current[key];
		else if (key === 'photos' && typeof value === 'object' && value) {
			const photos = { ...((current.photos as Record<string, unknown>) ?? {}) };
			for (const [file, override] of Object.entries(value as Record<string, unknown>)) {
				const cleaned = Object.fromEntries(
					Object.entries((override ?? {}) as Record<string, unknown>).filter(
						([, v]) => v !== undefined && v !== ''
					)
				);
				if (Object.keys(cleaned).length) photos[file] = cleaned;
				else delete photos[file];
			}
			if (Object.keys(photos).length) current.photos = photos;
			else delete current.photos;
		} else current[key] = value;
	}
	writeFileSync(path, stringify(current));
}

const ACCEPTED = new Set([
	'.jpg',
	'.jpeg',
	'.png',
	'.webp',
	'.avif',
	'.tif',
	'.tiff',
	'.heic',
	'.heif'
]);

/**
 * Copies the photos of `sourceDir` into a new album folder under photos/ and returns its name.
 * `name` defaults to the source folder's name; a date prefix in it becomes the album date.
 */
export async function addAlbum(
	root: string,
	sourceDir: string,
	name = basename(sourceDir)
): Promise<{ folder: string; copied: number }> {
	const config = await readConfig(root);
	const folder = name.replace(/[/\\:]/g, '-').trim() || 'album';
	const dest = join(resolve(root, config.photosDir), folder);
	if (existsSync(dest)) throw new Error(`photos/${folder} already exists`);
	mkdirSync(dest, { recursive: true });
	let copied = 0;
	for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
		if (!entry.isFile() || entry.name.startsWith('.')) continue;
		if (!ACCEPTED.has(extname(entry.name).toLowerCase())) continue;
		copyFileSync(join(sourceDir, entry.name), join(dest, entry.name));
		copied++;
	}
	return { folder, copied };
}
