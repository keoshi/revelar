import { thumbHashToDataURL } from 'thumbhash';

const cache = new Map<string, string>();

/** Decode a base64 ThumbHash to a PNG data URL, once per hash. */
export function thumbhashUrl(hash: string): string {
	let url = cache.get(hash);
	if (!url) {
		const bytes = Uint8Array.from(atob(hash), (c) => c.charCodeAt(0));
		url = thumbHashToDataURL(bytes);
		cache.set(hash, url);
	}
	return url;
}
