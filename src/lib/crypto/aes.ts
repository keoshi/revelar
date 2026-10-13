/**
 * Isomorphic AES-GCM + PBKDF2 helpers built on WebCrypto. Used by the build
 * (Node's globalThis.crypto) and the browser (PasswordGate + worker).
 *
 * Wire formats:
 *   encrypted bytes = iv (12 bytes) || ciphertext || GCM tag (16 bytes)
 */

const subtle = globalThis.crypto.subtle;

export const PBKDF2_ITERATIONS = 600_000;
export const IV_BYTES = 12;

export function randomBytes(n: number): Uint8Array {
	const out = new Uint8Array(n);
	globalThis.crypto.getRandomValues(out);
	return out;
}

export function toBase64(bytes: Uint8Array): string {
	let s = '';
	for (let i = 0; i < bytes.length; i += 0x8000) {
		s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}
	return btoa(s);
}

export function fromBase64(s: string): Uint8Array {
	const bin = atob(s);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

export function toBase64Url(bytes: Uint8Array): string {
	return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(s: string): Uint8Array {
	const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
	return fromBase64(padded);
}

export async function deriveKek(
	password: string,
	salt: Uint8Array,
	iterations: number
): Promise<CryptoKey> {
	const material = await subtle.importKey(
		'raw',
		new TextEncoder().encode(password),
		'PBKDF2',
		false,
		['deriveKey']
	);
	return subtle.deriveKey(
		{ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
		material,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt']
	);
}

export async function importDek(
	raw: Uint8Array,
	usages: KeyUsage[] = ['encrypt', 'decrypt']
): Promise<CryptoKey> {
	return subtle.importKey('raw', raw as BufferSource, 'AES-GCM', false, usages);
}

export async function encryptWithKey(key: CryptoKey, data: Uint8Array): Promise<Uint8Array> {
	const iv = randomBytes(IV_BYTES);
	const ct = new Uint8Array(
		await subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, data as BufferSource)
	);
	const out = new Uint8Array(iv.length + ct.length);
	out.set(iv, 0);
	out.set(ct, iv.length);
	return out;
}

export async function decryptWithKey(key: CryptoKey, data: Uint8Array): Promise<Uint8Array> {
	const iv = data.subarray(0, IV_BYTES);
	const ct = data.subarray(IV_BYTES);
	return new Uint8Array(
		await subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, ct as BufferSource)
	);
}

/** Wrap the raw DEK with the password-derived KEK. */
export async function wrapDek(dek: Uint8Array, kek: CryptoKey): Promise<Uint8Array> {
	return encryptWithKey(kek, dek);
}

export async function unwrapDek(wrapped: Uint8Array, kek: CryptoKey): Promise<Uint8Array> {
	return decryptWithKey(kek, wrapped);
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
	const digest = new Uint8Array(await subtle.digest('SHA-256', data as BufferSource));
	return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Deterministic, key-dependent file name for an encrypted derivative (reveals nothing without the DEK). */
export async function encryptedFileName(dek: Uint8Array, plainPath: string): Promise<string> {
	const key = await subtle.importKey(
		'raw',
		dek as BufferSource,
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const mac = new Uint8Array(await subtle.sign('HMAC', key, new TextEncoder().encode(plainPath)));
	return toBase64Url(mac.subarray(0, 15));
}
