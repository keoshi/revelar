/**
 * Decrypts private-album files in a Web Worker and hands out `blob:` URLs,
 * cached per encrypted URL and revoked when the store is disposed.
 */
import type { Photo } from '../types.ts';
import { expandSources, pickWidth } from '../utils/sources.ts';
import { withBase } from '../utils/href.ts';
import { supportsAvif } from '../utils/formats.ts';

const MIME: Record<string, string> = {
	avif: 'image/avif',
	webp: 'image/webp',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	png: 'image/png',
	tif: 'image/tiff',
	tiff: 'image/tiff',
	heic: 'image/heic'
};

export class PrivateImageStore {
	private worker: Worker | undefined;
	private pending = new Map<
		number,
		{ resolve: (b: ArrayBuffer) => void; reject: (e: Error) => void }
	>();
	private urls = new Map<string, Promise<string>>();
	private objectUrls = new Set<string>();
	private seq = 0;
	private useAvif: Promise<boolean>;

	constructor(private readonly dek: Uint8Array) {
		this.useAvif = supportsAvif();
	}

	private getWorker(): Worker {
		if (!this.worker) {
			this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
			this.worker.onmessage = (
				e: MessageEvent<{ id: number; data?: ArrayBuffer; error?: string }>
			) => {
				const p = this.pending.get(e.data.id);
				if (!p) return;
				this.pending.delete(e.data.id);
				if (e.data.data) p.resolve(e.data.data);
				else p.reject(new Error(e.data.error ?? 'decrypt failed'));
			};
		}
		return this.worker;
	}

	/** Decrypt an encrypted file (site-relative URL) to bytes. */
	decrypt(url: string): Promise<ArrayBuffer> {
		const id = ++this.seq;
		return new Promise((resolve, reject) => {
			this.pending.set(id, { resolve, reject });
			this.getWorker().postMessage({ id, url: withBase(url), dek: this.dek });
		});
	}

	/** Decrypt to an object URL (cached). `mime` is inferred from the plain extension hint. */
	objectUrl(url: string, mime: string): Promise<string> {
		let p = this.urls.get(url);
		if (!p) {
			p = this.decrypt(url).then((buf) => {
				const u = URL.createObjectURL(new Blob([buf], { type: mime }));
				this.objectUrls.add(u);
				return u;
			});
			this.urls.set(url, p);
		}
		return p;
	}

	/** Best derivative for a CSS width (already multiplied by DPR by the caller). */
	async photoUrl(photo: Photo, width: number): Promise<string> {
		const s = expandSources(photo.sources);
		const avif = await this.useAvif;
		const set = avif ? s.avif : s.webp;
		const w = pickWidth(
			set.map((x) => x.width),
			width
		);
		const entry = set.find((x) => x.width === w) ?? set[set.length - 1];
		return this.objectUrl(entry.url, avif ? MIME.avif : MIME.webp);
	}

	async thumbUrl(photo: Photo): Promise<string> {
		const s = expandSources(photo.sources);
		return this.objectUrl(s.webp[0].url, MIME.webp);
	}

	async downloadBlob(photo: Photo): Promise<{ blob: Blob; name: string }> {
		if (!photo.download) throw new Error('no download');
		const ext =
			photo.download.kind === 'large'
				? 'jpg'
				: (photo.file.split('.').pop()?.toLowerCase() ?? 'jpg');
		const stem = photo.file.replace(/\.[^.]+$/, '');
		const buf = await this.decrypt(photo.download.url);
		const safeExt =
			photo.download.url.includes('-safe') || photo.download.kind === 'large' ? 'jpg' : ext;
		return {
			blob: new Blob([buf], { type: MIME[safeExt] ?? 'application/octet-stream' }),
			name: `${stem}.${safeExt}`
		};
	}

	dispose(): void {
		for (const u of this.objectUrls) URL.revokeObjectURL(u);
		this.objectUrls.clear();
		this.urls.clear();
		this.worker?.terminate();
		this.worker = undefined;
	}
}
