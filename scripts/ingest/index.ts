import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig, ROOT } from './config.ts';
import type { Manifest } from '../../src/lib/types.ts';

export type IngestOptions = { force?: boolean; quiet?: boolean };
export type IngestReport = { errors: string[]; warnings: string[] };

export async function runIngest(opts: IngestOptions = {}): Promise<IngestReport> {
	void opts;
	const config = await loadConfig();
	const manifest: Manifest = {
		generatedAt: new Date().toISOString(),
		site: { title: config.site.title, baseUrl: config.site.baseUrl },
		albums: [],
		privateAlbums: []
	};
	const dir = resolve(ROOT, 'src/lib/generated');
	mkdirSync(dir, { recursive: true });
	writeFileSync(resolve(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
	return { errors: [], warnings: [] };
}
