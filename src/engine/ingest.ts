import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { join, resolve } from 'node:path';
import pLimit from 'p-limit';
import { loadConfig, PACKAGE_ROOT, siteRoot } from './config.ts';
import { validateConfig, type RevelarConfigInput } from '../lib/config.ts';
import { scanPhotos } from './scan.ts';
import { IngestCache, readJsonFile, writeJsonFile } from './cache.ts';
import {
	processAlbum,
	sortAlbums,
	type Context,
	type PrivateKeyRecord,
	type Stats
} from './albums.ts';
import { dirBytes, pruneDir } from './prune.ts';
import { formatBytes } from '../lib/utils/text.ts';
import type { AlbumSummary, Manifest, PrivateAlbumEntry } from '../lib/types.ts';

/** Progress and log events, for callers with their own UI (the desktop app, a CI reporter). */
export type IngestEvent =
	| { type: 'log'; level: 'info' | 'warn' | 'error'; message: string }
	| { type: 'progress'; slug: string; done: number; total: number }
	| { type: 'album'; slug: string; count?: number; private?: boolean };

export type IngestOptions = {
	force?: boolean;
	/** no console output (events are still emitted) */
	quiet?: boolean;
	root?: string;
	config?: RevelarConfigInput;
	onEvent?: (event: IngestEvent) => void;
};
export type IngestReport = {
	manifest: Manifest;
	stats: Stats;
	removed: number;
	warnings: string[];
	errors: string[];
	ms: number;
	bytes: number;
};

