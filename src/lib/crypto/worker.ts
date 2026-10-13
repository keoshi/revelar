/** Web Worker: fetch encrypted `.bin` files and decrypt them with the album DEK. */
import { decryptWithKey, importDek } from './aes.ts';

type Request = { id: number; url: string; dek: Uint8Array };
type Response = { id: number; data?: ArrayBuffer; error?: string };

let keyPromise: Promise<CryptoKey> | undefined;
let keyBytes: Uint8Array | undefined;

function keyFor(dek: Uint8Array): Promise<CryptoKey> {
	if (
		!keyPromise ||
		!keyBytes ||
		keyBytes.length !== dek.length ||
		keyBytes.some((b, i) => b !== dek[i])
	) {
		keyBytes = dek;
		keyPromise = importDek(dek, ['decrypt']);
	}
	return keyPromise;
}

self.onmessage = async (e: MessageEvent<Request>) => {
	const { id, url, dek } = e.data;
	try {
		const [key, res] = await Promise.all([keyFor(dek), fetch(url, { cache: 'force-cache' })]);
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const encrypted = new Uint8Array(await res.arrayBuffer());
		const plain = await decryptWithKey(key, encrypted);
		const buffer = plain.buffer.slice(
			plain.byteOffset,
			plain.byteOffset + plain.byteLength
		) as ArrayBuffer;
		(self as unknown as Worker).postMessage({ id, data: buffer } satisfies Response, [buffer]);
	} catch (err) {
		(self as unknown as Worker).postMessage({
			id,
			error: (err as Error).message
		} satisfies Response);
	}
};
