/**
 * `revelar dev`: start the Vite dev server, ingest once, then watch photos/ and re-ingest on
 * changes. Vite starts first so the server is reachable while a (possibly long) first ingest
 * runs; the manifest watcher in vite.config.ts reloads open pages when ingest finishes.
 */
import { join, resolve } from 'node:path';
import chokidar from 'chokidar';
import { runIngest } from './ingest.ts';
import { loadConfig, PACKAGE_ROOT } from './config.ts';
import { inPackageDir, prepareSite } from './build.ts';

export type DevOptions = { root?: string; config?: string; port?: number; open?: boolean };

export async function devServer(
	opts: DevOptions = {}
): Promise<{ url: string; close: () => Promise<void> }> {
	const root = await prepareSite(opts);
	const config = await loadConfig();
	const photosDir = resolve(root, config.photosDir);

	const { createServer } = await import('vite');
	const server = await inPackageDir(async () => {
		const s = await createServer({
			root: PACKAGE_ROOT,
			configFile: join(PACKAGE_ROOT, 'vite.config.ts'),
			server: { port: opts.port, open: opts.open }
		});
		await s.listen();
		return s;
	});
	server.printUrls();
	const url = server.resolvedUrls?.local[0] ?? `http://localhost:${opts.port ?? 5173}/`;

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
			await runIngest({ root });
		} catch (e) {
			console.error(e instanceof Error ? e.message : e);
		}
		running = false;
		if (queued) {
			queued = false;
			void reingest();
		}
	}
	const watcher = chokidar
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

	console.log(
		'Ingesting photos in the background; open pages reload when the manifest is updated.'
	);
	void reingest();

	return {
		url,
		close: async () => {
			clearTimeout(pending);
			await watcher.close();
			await server.close();
		}
	};
}
