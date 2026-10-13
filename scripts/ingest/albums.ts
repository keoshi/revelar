import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	statSync,
	writeFileSync,
	readdirSync
} from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, extname, join, relative } from 'node:path';
import { marked } from 'marked';
import type pLimit from 'p-limit';
import type { RevelarConfig } from '../../src/lib/config.ts';
import type {
	AlbumSummary,
	Photo,
	PhotoRef,
	PrivateAlbumEntry,
	PrivateAlbumPayload
} from '../../src/lib/types.ts';
import { naturalCompare } from '../../src/lib/utils/text.ts';
import { expandSources } from '../../src/lib/utils/sources.ts';
import {
	PBKDF2_ITERATIONS,
	deriveKek,
	encryptWithKey,
	encryptedFileName,
	fromBase64,
	importDek,
	randomBytes,
	toBase64,
	toBase64Url,
	wrapDek
} from '../../src/lib/crypto/aes.ts';
import type { IngestCache, CacheEntry } from './cache.ts';
import { encodePhoto, settingsKey, writeGpsSafeOriginal } from './encode.ts';
import {
	mergeMetadata,
	readEmbeddedMetadata,
	type EmbeddedMeta,
	type MergedMeta
} from './metadata.ts';
import { loadSidecar, normaliseDate, type PhotoOverride, type Sidecar } from './sidecar.ts';
import type { ScannedAlbum, ScannedFile } from './scan.ts';
import { writeStoreZip } from './zip.ts';

export type Stats = {
	albums: number;
	photos: number;
	encoded: number;
	reused: number;
	encryptedFiles: number;
	zips: number;
};

export type PrivateKeyRecord = { dek: string; salt: string; pwHash: string };

export type Context = {
	config: RevelarConfig;
	cache: IngestCache;
	limit: ReturnType<typeof pLimit>;
	force: boolean;
	warn: (msg: string) => void;
	error: (msg: string) => void;
	stats: Stats;
	dirs: {
		root: string;
		static: string;
		media: string;
		mediaPrivate: string;
		downloads: string;
		privateDerivatives: string;
	};
	tokens: Record<string, string>;
	privateKeys: Record<string, PrivateKeyRecord>;
	/** slugs of albums declared private in this run (even if they failed), so their keys and files survive */
	privateSlugsSeen: Set<string>;
	/** every absolute path under static/ (or .cache/derivatives) that must survive pruning */
	keep: Set<string>;
};

type Processed = {
	file: ScannedFile;
	id: string;
	hash: string;
	entry: CacheEntry;
	meta: MergedMeta;
	override: PhotoOverride | undefined;
	/** index used for generated alt text; fixed after sorting */
	altGenerated: boolean;
};

export type AlbumResult =
	| { kind: 'public' | 'unlisted'; summary: AlbumSummary }
	| { kind: 'private'; entry: PrivateAlbumEntry }
	| { kind: 'skipped' };

const sha256 = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');

function keepDir(dir: string, keep: Set<string>): void {
	if (!existsSync(dir)) return;
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const p = join(dir, entry.name);
		if (entry.isDirectory()) keepDir(p, keep);
		else keep.add(p);
	}
}

export function photoId(rel: string): string {
	return sha256(rel).slice(0, 10);
}

function renderMarkdown(md: string | undefined): string | undefined {
	if (!md) return undefined;
	return (marked.parse(md, { async: false, gfm: true }) as string).trim();
}

function roundCoord(n: number, decimals: number): number {
	const f = 10 ** decimals;
	return Math.round(n * f) / f;
}

function findOverride(sidecar: Sidecar, file: ScannedFile): PhotoOverride | undefined {
	const photos = sidecar.photos;
	if (photos[file.name]) return photos[file.name];
	const lower = file.name.toLowerCase();
	const stem = lower.slice(0, lower.length - file.ext.length);
	for (const key of Object.keys(photos)) {
		const k = key.toLowerCase();
		if (k === lower || k === stem) return photos[key];
	}
	return undefined;
}

