import { readdirSync, statSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import sharp from 'sharp';
import { slugify, naturalCompare } from '../../src/lib/utils/text.ts';

export type ScannedFile = {
	abs: string;
	/** `<album folder>/<file name>`, used for the stable photo id */
	rel: string;
	name: string;
	ext: string;
	size: number;
	mtimeMs: number;
};

export type ScannedAlbum = {
	folder: string;
	dir: string;
	slug: string;
	folderDate?: string;
	files: ScannedFile[];
	sidecarPath?: string;
};

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
const HEIC = new Set(['.heic', '.heif']);
const RESERVED_SLUGS = new Set(['p', 'map', 'rss.xml', 'sitemap.xml', 'robots.txt', '404', '_app']);

export function heicSupported(): boolean {
	return Boolean(sharp.format.heif?.input?.file);
}

/** Split `2025-03-14-lisbon` / `2025-lisbon` into a date and the remaining name. */
export function parseFolderName(folder: string): { name: string; date?: string } {
	const full = folder.match(/^((?:19|20)\d{2})-(\d{2})-(\d{2})-(.+)$/);
	if (full) return { name: full[4], date: `${full[1]}-${full[2]}-${full[3]}` };
	const year = folder.match(/^((?:19|20)\d{2})-(.+)$/);
	if (year) return { name: year[2], date: year[1] };
	return { name: folder };
}

export function scanPhotos(photosDir: string, warn: (msg: string) => void): ScannedAlbum[] {
	const root = resolve(photosDir);
	let entries;
	try {
		entries = readdirSync(root, { withFileTypes: true });
	} catch {
		warn(`photos directory not found: ${root}`);
		return [];
	}
	const albums: ScannedAlbum[] = [];
	const seenSlugs = new Map<string, string>();
	const heicOk = heicSupported();

	for (const entry of entries.sort((a, b) => naturalCompare(a.name, b.name))) {
		if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
		if (!entry.isDirectory()) {
			if (ACCEPTED.has(extname(entry.name).toLowerCase())) {
				warn(`ignoring ${entry.name}: files directly in photos/ are not part of any album`);
			}
			continue;
		}
		const dir = join(root, entry.name);
		const { name, date } = parseFolderName(entry.name);
		let slug = slugify(name) || slugify(entry.name) || 'album';
		if (RESERVED_SLUGS.has(slug)) {
			warn(`album "${entry.name}" uses the reserved slug "${slug}"; renamed to "${slug}-album"`);
			slug = `${slug}-album`;
		}
		if (seenSlugs.has(slug)) {
			warn(`album "${entry.name}" has the same slug as "${seenSlugs.get(slug)}"; skipping`);
			continue;
		}
		seenSlugs.set(slug, entry.name);

		const files: ScannedFile[] = [];
		let sidecarPath: string | undefined;
		for (const f of readdirSync(dir, { withFileTypes: true })) {
			if (!f.isFile()) continue;
			if (f.name === 'album.yaml' || f.name === 'album.yml') {
				sidecarPath = join(dir, f.name);
				continue;
			}
			if (f.name.startsWith('.') || f.name.startsWith('_')) continue;
			const ext = extname(f.name).toLowerCase();
			if (!ACCEPTED.has(ext)) continue;
			if (HEIC.has(ext) && !heicOk) {
				warn(`${entry.name}/${f.name}: HEIC is not supported by this sharp build; skipped`);
				continue;
			}
			const abs = join(dir, f.name);
			const st = statSync(abs);
			files.push({
				abs,
				rel: `${entry.name}/${f.name}`,
				name: basename(f.name),
				ext,
				size: st.size,
				mtimeMs: st.mtimeMs
			});
		}
		files.sort((a, b) => naturalCompare(a.name, b.name));
		if (files.length === 0) {
			warn(`album "${entry.name}" has no accepted photos; skipped`);
			continue;
		}
		albums.push({ folder: entry.name, dir, slug, folderDate: date, files, sidecarPath });
	}
	return albums;
}
