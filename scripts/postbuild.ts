/**
 * Trims the static output after `vite build`.
 *
 * SvelteKit writes a `__data.json` next to every prerendered page for client-side navigation
 * between pages. Revelar's links are plain page loads (`data-sveltekit-reload` in app.html) and
 * the viewer moves between photos with shallow routing, so none of those files are ever
 * requested; dropping them halves the file count of an album folder.
 */
import { readdirSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = process.env.REVELAR_SITE_ROOT ? resolve(process.env.REVELAR_SITE_ROOT) : process.cwd();
const buildDir = join(root, 'build');

let removed = 0;
let bytes = 0;
for (const entry of readdirSync(buildDir, { recursive: true, withFileTypes: true })) {
	if (!entry.isFile() || entry.name !== '__data.json') continue;
	const path = join(entry.parentPath, entry.name);
	bytes += statSync(path).size;
	rmSync(path);
	removed++;
}
console.log(`Removed ${removed} __data.json files (${(bytes / 1024 / 1024).toFixed(1)} MB)`);