export async function runIngest(opts: IngestOptions = {}): Promise<IngestReport> {
	const started = performance.now();
	// Always absolute: cache entries and the prune keep-set store derivative paths, and a
	// relative root would make them disagree with a later run that passes an absolute one.
	const root = resolve(opts.root ?? siteRoot());
	const emit = opts.onEvent ?? (() => {});
	const log = (msg: string) => {
		emit({ type: 'log', level: 'info', message: msg });
		if (!opts.quiet) console.log(msg);
	};
	const warnings: string[] = [];
	const errors: string[] = [];
	const warn = (msg: string) => {
		warnings.push(msg);
		emit({ type: 'log', level: 'warn', message: msg });
		if (!opts.quiet) console.warn(`  warn  ${msg}`);
	};
	const error = (msg: string) => {
		errors.push(msg);
		emit({ type: 'log', level: 'error', message: msg });
		console.error(`  error ${msg}`);
	};

	// Encoding a large album can take minutes; show where it is. A TTY gets a line updated in
	// place, anything else (CI logs) a line every 25 files.
	const tty = !opts.quiet && Boolean(process.stdout.isTTY);
	const progress = (slug: string, done: number, total: number) => {
		emit({ type: 'progress', slug, done, total });
		if (opts.quiet) return;
		if (tty) {
			process.stdout.write(`\r  ${slug.padEnd(28)} ${done}/${total}`);
			if (done === total) process.stdout.write(`\r${' '.repeat(32 + String(total).length * 2)}\r`);
		} else if (done % 25 === 0 && done < total) log(`  ${slug.padEnd(28)} ${done}/${total}`);
	};

	// The config belongs to the root being ingested (REVELAR_CONFIG still overrides, for the e2e suite).
	const config = opts.config
		? validateConfig(opts.config)
		: await loadConfig(process.env.REVELAR_CONFIG ? undefined : join(root, 'revelar.config.ts'));
	const photosDir = resolve(root, config.photosDir);
	const dirs = {
		root,
		static: join(root, 'static'),
		media: join(root, 'static', 'media'),
		mediaPrivate: join(root, 'static', 'media-private'),
		downloads: join(root, 'static', 'downloads'),
		privateDerivatives: join(root, '.cache', 'derivatives')
	};
	const cacheDir = join(root, '.cache');
	mkdirSync(cacheDir, { recursive: true });
	// The package's default static files (cache headers) unless the site root has its own.
	mkdirSync(dirs.static, { recursive: true });
	const headers = join(dirs.static, '_headers');
	if (!existsSync(headers)) copyFileSync(join(PACKAGE_ROOT, 'static', '_headers'), headers);

	const cache = new IngestCache(join(cacheDir, 'ingest.json'));
	const tokensPath = join(cacheDir, 'private-tokens.json');
	const keysPath = join(cacheDir, 'private-keys.json');
	const tokens = readJsonFile<Record<string, string>>(tokensPath, {});
	const privateKeys = readJsonFile<Record<string, PrivateKeyRecord>>(keysPath, {});

	const ctx: Context = {
		config,
		cache,
		limit: pLimit(Math.max(1, cpus().length - 1)),
		force: Boolean(opts.force),
		warn,
		error,
		progress,
		stats: { albums: 0, photos: 0, encoded: 0, reused: 0, encryptedFiles: 0, zips: 0 },
		dirs,
		tokens,
		privateKeys,
		privateSlugsSeen: new Set(),
		keep: new Set()
	};

	log(`Revelar ingest · ${photosDir}`);
	const scanned = scanPhotos(photosDir, warn);
	const albums: AlbumSummary[] = [];
	const privateAlbums: PrivateAlbumEntry[] = [];

	for (const album of scanned) {
		const result = await processAlbum(album, ctx);
		if (result.kind === 'public' || result.kind === 'unlisted') albums.push(result.summary);
		else if (result.kind === 'private') {
			privateAlbums.push(result.entry);
		}
		if (result.kind !== 'skipped') {
			const count = result.kind === 'private' ? '(private)' : `${result.summary.count} photos`;
			emit(
				result.kind === 'private'
					? { type: 'album', slug: album.slug, private: true }
					: { type: 'album', slug: album.slug, count: result.summary.count }
			);
			if (!opts.quiet) console.log(`  ${album.slug.padEnd(28)} ${count}`);
		}
	}

	const manifest: Manifest = {
		generatedAt: new Date().toISOString(),
		site: { title: config.site.title, baseUrl: config.site.baseUrl.replace(/\/$/, '') },
		albums: sortAlbums(albums, config),
		privateAlbums
	};

	// The manifest is read by the site's server loads at build time (src/lib/server/manifest.ts).
	writeFileSync(join(cacheDir, 'manifest.json'), JSON.stringify(manifest));

	// Prune unreferenced derivatives, then persist caches.
	const removed = [
		...pruneDir(dirs.media, ctx.keep),
		...pruneDir(dirs.mediaPrivate, ctx.keep),
		...pruneDir(dirs.downloads, ctx.keep),
		...pruneDir(dirs.privateDerivatives, ctx.keep)
	];
	cache.save();
	for (const slug of Object.keys(privateKeys))
		if (!ctx.privateSlugsSeen.has(slug)) delete privateKeys[slug];
	writeJsonFile(tokensPath, tokens);
	writeJsonFile(keysPath, privateKeys);

	if (privateAlbums.length) {
		log('Private albums (password-protected; `npm run share <slug>` prints the key link):');
		for (const [slug, token] of Object.entries(tokens)) {
			if (ctx.privateSlugsSeen.has(slug))
				log(`  ${slug.padEnd(28)} ${manifest.site.baseUrl}/p/${token}/`);
		}
	}

	const ms = Math.round(performance.now() - started);
	const bytes = dirBytes(dirs.media) + dirBytes(dirs.mediaPrivate) + dirBytes(dirs.downloads);
	const s = ctx.stats;
	log(
		`Done: ${s.albums} albums, ${s.photos} photos · ${s.encoded} encoded, ${s.reused} reused, ${removed.length} removed` +
			(s.encryptedFiles ? ` · ${s.encryptedFiles} files encrypted` : '') +
			(s.zips ? ` · ${s.zips} zips` : '') +
			` · ${warnings.length} warnings · ${formatBytes(bytes)} · ${(ms / 1000).toFixed(1)} s`
	);
	return { manifest, stats: s, removed: removed.length, warnings, errors, ms, bytes };
}
