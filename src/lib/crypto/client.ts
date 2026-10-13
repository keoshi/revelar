/** Browser-side private album unlocking and key persistence. */
import {
	decryptWithKey,
	deriveKek,
	fromBase64,
	fromBase64Url,
	importDek,
	toBase64Url,
	unwrapDek
} from './aes.ts';
import type { PrivateAlbumEntry, PrivateAlbumPayload } from '../types.ts';

export type UnlockedAlbum = { dek: Uint8Array; key: CryptoKey; payload: PrivateAlbumPayload };

export class WrongPasswordError extends Error {
	constructor() {
		super('Wrong password');
		this.name = 'WrongPasswordError';
	}
}

async function decryptPayload(dek: Uint8Array, entry: PrivateAlbumEntry): Promise<UnlockedAlbum> {
	const key = await importDek(dek, ['decrypt']);
	let bytes: Uint8Array;
	try {
		bytes = await decryptWithKey(key, fromBase64(entry.blob));
	} catch {
		throw new WrongPasswordError();
	}
	const payload = JSON.parse(new TextDecoder().decode(bytes)) as PrivateAlbumPayload;
	return { dek, key, payload };
}

/** Derive the KEK from the password, unwrap the DEK and decrypt the album slice. */
export async function unlockWithPassword(
	entry: PrivateAlbumEntry,
	password: string
): Promise<UnlockedAlbum> {
	const kek = await deriveKek(password, fromBase64(entry.salt), entry.iterations);
	let dek: Uint8Array;
	try {
		dek = await unwrapDek(fromBase64(entry.wrappedKey), kek);
	} catch {
		throw new WrongPasswordError();
	}
	return decryptPayload(dek, entry);
}

/** Unlock with a raw DEK (from a `#k=` link or remembered on this device). */
export async function unlockWithKey(
	entry: PrivateAlbumEntry,
	dek: Uint8Array
): Promise<UnlockedAlbum> {
	return decryptPayload(dek, entry);
}

const storageKey = (token: string) => `revelar:dek:${token}`;

export function rememberKey(token: string, dek: Uint8Array, persistent: boolean): void {
	try {
		const value = toBase64Url(dek);
		(persistent ? localStorage : sessionStorage).setItem(storageKey(token), value);
		if (persistent) sessionStorage.removeItem(storageKey(token));
	} catch {
		// storage unavailable (private mode): ignore
	}
}

export function rememberedKey(token: string): Uint8Array | undefined {
	try {
		const value =
			sessionStorage.getItem(storageKey(token)) ?? localStorage.getItem(storageKey(token));
		return value ? fromBase64Url(value) : undefined;
	} catch {
		return undefined;
	}
}

export function forgetKey(token: string): void {
	try {
		sessionStorage.removeItem(storageKey(token));
		localStorage.removeItem(storageKey(token));
	} catch {
		// ignore
	}
}

/** Parse `#k=<base64url DEK>&photo=<id>` from the location hash. */
export function parseHash(hash: string): { key?: Uint8Array; photo?: string } {
	const params = new URLSearchParams(hash.replace(/^#/, ''));
	const k = params.get('k');
	const photo = params.get('photo') ?? undefined;
	let key: Uint8Array | undefined;
	if (k) {
		try {
			const bytes = fromBase64Url(k);
			if (bytes.length === 32) key = bytes;
		} catch {
			key = undefined;
		}
	}
	return { key, photo };
}
