import { existsSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { rgbaToThumbHash, thumbHashToAverageRGBA } from 'thumbhash';
import type { Srcset } from '../lib/types.ts';
import type { RevelarConfig } from '../lib/config.ts';

export type Derivatives = {
	avif: Srcset;
	webp: Srcset;
	jpeg: { url: string; width: number; file: string };
	/** absolute paths of every file written for this photo */
	files: string[];
};

export type EncodedPhoto = {
	width: number;
	height: number;
	thumbhash: string;
	color: string;
	derivatives: Derivatives;
	/** number of files actually encoded in this run (0 when everything existed) */
	encoded: number;
};

export type EncodeArgs = {
	input: string;
	outDir: string;
	urlPrefix: string;
	id: string;
	hash8: string;
	images: RevelarConfig['images'];
	force: boolean;
};

export function settingsKey(images: RevelarConfig['images']): string {
	return JSON.stringify([
		images.widths,
		images.avifQuality,
		images.avifEffort,
		images.webpQuality,
		images.jpegQuality,
		1
	]);
}

/** Derivative widths for an image of width `w`: configured widths below w, plus w itself when it is smaller than the largest configured width. */
export function derivativeWidths(w: number, configured: number[]): number[] {
	const sorted = [...configured].sort((a, b) => a - b);
	const out = sorted.filter((x) => x < w);
	const max = sorted[sorted.length - 1] ?? w;
	if (w <= max && !out.includes(w)) out.push(w);
	return out;
}

export async function encodePhoto(args: EncodeArgs): Promise<EncodedPhoto> {
	const { input, outDir, urlPrefix, id, hash8, images, force } = args;
	mkdirSync(outDir, { recursive: true });

	const probe = sharp(input, { limitInputPixels: false });
	const meta = await probe.metadata();
	const width = meta.autoOrient?.width ?? meta.width ?? 0;
	const height = meta.autoOrient?.height ?? meta.height ?? 0;
	if (!width || !height) throw new Error(`could not read dimensions of ${input}`);

	const widths = derivativeWidths(width, images.widths);
	const largest = widths[widths.length - 1];
	const jpegWidth = Math.min(1920, largest);

	const name = (w: number, ext: string) => `${id}-${hash8}-${w}.${ext}`;
	const avif: Srcset = [];
	const webp: Srcset = [];
	const files: string[] = [];
	const jobs: { path: string; width: number; format: 'avif' | 'webp' | 'jpeg' }[] = [];

	for (const w of widths) {
		for (const format of ['avif', 'webp'] as const) {
			const file = join(outDir, name(w, format));
			files.push(file);
			(format === 'avif' ? avif : webp).push({ url: `${urlPrefix}/${name(w, format)}`, width: w });
			if (force || !existsSync(file)) jobs.push({ path: file, width: w, format });
		}
	}
	const jpegFile = join(outDir, name(jpegWidth, 'jpg'));
	files.push(jpegFile);
	if (force || !existsSync(jpegFile))
		jobs.push({ path: jpegFile, width: jpegWidth, format: 'jpeg' });

	// Decode once (auto-orient, convert to sRGB) at the largest derivative size; everything else derives from it.
	const { data, info } = await sharp(input, { limitInputPixels: false })
		.rotate()
		.resize({ width: largest, withoutEnlargement: true, kernel: 'lanczos3' })
		.toColourspace('srgb')
		.raw()
		.toBuffer({ resolveWithObject: true });
	const fromRaw = () =>
		sharp(data, {
			raw: { width: info.width, height: info.height, channels: info.channels },
			limitInputPixels: false
		});

	for (const job of jobs) {
		let pipeline = fromRaw()
			.resize({ width: job.width, withoutEnlargement: true, kernel: 'lanczos3' })
			.withIccProfile('srgb');
		if (job.format === 'avif')
			pipeline = pipeline.avif({ quality: images.avifQuality, effort: images.avifEffort });
		else if (job.format === 'webp') pipeline = pipeline.webp({ quality: images.webpQuality });
		else
			pipeline = pipeline
				.flatten({ background: '#ffffff' })
				.jpeg({ quality: images.jpegQuality, mozjpeg: true });
		await pipeline.toFile(job.path);
	}

	// ThumbHash from a ≤100 px version, plus the average colour as hex.
	const small = await fromRaw()
		.resize({ width: 100, height: 100, fit: 'inside' })
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });
	const hash = rgbaToThumbHash(small.info.width, small.info.height, small.data);
	const avg = thumbHashToAverageRGBA(hash);
	const hex = (n: number) =>
		Math.round(n * 255)
			.toString(16)
			.padStart(2, '0');

	return {
		width,
		height,
		thumbhash: Buffer.from(hash).toString('base64'),
		color: `#${hex(avg.r)}${hex(avg.g)}${hex(avg.b)}`,
		derivatives: {
			avif,
			webp,
			jpeg: { url: `${urlPrefix}/${name(jpegWidth, 'jpg')}`, width: jpegWidth, file: jpegFile },
			files
		},
		encoded: jobs.length
	};
}

/** Full-resolution, maximum-quality JPEG with metadata limited to copyright and camera fields (no GPS). */
export async function writeGpsSafeOriginal(
	input: string,
	outPath: string,
	fields: {
		make?: string;
		model?: string;
		lens?: string;
		artist?: string;
		copyright?: string;
		date?: string;
		focal?: number;
		aperture?: number;
		exposureSeconds?: number;
		iso?: number;
		ev?: number;
	}
): Promise<number> {
	const ifd0: Record<string, string> = {};
	const ifd2: Record<string, string> = {};
	if (fields.make) ifd0.Make = fields.make;
	if (fields.model) ifd0.Model = fields.model;
	if (fields.artist) ifd0.Artist = fields.artist;
	if (fields.copyright) ifd0.Copyright = fields.copyright;
	if (fields.lens) ifd2.LensModel = fields.lens;
	if (fields.date) {
		const m = fields.date.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2}))?/);
		if (m)
			ifd2.DateTimeOriginal = `${m[1]}:${m[2]}:${m[3]} ${m[4] ?? '00'}:${m[5] ?? '00'}:${m[6] ?? '00'}`;
	}
	if (fields.focal) ifd2.FocalLength = `${Math.round(fields.focal * 10)}/10`;
	if (fields.aperture) ifd2.FNumber = `${Math.round(fields.aperture * 100)}/100`;
	if (fields.exposureSeconds)
		ifd2.ExposureTime = `${Math.round(fields.exposureSeconds * 1_000_000)}/1000000`;
	if (fields.iso) ifd2.ISOSpeedRatings = String(Math.round(fields.iso));
	if (fields.ev) ifd2.ExposureBiasValue = `${Math.round(fields.ev * 100)}/100`;

	await sharp(input, { limitInputPixels: false })
		.rotate()
		.withIccProfile('srgb')
		.withExif({ IFD0: ifd0, IFD2: ifd2 })
		.flatten({ background: '#ffffff' })
		.jpeg({ quality: 100, chromaSubsampling: '4:4:4', mozjpeg: true })
		.toFile(outPath);
	return statSync(outPath).size;
}
