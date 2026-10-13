// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Trim, normalise to NFC and strip control characters. Returns undefined for empty strings. */
export function cleanText(input: unknown): string | undefined {
	if (input === null || input === undefined) return undefined;
	let s: string;
	if (typeof input === 'string') s = input;
	else if (typeof input === 'number') s = String(input);
	else if (Array.isArray(input))
		s = input
			.map((x) => cleanText(x) ?? '')
			.filter(Boolean)
			.join(', ');
	else if (typeof input === 'object' && 'value' in (input as object))
		return cleanText((input as { value: unknown }).value);
	else return undefined;
	s = s.normalize('NFC').replace(CONTROL_CHARS, '').trim();
	return s.length ? s : undefined;
}

export function slugify(input: string): string {
	return input
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

/** Natural, case-insensitive filename comparison ("img2" < "img10"). */
export const naturalCompare = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
	.compare;

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	const units = ['KB', 'MB', 'GB'];
	let value = bytes / 1024;
	let i = 0;
	while (value >= 1024 && i < units.length - 1) {
		value /= 1024;
		i++;
	}
	return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}
