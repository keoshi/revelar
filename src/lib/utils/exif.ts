import type { PhotoExif } from '../types.ts';

/** Small alias map turning raw EXIF make/model pairs into marketing names. */
const MODEL_ALIASES: Record<string, string> = {
	'ILCE-7M4': 'α7 IV',
	'ILCE-7M3': 'α7 III',
	'ILCE-7M2': 'α7 II',
	'ILCE-7RM5': 'α7R V',
	'ILCE-7RM4': 'α7R IV',
	'ILCE-7RM3': 'α7R III',
	'ILCE-7CM2': 'α7C II',
	'ILCE-7C': 'α7C',
	'ILCE-7CR': 'α7CR',
	'ILCE-7SM3': 'α7S III',
	'ILCE-9M3': 'α9 III',
	'ILCE-1': 'α1',
	'ILCE-6700': 'α6700',
	'ILCE-6600': 'α6600',
	'ILCE-6400': 'α6400',
	'ILCE-6100': 'α6100',
	'ILCE-6000': 'α6000',
	'DSC-RX100M7': 'RX100 VII',
	'DSC-RX1RM2': 'RX1R II',
	'X-T5': 'X-T5',
	'X-T4': 'X-T4',
	X100VI: 'X100VI',
	X100V: 'X100V',
	'Canon EOS R5': 'EOS R5',
	'Canon EOS R6m2': 'EOS R6 Mark II',
	'NIKON Z 8': 'Z 8',
	'NIKON Z 6_3': 'Z6 III'
};

const MAKE_ALIASES: Record<string, string> = {
	SONY: 'Sony',
	CANON: 'Canon',
	NIKON: 'Nikon',
	'NIKON CORPORATION': 'Nikon',
	FUJIFILM: 'Fujifilm',
	'OLYMPUS IMAGING CORP.': 'Olympus',
	'OLYMPUS CORPORATION': 'Olympus',
	'OM Digital Solutions': 'OM System',
	PANASONIC: 'Panasonic',
	LEICA: 'Leica',
	'LEICA CAMERA AG': 'Leica',
	'RICOH IMAGING COMPANY, LTD.': 'Ricoh',
	SAMSUNG: 'Samsung',
	Apple: 'Apple',
	Google: 'Google',
	DJI: 'DJI',
	HASSELBLAD: 'Hasselblad'
};

export function formatCamera(make?: string, model?: string): string | undefined {
	if (!make && !model) return undefined;
	const prettyMake = make ? (MAKE_ALIASES[make.trim()] ?? titleCase(make.trim())) : '';
	let prettyModel = model?.trim() ?? '';
	if (prettyModel && MODEL_ALIASES[prettyModel]) prettyModel = MODEL_ALIASES[prettyModel];
	if (!prettyMake) return prettyModel || undefined;
	if (!prettyModel) return prettyMake;
	// De-duplicate: "Canon" + "Canon EOS R5" → "Canon EOS R5"
	if (prettyModel.toLowerCase().startsWith(prettyMake.toLowerCase())) return prettyModel;
	if (make && prettyModel.toLowerCase().startsWith(make.trim().toLowerCase())) {
		return `${prettyMake}${prettyModel.slice(make.trim().length)}`;
	}
	return `${prettyMake} ${prettyModel}`;
}

function titleCase(s: string): string {
	if (s === s.toUpperCase() && s.length > 3) {
		return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
	}
	return s;
}

/** "1/250 s", "0.5 s", "30 s" */
export function formatShutter(seconds: number | undefined): string | undefined {
	if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return undefined;
	if (seconds >= 1) {
		const rounded = Math.round(seconds * 10) / 10;
		return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} s`;
	}
	const denominator = Math.round(1 / seconds);
	return `1/${denominator} s`;
}

export function formatAperture(f: number | undefined): string | undefined {
	if (!f || !Number.isFinite(f)) return undefined;
	const rounded = Math.round(f * 10) / 10;
	return `ƒ/${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}`;
}

export function formatEv(ev: number | undefined): string | undefined {
	if (ev === undefined || !Number.isFinite(ev) || ev === 0) return undefined;
	const sign = ev > 0 ? '+' : '−';
	const abs = Math.abs(ev);
	const rounded = Math.round(abs * 10) / 10;
	return `${sign}${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} EV`;
}

/** "35 mm · ƒ/2.8 · 1/250 s · ISO 400 · −0.3 EV" */
export function formatExposure(exif: PhotoExif | undefined): string | undefined {
	if (!exif) return undefined;
	const parts = [
		exif.focal ? `${Math.round(exif.focal)} mm` : undefined,
		formatAperture(exif.aperture),
		exif.shutter,
		exif.iso ? `ISO ${exif.iso}` : undefined,
		formatEv(exif.ev)
	].filter(Boolean);
	return parts.length ? parts.join(' · ') : undefined;
}

export function formatMegapixels(width: number, height: number): string {
	const mp = (width * height) / 1_000_000;
	return `${width} × ${height} · ${mp < 10 ? mp.toFixed(1) : Math.round(mp)} MP`;
}

/** Localised "14 March 2025, 07:12" from an ISO-like string without timezone. */
export function formatDate(
	iso: string | undefined,
	locale = 'en',
	withTime = true
): string | undefined {
	if (!iso) return undefined;
	const m = iso.match(/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
	if (!m) return iso;
	const [, y, mo, d, h, mi] = m;
	if (!mo) return y;
	const date = new Date(Number(y), Number(mo) - 1, Number(d ?? 1), Number(h ?? 0), Number(mi ?? 0));
	if (!d) return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(date);
	const day = new Intl.DateTimeFormat(locale, {
		day: 'numeric',
		month: 'long',
		year: 'numeric'
	}).format(date);
	if (!withTime || h === undefined) return day;
	const time = new Intl.DateTimeFormat(locale, {
		hour: '2-digit',
		minute: '2-digit',
		hour12: false
	}).format(date);
	return `${day}, ${time}`;
}

/** "March 2025" or "March – May 2025" or "2024 – 2025" */
export function formatDateRange(
	range: { from: string; to: string } | undefined,
	locale = 'en'
): string | undefined {
	if (!range) return undefined;
	const from = range.from.slice(0, 7);
	const to = range.to.slice(0, 7);
	if (from === to) return formatDate(from, locale);
	const [fy, fm] = from.split('-');
	const [ty, tm] = to.split('-');
	const month = (y: string, m: string) =>
		new Intl.DateTimeFormat(locale, { month: 'long' }).format(
			new Date(Number(y), Number(m) - 1, 1)
		);
	if (fy === ty) return `${month(fy, fm)} – ${month(ty, tm)} ${ty}`;
	return `${month(fy, fm)} ${fy} – ${month(ty, tm)} ${ty}`;
}
