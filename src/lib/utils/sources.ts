import type { Srcset } from '../types.ts';

export type ImageSources = { avif: Srcset; webp: Srcset; jpeg: string };
/** Compact form: every URL follows `${base}-${width}.${ext}`. Used to keep page data small. */
export type CompactSources = { base: string; widths: number[]; jpegWidth: number };
export type PhotoSources = ImageSources | CompactSources;

export function isCompact(s: PhotoSources): s is CompactSources {
	return 'base' in s;
}

/** Try to compress explicit sources into the compact form; returns the input when the pattern does not hold. */
export function compactSources(s: ImageSources): PhotoSources {
	const m = s.jpeg.match(/^(.*)-(\d+)\.jpg$/);
	if (!m) return s;
	const base = m[1];
	const jpegWidth = Number(m[2]);
	const widths = s.avif.map((x) => x.width);
	const ok =
		s.webp.length === s.avif.length &&
		s.avif.every((x) => x.url === `${base}-${x.width}.avif`) &&
		s.webp.every((x, i) => x.url === `${base}-${widths[i]}.webp` && x.width === widths[i]);
	return ok ? { base, widths, jpegWidth } : s;
}

export function expandSources(s: PhotoSources): ImageSources {
	if (!isCompact(s)) return s;
	return {
		avif: s.widths.map((width) => ({ url: `${s.base}-${width}.avif`, width })),
		webp: s.widths.map((width) => ({ url: `${s.base}-${width}.webp`, width })),
		jpeg: `${s.base}-${s.jpegWidth}.jpg`
	};
}

export function srcsetString(set: Srcset, prefix = ''): string {
	return set.map((x) => `${prefix}${x.url} ${x.width}w`).join(', ');
}

/** Pick the smallest candidate that covers `cssWidth` at the given device pixel ratio. */
export function pickWidth(widths: number[], cssWidth: number, dpr = 1): number {
	const needed = cssWidth * dpr;
	const sorted = [...widths].sort((a, b) => a - b);
	return sorted.find((w) => w >= needed) ?? sorted[sorted.length - 1];
}

export function largestWidth(s: PhotoSources): number {
	const widths = isCompact(s) ? s.widths : s.avif.map((x) => x.width);
	return Math.max(...widths);
}
