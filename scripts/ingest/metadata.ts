import exifr from 'exifr';
import { cleanText } from '../../src/lib/utils/text.ts';
import { formatShutter } from '../../src/lib/utils/exif.ts';
import type { PhotoExif } from '../../src/lib/types.ts';
import { normaliseDate, type PhotoOverride } from './sidecar.ts';

/** Metadata embedded in the file, after precedence between XMP / IPTC / EXIF, before sidecar overrides. */
export type EmbeddedMeta = {
	title?: string;
	caption?: string;
	alt?: string;
	date?: string;
	keywords: string[];
	gps?: { lat: number; lng: number };
	exif?: PhotoExif;
};

type Raw = Record<string, Record<string, unknown> | undefined>;

export async function readEmbeddedMetadata(input: Buffer | string): Promise<EmbeddedMeta> {
	let raw: Raw | undefined;
	try {
		raw = (await exifr.parse(input, {
			tiff: true,
			exif: true,
			gps: true,
			iptc: true,
			xmp: true,
			icc: false,
			mergeOutput: false,
			reviveValues: true,
			translateKeys: true,
			translateValues: true
		})) as Raw | undefined;
	} catch {
		raw = undefined;
	}
	return extractEmbedded(raw ?? {});
}

function firstText(...candidates: unknown[]): string | undefined {
	for (const c of candidates) {
		const t = cleanText(c);
		if (t) return t;
	}
	return undefined;
}

function localIso(d: Date): string {
	const p = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function iptcDate(date: unknown, time: unknown): string | undefined {
	const d = cleanText(date);
	if (!d) return undefined;
	const m = d.match(/^(\d{4})(\d{2})(\d{2})$/);
	let out = m ? `${m[1]}-${m[2]}-${m[3]}` : normaliseDate(d);
	const t = cleanText(time)?.match(/^(\d{2})(\d{2})(\d{2})/);
	if (out && t && m) out += `T${t[1]}:${t[2]}:${t[3]}`;
	return out;
}

function exifDate(value: unknown): string | undefined {
	if (value instanceof Date && !Number.isNaN(value.getTime())) return localIso(value);
	const s = cleanText(value);
	if (!s) return undefined;
	const m = s.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
	if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
	return normaliseDate(s);
}

function num(value: unknown): number | undefined {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string') {
		const n = Number(value);
		return Number.isFinite(n) ? n : undefined;
	}
	return undefined;
}

function keywordList(value: unknown): string[] {
	if (value === undefined || value === null) return [];
	const list = Array.isArray(value) ? value : [value];
	const out: string[] = [];
	for (const item of list) {
		const t = cleanText(item);
		if (t && !out.includes(t)) out.push(t);
	}
	return out;
}

/**
 * exifr decodes IPTC IIM strings as Latin-1 even when the 1:90 coded-character-set
 * marker says UTF-8 (which is what Lightroom and Capture One write). Repair those.
 */
function fixIptcEncoding(value: unknown): unknown {
	if (typeof value === 'string') {
		if (!/[\u0080-\u00ff]/.test(value)) return value;
		const bytes = Buffer.from(value, 'latin1');
		const decoded = bytes.toString('utf8');
		return decoded.includes('\uFFFD') ? value : decoded;
	}
	if (Array.isArray(value)) return value.map(fixIptcEncoding);
	return value;
}

export function extractEmbedded(raw: Raw): EmbeddedMeta {
	const dc = raw.dc ?? {};
	const photoshop = raw.photoshop ?? {};
	const iptcCore = raw.Iptc4xmpCore ?? {};
	const iptc = Object.fromEntries(
		Object.entries(raw.iptc ?? {}).map(([k, v]) => [k, fixIptcEncoding(v)])
	);
	const ifd0 = raw.ifd0 ?? {};
	const exif = raw.exif ?? {};
	const gps = raw.gps ?? {};

	const title = firstText(dc.title, iptc.ObjectName);
	const caption = firstText(
		dc.description,
		iptc.Caption,
		iptc['Caption-Abstract'],
		ifd0.ImageDescription
	);
	const alt = firstText(iptcCore.AltTextAccessibility, iptcCore.AltTextAccessibilityExt);
	const date =
		normaliseDate(cleanText(photoshop.DateCreated)) ??
		iptcDate(iptc.DateCreated, iptc.TimeCreated) ??
		exifDate(exif.DateTimeOriginal) ??
		exifDate(exif.CreateDate) ??
		exifDate(ifd0.ModifyDate);
	const keywords = (() => {
		const fromXmp = keywordList(dc.subject);
		return fromXmp.length ? fromXmp : keywordList(iptc.Keywords);
	})();

	const lat = num(gps.latitude);
	const lng = num(gps.longitude);
	const gpsOut =
		lat !== undefined && lng !== undefined && (lat !== 0 || lng !== 0) ? { lat, lng } : undefined;

	const exifOut: PhotoExif = {};
	const make = cleanText(ifd0.Make);
	const model = cleanText(ifd0.Model);
	const lens = cleanText(exif.LensModel);
	const focal = num(exif.FocalLength);
	const aperture = num(exif.FNumber);
	const shutter = formatShutter(num(exif.ExposureTime));
	const iso = num(exif.ISO);
	const ev = num(exif.ExposureCompensation);
	if (make) exifOut.make = make;
	if (model) exifOut.model = model;
	if (lens) exifOut.lens = lens;
	if (focal) exifOut.focal = Math.round(focal * 10) / 10;
	if (aperture) exifOut.aperture = Math.round(aperture * 10) / 10;
	if (shutter) exifOut.shutter = shutter;
	if (iso) exifOut.iso = Math.round(iso);
	if (ev !== undefined && ev !== 0) exifOut.ev = Math.round(ev * 100) / 100;

	const out: EmbeddedMeta = { keywords };
	if (title) out.title = title;
	if (caption) out.caption = caption;
	if (alt) out.alt = alt;
	if (date) out.date = date;
	if (gpsOut) out.gps = gpsOut;
	if (Object.keys(exifOut).length) out.exif = exifOut;
	return out;
}

export type MergedMeta = EmbeddedMeta & { altGenerated: boolean };

/** Apply sidecar overrides (first non-empty wins: sidecar, then embedded). */
export function mergeMetadata(
	embedded: EmbeddedMeta,
	override: PhotoOverride | undefined,
	fallback: { mtimeMs: number; altFallback: () => string }
): MergedMeta {
	const title = firstText(override?.title) ?? embedded.title;
	const caption = firstText(override?.caption) ?? embedded.caption;
	const date =
		normaliseDate(override?.date) ?? embedded.date ?? localIso(new Date(fallback.mtimeMs));
	let alt = firstText(override?.alt) ?? embedded.alt;
	let altGenerated = false;
	if (!alt) {
		alt = caption ?? title;
		if (!alt) {
			alt = fallback.altFallback();
			altGenerated = true;
		}
	}
	const out: MergedMeta = { keywords: embedded.keywords, alt, date, altGenerated };
	if (title) out.title = title;
	if (caption) out.caption = caption;
	if (embedded.gps) out.gps = embedded.gps;
	if (embedded.exif) out.exif = embedded.exif;
	return out;
}
