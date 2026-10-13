import { beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import exifr from 'exifr';
import sharp from 'sharp';
import { generateFixtures } from '../fixtures/generate.ts';
import { runIngest, type IngestReport } from '../../src/engine/ingest.ts';
import { parseFolderName } from '../../src/engine/scan.ts';
import type { AlbumSummary } from '../../src/lib/types.ts';
import type { RevelarConfigInput } from '../../src/lib/config.ts';
import { expandSources } from '../../src/lib/utils/sources.ts';

const config: RevelarConfigInput = {
	site: { title: 'Test', baseUrl: 'https://example.com' },
	photosDir: './photos',
	defaults: { downloads: 'none', location: 'approximate' },
	images: { widths: [320, 640, 960, 1280, 1920] }
};

let root: string;
let first: IngestReport;
let lisbon: AlbumSummary;

beforeAll(async () => {
	root = mkdtempSync(join(tmpdir(), 'revelar-'));
	await generateFixtures(join(root, 'photos'));
	first = await runIngest({ root, config, quiet: true });
	lisbon = first.manifest.albums.find((a) => a.slug === 'lisbon-walks')!;
}, 120_000);

describe('parseFolderName', () => {
	it('splits date prefixes of any precision from the album name', () => {
		expect(parseFolderName('2025-03-14-lisbon-walks')).toEqual({
			name: 'lisbon-walks',
			date: '2025-03-14'
		});
		expect(parseFolderName('2026-10 Porto-Vigo')).toEqual({ name: 'Porto-Vigo', date: '2026-10' });
		expect(parseFolderName('2025_lisbon')).toEqual({ name: 'lisbon', date: '2025' });
		expect(parseFolderName('2024-100-photos')).toEqual({ name: '100-photos', date: '2024' });
		expect(parseFolderName('Porto')).toEqual({ name: 'Porto' });
	});
});

describe('scan', () => {
	it('turns subfolders into albums and ignores drafts and stray files', () => {
		expect(first.manifest.albums.map((a) => a.slug).sort()).toEqual(['iceland', 'lisbon-walks']);
		expect(first.warnings.some((w) => w.includes('stray.jpg'))).toBe(true);
	});

	it('strips the date prefix from the slug and uses it as the album date', () => {
		expect(lisbon.date).toBe('2025-03-14');
		const iceland = first.manifest.albums.find((a) => a.slug === 'iceland')!;
		expect(iceland.date).toBe('2024');
		expect(iceland.title).toBe('iceland');
	});

	it('orders albums newest first by default', () => {
		expect(first.manifest.albums[0].slug).toBe('lisbon-walks');
	});
});

describe('metadata precedence', () => {
	const byFile = (name: string) => lisbon.photos.find((p) => p.file === name)!;

	it('reads XMP title, caption, alt, keywords and date', () => {
		const p = byFile('landscape.jpg');
		expect(p.title).toBe('Tram 28 at dawn');
		expect(p.caption).toBe('The first tram, before the tourists.');
		expect(p.alt).toBe('Yellow tram climbing a narrow cobbled street at sunrise');
		expect(p.keywords).toEqual(['lisbon', 'tram']);
		expect(p.date).toBe('2025-03-14T07:12:00');
		expect(p.exif).toMatchObject({
			make: 'SONY',
			model: 'ILCE-7M4',
			lens: 'FE 35mm F1.8',
			focal: 35,
			aperture: 2.8,
			shutter: '1/250 s',
			iso: 400,
			ev: -0.3
		});
	});

	it('falls back to IPTC fields when there is no XMP', () => {
		const p = byFile('iptc.jpg');
		expect(p.title).toBe('Miradouro');
		expect(p.caption).toBe('Looking over Alfama from Graça.');
		expect(p.keywords).toEqual(['alfama', 'viewpoint']);
		expect(p.date).toBe('2025-03-16T10:15:00');
		expect(p.alt).toBe('Looking over Alfama from Graça.');
	});

	it('uses EXIF ImageDescription as a last resort for captions', () => {
		expect(byFile('gps.jpg').caption).toBe('EXIF description only');
	});

	it('lets the sidecar override embedded metadata', () => {
		const p = byFile('override.jpg');
		expect(p.title).toBe('Sidecar title');
		expect(p.caption).toBe('Sidecar caption wins.');
		expect(p.alt).toBe('Sidecar alt text');
	});

	it('never invents titles from filenames and generates alt text with a warning', () => {
		const p = byFile('plain.png');
		expect(p.title).toBeUndefined();
		expect(p.alt).toMatch(/^Photo \d of \d in Lisbon walks$/);
		expect(first.warnings.some((w) => w.includes('plain.png') && w.includes('alt'))).toBe(true);
	});

	it('uses the file mtime when nothing else has a date', () => {
		expect(byFile('plain.png').date).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});
});

describe('album assembly', () => {
	it('applies sidecar title, markdown description, cover and sort', () => {
		expect(lisbon.title).toBe('Lisbon walks');
		expect(lisbon.descriptionHtml).toContain('<strong>Alfama</strong>');
		expect(lisbon.cover.id).toBe(lisbon.photos.find((p) => p.file === 'portrait.jpg')!.id);
		const dated = lisbon.photos.filter((p) => p.file !== 'plain.png').map((p) => p.date!);
		expect([...dated].sort()).toEqual(dated);
	});

	it('gives every photo a stable 10-character id and exact dimensions', () => {
		for (const p of lisbon.photos) {
			expect(p.id).toMatch(/^[0-9a-f]{10}$/);
			expect(p.width).toBeGreaterThan(0);
			expect(p.aspect).toBeCloseTo(p.width / p.height, 3);
		}
	});

	it('bakes EXIF orientation into width/height', () => {
		const p = lisbon.photos.find((p) => p.file === 'rotated.jpg')!;
		expect(p.width).toBe(800);
		expect(p.height).toBe(1200);
	});
});

describe('derivatives', () => {
	it('never upscales and includes the original width when it is below the largest configured width', () => {
		const p = lisbon.photos.find((p) => p.file === 'portrait.jpg')!; // 900 px wide
		const src = expandSources(p.sources);
		expect(src.avif.map((s) => s.width)).toEqual([320, 640, 900]);
		expect(src.webp.map((s) => s.width)).toEqual([320, 640, 900]);
		expect(src.jpeg).toMatch(/-900\.jpg$/);
	});

	it('writes AVIF and WebP files under static/media/<album>/', () => {
		const dir = join(root, 'static', 'media', 'lisbon-walks');
		const files = readdirSync(dir);
		expect(files.some((f) => f.endsWith('.avif'))).toBe(true);
		expect(files.some((f) => f.endsWith('.webp'))).toBe(true);
		expect(files.some((f) => f.endsWith('.jpg'))).toBe(true);
	});

	it('has a thumbhash and average colour for each photo', () => {
		for (const p of lisbon.photos) {
			expect(p.thumbhash.length).toBeGreaterThan(10);
			expect(p.color).toMatch(/^#[0-9a-f]{6}$/);
		}
	});

	it('strips GPS and all other metadata from every derivative, keeping only an sRGB ICC profile', async () => {
		const gps = lisbon.photos.find((p) => p.file === 'gps.jpg')!;
		const dir = join(root, 'static', 'media', 'lisbon-walks');
		const files = readdirSync(dir).filter((f) => f.startsWith(gps.id));
		expect(files.length).toBeGreaterThan(3);
		for (const f of files) {
			const buf = readFileSync(join(dir, f));
			const meta = await sharp(buf).metadata();
			expect(meta.exif, f).toBeUndefined();
			expect(meta.xmp, f).toBeUndefined();
			expect(meta.icc, f).toBeDefined();
			if (!f.endsWith('.webp')) {
				const parsed = await exifr
					.parse(buf, { gps: true, tiff: true, xmp: true })
					.catch(() => undefined);
				expect(parsed?.latitude, f).toBeUndefined();
				expect(parsed?.GPSLatitude, f).toBeUndefined();
			}
		}
	});
});

describe('GPS privacy', () => {
	it('rounds approximate coordinates to 2 decimals and marks them', () => {
		const p = lisbon.photos.find((p) => p.file === 'gps.jpg')!;
		expect(p.gps).toBeDefined();
		expect(p.gps!.precision).toBe('approximate');
		expect(String(p.gps!.lat).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(2);
		expect(String(p.gps!.lng).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(2);
		expect(lisbon.bounds).toBeDefined();
	});

	it('omits coordinates entirely for hide', async () => {
		// override.jpg has location: hide in the sidecar but no GPS; use a dedicated run with hide as site default
		const report = await runIngest({
			root,
			config: { ...config, defaults: { downloads: 'none', location: 'hide' } },
			quiet: true
		});
		const album = report.manifest.albums.find((a) => a.slug === 'lisbon-walks')!;
		expect(album.photos.every((p) => p.gps === undefined)).toBe(true);
		expect(album.bounds).toBeUndefined();
	});

	it('lets album.yaml override the site-wide location setting', async () => {
		const sidecar = join(root, 'photos', '2025-03-14-lisbon-walks', 'album.yaml');
		const original = readFileSync(sidecar, 'utf8');
		writeFileSync(sidecar, original + 'location: hide\n');
		try {
			const report = await runIngest({
				root,
				config: { ...config, defaults: { downloads: 'none', location: 'show' } },
				quiet: true
			});
			const album = report.manifest.albums.find((a) => a.slug === 'lisbon-walks')!;
			expect(album.photos.find((p) => p.file === 'gps.jpg')!.gps).toBeUndefined();
		} finally {
			writeFileSync(sidecar, original);
		}
	});

	it('keeps 5 decimals for show', async () => {
		const report = await runIngest({
			root,
			config: { ...config, defaults: { downloads: 'none', location: 'show' } },
			quiet: true
		});
		const p = report.manifest.albums
			.find((a) => a.slug === 'lisbon-walks')!
			.photos.find((p) => p.file === 'gps.jpg')!;
		expect(p.gps!.precision).toBe('exact');
		expect(p.gps!.lat).toBeCloseTo(38.71389, 5);
	});
});

describe('incremental cache', () => {
	it('reuses every derivative on a second run and is fast', async () => {
		const second = await runIngest({ root, config, quiet: true });
		expect(second.stats.encoded).toBe(0);
		expect(second.stats.reused).toBe(first.stats.photos);
		expect(second.ms).toBeLessThan(2000);
		expect(second.manifest.albums.map((a) => a.photos.map((p) => p.sources))).toEqual(
			first.manifest.albums.map((a) => a.photos.map((p) => p.sources))
		);
	});

	it('re-encodes an edited file with a new content hash and prunes the old derivatives', async () => {
		const file = join(root, 'photos', '2024-iceland', '002.jpg');
		const before = first.manifest.albums
			.find((a) => a.slug === 'iceland')!
			.photos.find((p) => p.file === '002.jpg')!;
		const edited = await sharp(file).modulate({ brightness: 1.2 }).jpeg().toBuffer();
		writeFileSync(file, edited);
		const report = await runIngest({ root, config, quiet: true });
		const after = report.manifest.albums
			.find((a) => a.slug === 'iceland')!
			.photos.find((p) => p.file === '002.jpg')!;
		expect(after.id).toBe(before.id);
		expect(expandSources(after.sources).jpeg).not.toBe(expandSources(before.sources).jpeg);
		expect(report.stats.encoded).toBe(1);
		expect(report.removed).toBeGreaterThan(0);
		const dir = join(root, 'static', 'media', 'iceland');
		expect(readdirSync(dir).some((f) => expandSources(before.sources).jpeg.endsWith(f))).toBe(
			false
		);
	});
});

describe('downloads', () => {
	it('re-encodes originals without GPS when location is approximate, and zips the album', async () => {
		const report = await runIngest({
			root,
			config: { ...config, defaults: { downloads: 'original', location: 'approximate' } },
			quiet: true
		});
		const album = report.manifest.albums.find((a) => a.slug === 'lisbon-walks')!;
		const gps = album.photos.find((p) => p.file === 'gps.jpg')!;
		expect(gps.download?.kind).toBe('original');
		const file = join(root, 'static', gps.download!.url);
		expect(statSync(file).size).toBe(gps.download!.bytes);
		const parsed = await exifr.parse(file, { gps: true, tiff: true });
		expect(parsed?.latitude).toBeUndefined();
		expect(parsed?.Model).toBe('iPhone 15 Pro');
		// non-GPS originals are copied byte for byte
		const plain = album.photos.find((p) => p.file === 'plain.png')!;
		expect(plain.download!.url).toMatch(/\.png$/);
		expect(album.albumDownload && 'url' in album.albumDownload && album.albumDownload.url).toMatch(
			/^\/downloads\/lisbon-walks-[0-9a-f]{8}\.zip$/
		);
		expect(album.albumDownload!.files).toBe(album.photos.length);
	});

	it('uses the 1920 px JPEG for large downloads', async () => {
		const report = await runIngest({
			root,
			config: { ...config, defaults: { downloads: 'large' } },
			quiet: true
		});
		const p = report.manifest.albums
			.find((a) => a.slug === 'lisbon-walks')!
			.photos.find((p) => p.file === 'landscape.jpg')!;
		expect(p.download).toMatchObject({ kind: 'large', url: expandSources(p.sources).jpeg });
	});
});
