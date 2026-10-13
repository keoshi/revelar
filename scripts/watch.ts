#!/usr/bin/env tsx
/** `npm run dev`: ingest once, then watch photos/ and re-run ingest on changes while Vite serves the site. */
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import chokidar from 'chokidar';
import { runIngest } from './ingest/index.js';
import { loadConfig, ROOT } from './ingest/config.js';

const config = await loadConfig();
const photosDir = resolve(ROOT, config.photosDir);

let pending: NodeJS.Timeout | undefined;
let running = false;
let queued = false;
async function reingest() {
	if (running) {
		queued = true;
		return;
	}
	running = true;
	try {
		await runIngest();
	} catch (e) {
		console.error(e instanceof Error ? e.message : e);
	}
	running = false;
	if (queued) {
		queued = false;
		void reingest();
	}
}

chokidar
	.watch(photosDir, {
		ignoreInitial: true,
		awaitWriteFinish: { stabilityThreshold: 500 },
		ignored: /(^|[/\\])\../
	})
	.on('all', (event, path) => {
		console.log(`  ${event} ${path}`);
		clearTimeout(pending);
		pending = setTimeout(() => void reingest(), 300);
	});

// Vite starts first so the dev server is reachable while the (possibly long) first ingest
// runs; the manifest watcher in vite.config.ts reloads open pages when ingest finishes.
const vite = spawn('npx', ['vite', 'dev', ...process.argv.slice(2)], {
	stdio: 'inherit',
	cwd: ROOT,
	shell: process.platform === 'win32'
});
vite.on('exit', (code) => process.exit(code ?? 0));

console.log('Ingesting photos in the background; open pages reload when the manifest is updated.');
void reingest();
process.on('SIGINT', () => {
	vite.kill('SIGINT');
	process.exit(0);
});
