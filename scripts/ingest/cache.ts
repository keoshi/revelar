import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { EmbeddedMeta } from './metadata.ts';
import type { Derivatives } from './encode.ts';

export type CacheEntry = {
	hash: string;
	size: number;
	mtimeMs: number;
	settings: string;
	width: number;
	height: number;
	thumbhash: string;
	color: string;
	embedded: EmbeddedMeta;
	derivatives: Derivatives;
};

type CacheFile = { version: number; files: Record<string, CacheEntry> };

const VERSION = 1;

export class IngestCache {
	private data: CacheFile = { version: VERSION, files: {} };
	private touched = new Set<string>();

	constructor(private readonly path: string) {
		if (existsSync(path)) {
			try {
				const parsed = JSON.parse(readFileSync(path, 'utf8')) as CacheFile;
				if (parsed.version === VERSION) this.data = parsed;
			} catch {
				// corrupt cache: start fresh
			}
		}
	}

	get(rel: string): CacheEntry | undefined {
		return this.data.files[rel];
	}

	set(rel: string, entry: CacheEntry): void {
		this.data.files[rel] = entry;
		this.touched.add(rel);
	}

	touch(rel: string): void {
		this.touched.add(rel);
	}

	/** Drop entries for files that no longer exist, then persist. */
	save(): void {
		for (const key of Object.keys(this.data.files)) {
			if (!this.touched.has(key)) delete this.data.files[key];
		}
		mkdirSync(dirname(this.path), { recursive: true });
		writeFileSync(this.path, JSON.stringify(this.data, null, 1));
	}
}

export function readJsonFile<T>(path: string, fallback: T): T {
	if (!existsSync(path)) return fallback;
	try {
		return JSON.parse(readFileSync(path, 'utf8')) as T;
	} catch {
		return fallback;
	}
}

export function writeJsonFile(path: string, value: unknown): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
}
