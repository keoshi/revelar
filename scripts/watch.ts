#!/usr/bin/env tsx
/** `npm run dev`: ingest once, then watch photos/ and re-run ingest on changes while Vite serves the site. */
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import chokidar from 'chokidar';
import { runIngest } from './ingest/index.js';
import { loadConfig, ROOT } from './ingest/config.js';

const config = await loadConfig();
const photosDir = resolve(ROOT, config.photosDir);

await runIngest();

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

const vite = spawn('npx', ['vite', 'dev', ...process.argv.slice(2)], {
	stdio: 'inherit',
	cwd: ROOT,
	shell: process.platform === 'win32'
});
vite.on('exit', (code) => process.exit(code ?? 0));
process.on('SIGINT', () => {
	vite.kill('SIGINT');
	process.exit(0);
});