async function processFile(
	file: ScannedFile,
	outDir: string,
	urlPrefix: string,
	ctx: Context
): Promise<{ id: string; hash: string; entry: CacheEntry; fresh: boolean }> {
	const id = photoId(file.rel);
	const cached = ctx.cache.get(file.rel);
	let buffer: Buffer | undefined;
	let hash: string;
	if (cached && cached.size === file.size && cached.mtimeMs === file.mtimeMs && !ctx.force) {
		hash = cached.hash;
	} else {
		buffer = readFileSync(file.abs);
		hash = sha256(buffer);
	}
	const settings = `${settingsKey(ctx.config.images)}|${relative(ctx.dirs.root, outDir)}`;
	if (
		cached &&
		cached.hash === hash &&
		cached.settings === settings &&
		!ctx.force &&
		cached.derivatives.files.every((f) => existsSync(f))
	) {
		ctx.cache.touch(file.rel);
		ctx.stats.reused++;
		return { id, hash, entry: cached, fresh: false };
	}

	const embedded: EmbeddedMeta =
		cached && cached.hash === hash && !ctx.force
			? cached.embedded
			: await readEmbeddedMetadata(file.abs);
	const encoded = await encodePhoto({
		input: file.abs,
		outDir,
		urlPrefix,
		id,
		hash8: hash.slice(0, 8),
		images: ctx.config.images,
		force: ctx.force
	});
	const entry: CacheEntry = {
		hash,
		size: file.size,
		mtimeMs: file.mtimeMs,
		settings,
		width: encoded.width,
		height: encoded.height,
		thumbhash: encoded.thumbhash,
		color: encoded.color,
		embedded,
		derivatives: encoded.derivatives
	};
	ctx.cache.set(file.rel, entry);
	if (encoded.encoded > 0) ctx.stats.encoded++;
	else ctx.stats.reused++;
	return { id, hash, entry, fresh: true };
}

function sortProcessed(
	items: Processed[],
	sort: Sidecar['sort'] | RevelarConfig['defaults']['sort'],
	order: string[]
): Processed[] {
	const byName = (a: Processed, b: Processed) => naturalCompare(a.file.name, b.file.name);
	switch (sort) {
		case 'date-desc':
			return [...items].sort(
				(a, b) => (b.meta.date ?? '').localeCompare(a.meta.date ?? '') || byName(a, b)
			);
		case 'filename':
			return [...items].sort(byName);
		case 'manual': {
			const rank = new Map(order.map((name, i) => [name.toLowerCase(), i]));
			const indexOf = (p: Processed) =>
				rank.get(p.file.name.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
			return [...items].sort((a, b) => indexOf(a) - indexOf(b) || byName(a, b));
		}
		case 'date-asc':
		default:
			return [...items].sort(
				(a, b) => (a.meta.date ?? '').localeCompare(b.meta.date ?? '') || byName(a, b)
			);
	}
}

function toRef(p: Photo): PhotoRef {
	return {
		id: p.id,
		width: p.width,
		height: p.height,
		aspect: p.aspect,
		alt: p.alt,
		thumbhash: p.thumbhash,
		color: p.color,
		sources: p.sources
	};
}

type DownloadKind = 'none' | 'large' | 'original';

async function prepareDownload(
	p: Processed,
	kind: DownloadKind,
	locationSetting: 'show' | 'approximate' | 'hide',
	album: ScannedAlbum,
	downloadsDir: string,
	downloadsUrl: string,
	ctx: Context
): Promise<
	{ url: string; bytes: number; kind: 'large' | 'original'; file: string; name: string } | undefined
> {
	if (kind === 'none') return undefined;
	const jpeg = p.entry.derivatives.jpeg;
	if (kind === 'large') {
		const stem = p.file.name.slice(0, p.file.name.length - p.file.ext.length);
		return {
			url: jpeg.url,
			bytes: statSync(jpeg.file).size,
			kind: 'large',
			file: jpeg.file,
			name: `${stem}.jpg`
		};
	}
	mkdirSync(downloadsDir, { recursive: true });
	const hash8 = p.hash.slice(0, 8);
	if (locationSetting === 'show' || !p.entry.embedded.gps) {
		// Byte-for-byte copy of the original.
		const file = join(downloadsDir, `${p.id}-${hash8}${p.file.ext}`);
		if (ctx.force || !existsSync(file)) copyFileSync(p.file.abs, file);
		return {
			url: `${downloadsUrl}/${basename(file)}`,
			bytes: statSync(file).size,
			kind: 'original',
			file,
			name: p.file.name
		};
	}
	// GPS-safe re-encode: full resolution JPEG with copyright and camera fields only.
	const file = join(downloadsDir, `${p.id}-${hash8}-safe.jpg`);
	if (ctx.force || !existsSync(file)) {
		const ex = p.entry.embedded.exif ?? {};
		const shutter = ex.shutter?.match(/^1\/(\d+)/)
			? 1 / Number(ex.shutter.match(/^1\/(\d+)/)![1])
			: ex.shutter
				? Number.parseFloat(ex.shutter)
				: undefined;
		await writeGpsSafeOriginal(p.file.abs, file, {
			make: ex.make,
			model: ex.model,
			lens: ex.lens,
			artist: ctx.config.site.author || undefined,
			copyright: ctx.config.site.copyright || undefined,
			date: p.meta.date,
			focal: ex.focal,
			aperture: ex.aperture,
			exposureSeconds: shutter,
			iso: ex.iso,
			ev: ex.ev
		});
	}
	const stem = p.file.name.slice(0, p.file.name.length - p.file.ext.length);
	void album;
	return {
		url: `${downloadsUrl}/${basename(file)}`,
		bytes: statSync(file).size,
		kind: 'original',
		file,
		name: `${stem}.jpg`
	};
}

export async function processAlbum(album: ScannedAlbum, ctx: Context): Promise<AlbumResult> {
	const { config } = ctx;
	const { sidecar, error: sidecarError } = loadSidecar(album.sidecarPath);
	if (sidecarError) ctx.warn(`${sidecarError} (ignoring sidecar)`);

	const isPrivate = sidecar.visibility === 'private';
	let privateKey: { dek: Uint8Array; salt: Uint8Array; token: string } | undefined;
	if (isPrivate) {
		ctx.privateSlugsSeen.add(album.slug);
		// Whatever happens below, never prune this album's encrypted output on a failed run.
		const existingToken = ctx.tokens[album.slug];
		if (existingToken) keepDir(join(ctx.dirs.mediaPrivate, existingToken), ctx.keep);
		keepDir(join(ctx.dirs.privateDerivatives, album.slug), ctx.keep);
		const envName = sidecar.password_env;
		if (!envName) {
			ctx.error(`album "${album.folder}" is private but album.yaml has no password_env`);
			return { kind: 'skipped' };
		}
		const password = process.env[envName];
		if (!password) {
			ctx.error(
				`album "${album.folder}": environment variable ${envName} is not set (needed to encrypt the private album)`
			);
			return { kind: 'skipped' };
		}
		if (password.length < 16)
			ctx.warn(`album "${album.folder}": password in ${envName} is shorter than 16 characters`);
		const token = (ctx.tokens[album.slug] ??= toBase64Url(randomBytes(12)));
		const existing = ctx.privateKeys[album.slug];
		const saltForHash = existing ? fromBase64(existing.salt) : randomBytes(16);
		const pwHash = sha256(Buffer.concat([Buffer.from(saltForHash), Buffer.from(password, 'utf8')]));
		let dek: Uint8Array;
		let salt: Uint8Array;
		if (existing && existing.pwHash === pwHash) {
			dek = fromBase64(existing.dek);
			salt = fromBase64(existing.salt);
		} else {
			if (existing) ctx.warn(`album "${album.folder}": password changed; re-encrypting`);
			dek = randomBytes(32);
			salt = saltForHash;
			ctx.privateKeys[album.slug] = { dek: toBase64(dek), salt: toBase64(salt), pwHash };
		}
		privateKey = { dek, salt, token };
	}

	const outDir = isPrivate
		? join(ctx.dirs.privateDerivatives, album.slug)
		: join(ctx.dirs.media, album.slug);
	const urlPrefix = `/media/${album.slug}`;
	const downloadsDir = isPrivate
		? join(ctx.dirs.privateDerivatives, album.slug, 'downloads')
		: join(ctx.dirs.downloads, album.slug);
	const downloadsUrl = `/downloads/${album.slug}`;

	// Process every file (bounded concurrency), keeping cache entries alive for pruning.
	const results = await Promise.all(
		album.files.map((file) =>
			ctx.limit(async () => {
				try {
					return { file, ...(await processFile(file, outDir, urlPrefix, ctx)) };
				} catch (e) {
					ctx.warn(`${file.rel}: ${(e as Error).message}; skipped`);
					return undefined;
				}
			})
		)
	);

	const albumTitle =
		sidecar.title?.trim() ||
		album.folder.replace(/^(?:19|20)\d{2}(?:-\d{2}-\d{2})?-/, '').replace(/[-_]+/g, ' ');
	const items: Processed[] = [];
	for (const r of results) {
		if (!r) continue;
		const override = findOverride(sidecar, r.file);
		if (override?.hidden) continue;
		const meta = mergeMetadata(r.entry.embedded, override, {
			mtimeMs: r.file.mtimeMs,
			altFallback: () => `Photo in ${albumTitle}`
		});
		items.push({
			file: r.file,
			id: r.id,
			hash: r.hash,
			entry: r.entry,
			meta,
			override,
			altGenerated: meta.altGenerated
		});
	}
	if (items.length === 0) {
		ctx.warn(`album "${album.folder}" has no visible photos; skipped`);
		return { kind: 'skipped' };
	}

	const sorted = sortProcessed(items, sidecar.sort ?? config.defaults.sort, sidecar.order);
	const total = sorted.length;
	const albumLocation = sidecar.location ?? config.defaults.location;
	const albumDownloads: DownloadKind = sidecar.downloads ?? config.defaults.downloads;
	const exifPanel = sidecar.exif_panel ?? config.defaults.exifPanel;

	const photos: Photo[] = [];
	const downloadEntries: { path: string; name: string; bytes: number }[] = [];
	for (let i = 0; i < sorted.length; i++) {
		const p = sorted[i];
		if (p.altGenerated) {
			p.meta.alt = `Photo ${i + 1} of ${total} in ${albumTitle}`;
			ctx.warn(`${p.file.rel}: no alt text in metadata or sidecar; using "${p.meta.alt}"`);
		}
		const location = p.override?.location ?? albumLocation;
		const downloads: DownloadKind = p.override?.downloads ?? albumDownloads;
		const d = p.entry.derivatives;
		const photo: Photo = {
			id: p.id,
			file: p.file.name,
			width: p.entry.width,
			height: p.entry.height,
			aspect: Math.round((p.entry.width / p.entry.height) * 10000) / 10000,
			alt: p.meta.alt ?? '',
			keywords: p.meta.keywords,
			thumbhash: p.entry.thumbhash,
			color: p.entry.color,
			sources: { avif: d.avif, webp: d.webp, jpeg: d.jpeg.url }
		};
		if (p.meta.title) photo.title = p.meta.title;
		if (p.meta.caption) photo.caption = p.meta.caption;
		if (p.meta.date) photo.date = p.meta.date;
		if (p.meta.exif) photo.exif = p.meta.exif;
		if (p.meta.gps && location !== 'hide') {
			const decimals = location === 'show' ? 5 : 2;
			photo.gps = {
				lat: roundCoord(p.meta.gps.lat, decimals),
				lng: roundCoord(p.meta.gps.lng, decimals),
				precision: location === 'show' ? 'exact' : 'approximate'
			};
		}
		const download = await prepareDownload(
			p,
			downloads,
			location,
			album,
			downloadsDir,
			downloadsUrl,
			ctx
		);
		if (download) {
			photo.download = { url: download.url, bytes: download.bytes, kind: download.kind };
			downloadEntries.push({ path: download.file, name: download.name, bytes: download.bytes });
			ctx.keep.add(download.file);
		}
		for (const f of d.files) ctx.keep.add(f);
		photos.push(photo);
	}

	// Album-level data
	const dates = photos
		.map((p) => p.date)
		.filter((d): d is string => Boolean(d))
		.sort();
	const albumDate = normaliseDate(sidecar.date) ?? album.folderDate ?? dates[0];
	const dateRange = dates.length ? { from: dates[0], to: dates[dates.length - 1] } : undefined;
	const coverName = sidecar.cover?.toLowerCase();
	const cover = (coverName && photos.find((p) => p.file.toLowerCase() === coverName)) || photos[0];
	if (coverName && cover === photos[0] && photos[0].file.toLowerCase() !== coverName) {
		ctx.warn(`album "${album.folder}": cover "${sidecar.cover}" not found; using first photo`);
	}
	const gpsPhotos = photos.filter((p) => p.gps);
	const bounds: AlbumSummary['bounds'] | undefined = gpsPhotos.length
		? [
				[
					Math.min(...gpsPhotos.map((p) => p.gps!.lng)),
					Math.min(...gpsPhotos.map((p) => p.gps!.lat))
				],
				[
					Math.max(...gpsPhotos.map((p) => p.gps!.lng)),
					Math.max(...gpsPhotos.map((p) => p.gps!.lat))
				]
			]
		: undefined;
	const descriptionHtml = renderMarkdown(sidecar.description);

	// Album download (zip)
	const totalDownloadBytes = downloadEntries.reduce((n, e) => n + e.bytes, 0);
	let albumDownload: AlbumSummary['albumDownload'];
	if (albumDownloads !== 'none' && downloadEntries.length > 0) {
		const maxZip = config.defaults.maxZipBytes;
		if (isPrivate || (maxZip !== undefined && totalDownloadBytes > maxZip)) {
			albumDownload = { inBrowser: true, bytes: totalDownloadBytes, files: downloadEntries.length };
		} else {
			const zipHash = sha256(
				downloadEntries.map((e) => `${e.name}:${basename(e.path)}`).join('\n')
			).slice(0, 8);
			const zipPath = join(ctx.dirs.downloads, `${album.slug}-${zipHash}.zip`);
			let bytes: number;
			if (!ctx.force && existsSync(zipPath)) bytes = statSync(zipPath).size;
			else {
				bytes = await writeStoreZip(zipPath, downloadEntries);
				ctx.stats.zips++;
			}
			ctx.keep.add(zipPath);
			albumDownload = {
				url: `/downloads/${basename(zipPath)}`,
				bytes,
				files: downloadEntries.length
			};
		}
	}

	ctx.stats.albums++;
	ctx.stats.photos += photos.length;

	if (!isPrivate) {
		const summary: AlbumSummary = {
			slug: album.slug,
			title: albumTitle,
			visibility: sidecar.visibility === 'unlisted' ? 'unlisted' : 'public',
			cover: toRef(cover),
			count: photos.length,
			photos,
			exifPanel,
			downloads: albumDownloads
		};
		if (sidecar.description) summary.description = sidecar.description;
		if (descriptionHtml) summary.descriptionHtml = descriptionHtml;
		if (albumDate) summary.date = albumDate;
		if (dateRange) summary.dateRange = dateRange;
		if (bounds) summary.bounds = bounds;
		if (albumDownload) summary.albumDownload = albumDownload;
		return { kind: summary.visibility, summary };
	}

	// Private album: encrypt every derivative and download file, then the manifest slice.
	const { dek, salt, token } = privateKey!;
	const key = await importDek(dek, ['encrypt']);
	const encDir = join(ctx.dirs.mediaPrivate, token);
	mkdirSync(encDir, { recursive: true });
	const urlMap = new Map<string, string>();
	const encryptFile = async (plainPath: string, plainUrl: string) => {
		if (urlMap.has(plainUrl)) return;
		const name = `${await encryptedFileName(dek, relative(ctx.dirs.root, plainPath))}.bin`;
		const encPath = join(encDir, name);
		if (ctx.force || !existsSync(encPath)) {
			const data = await encryptWithKey(key, new Uint8Array(readFileSync(plainPath)));
			writeFileSync(encPath, data);
			ctx.stats.encryptedFiles++;
		}
		ctx.keep.add(encPath);
		urlMap.set(plainUrl, `/media-private/${token}/${name}`);
	};
	for (const photo of photos) {
		const d = sorted.find((p) => p.id === photo.id)!.entry.derivatives;
		for (const s of [...d.avif, ...d.webp]) {
			const file = d.files.find((f) => f.endsWith(basename(s.url)))!;
			await encryptFile(file, s.url);
		}
		await encryptFile(d.jpeg.file, d.jpeg.url);
		if (photo.download) {
			const entry = downloadEntries.find((e) => photo.download!.url.endsWith(basename(e.path)))!;
			await encryptFile(entry.path, photo.download.url);
		}
	}
	const remap = (url: string) => urlMap.get(url) ?? url;
	const privatePhotos: Photo[] = photos.map((p) => {
		const src = expandSources(p.sources);
		return {
			...p,
			sources: {
				avif: src.avif.map((s) => ({ ...s, url: remap(s.url) })),
				webp: src.webp.map((s) => ({ ...s, url: remap(s.url) })),
				jpeg: remap(src.jpeg)
			},
			download: p.download ? { ...p.download, url: remap(p.download.url) } : undefined
		};
	});
	const payload: PrivateAlbumPayload = {
		slug: album.slug,
		title: albumTitle,
		count: privatePhotos.length,
		photos: privatePhotos,
		exifPanel,
		downloads: albumDownloads
	};
	if (sidecar.description) payload.description = sidecar.description;
	if (descriptionHtml) payload.descriptionHtml = descriptionHtml;
	if (albumDate) payload.date = albumDate;
	if (dateRange) payload.dateRange = dateRange;
	if (bounds) payload.bounds = bounds;
	if (albumDownload && 'inBrowser' in albumDownload) payload.albumDownload = albumDownload;

	const blob = await encryptWithKey(key, new TextEncoder().encode(JSON.stringify(payload)));
	const password = process.env[sidecar.password_env!]!;
	const kek = await deriveKek(password, salt, PBKDF2_ITERATIONS);
	const wrapped = await wrapDek(dek, kek);
	const entry: PrivateAlbumEntry = {
		slug: album.slug,
		token,
		blob: toBase64(blob),
		salt: toBase64(salt),
		iterations: PBKDF2_ITERATIONS,
		wrappedKey: toBase64(wrapped)
	};
	if (config.privacy.showPrivateTitles) entry.title = albumTitle;
	return { kind: 'private', entry };
}

export function sortAlbums(albums: AlbumSummary[], config: RevelarConfig): AlbumSummary[] {
	const dateOf = (a: AlbumSummary) => a.date ?? a.dateRange?.to ?? '';
	const byDateDesc = (a: AlbumSummary, b: AlbumSummary) =>
		dateOf(b).localeCompare(dateOf(a)) || naturalCompare(a.title, b.title);
	switch (config.albumOrder) {
		case 'date-asc':
			return [...albums].sort(
				(a, b) => dateOf(a).localeCompare(dateOf(b)) || naturalCompare(a.title, b.title)
			);
		case 'title':
			return [...albums].sort((a, b) => naturalCompare(a.title, b.title));
		case 'manual': {
			const rank = new Map(config.albumManualOrder.map((slug, i) => [slug, i]));
			const r = (a: AlbumSummary) => rank.get(a.slug) ?? Number.MAX_SAFE_INTEGER;
			return [...albums].sort((a, b) => r(a) - r(b) || byDateDesc(a, b));
		}
		case 'date-desc':
		default:
			return [...albums].sort(byDateDesc);
	}
}

export { extname };
