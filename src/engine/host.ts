/**
 * The engine as a service for another process (the desktop app): a request/response loop with
 * events, over Electron's parentPort when forked as a utility process, else newline-delimited
 * JSON on stdin/stdout. Keeps sharp, Vite and the rest out of the app's own process.
 *
 *   → { id, method, params }      ← { id, result } | { id, error }
 *                                 ← { event, data }   (progress, logs)
 */
import { resolve } from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import { runIngest, type IngestEvent } from './ingest.ts';
import { buildSite, previewSite } from './build.ts';
import { shareLinks } from './share.ts';
import {
	addAlbum,
	initSite,
	isSite,
	listAlbums,
	readAlbum,
	readConfig,
	saveAlbum,
	saveConfig
} from './site.ts';
import { publishNetlify, type PublishEvent } from './publish.ts';
import type { RevelarConfigInput } from '../lib/config.ts';

type Request = { id: number; method: string; params?: Record<string, unknown> };
type Response = { id: number; result?: unknown; error?: string };
type Event = { event: string; data: unknown };

type Transport = {
	send: (msg: Response | Event) => void;
	onMessage: (fn: (msg: Request) => void) => void;
};

function transport(): Transport {
	const port = (
		process as unknown as {
			parentPort?: {
				postMessage(m: unknown): void;
				on(e: 'message', fn: (ev: { data: Request }) => void): void;
			};
		}
	).parentPort;
	if (port) {
		return {
			send: (msg) => port.postMessage(msg),
			onMessage: (fn) => port.on('message', (ev) => fn(ev.data))
		};
	}
	return {
		send: (msg) => process.stdout.write(JSON.stringify(msg) + '\n'),
		onMessage: (fn) => {
			let buffer = '';
			process.stdin.setEncoding('utf8');
			process.stdin.on('data', (chunk: string) => {
				buffer += chunk;
				let i: number;
				while ((i = buffer.indexOf('\n')) >= 0) {
					const line = buffer.slice(0, i).trim();
					buffer = buffer.slice(i + 1);
					if (line) fn(JSON.parse(line) as Request);
				}
			});
			process.stdin.on('end', () => process.exit(0));
		}
	};
}

export function startHost(): void {
	const t = transport();
	const emit = (event: string, data: unknown) => t.send({ event, data });
	let preview: { url: string; close: () => Promise<void> } | undefined;

	// The open site's photos/ is watched so the app can refresh when folders or files are added
	// in Finder or Explorer; the album list is cheap to rebuild, so one debounced event suffices.
	let watcher: FSWatcher | undefined;
	let changed: NodeJS.Timeout | undefined;
	async function watchPhotos(photosDir: string) {
		await watcher?.close();
		watcher = chokidar
			.watch(photosDir, {
				ignoreInitial: true,
				depth: 1,
				awaitWriteFinish: { stabilityThreshold: 800 },
				ignored: /(^|[/\\])\../
			})
			.on('all', () => {
				clearTimeout(changed);
				changed = setTimeout(() => emit('site', { type: 'changed' }), 400);
			});
	}

	const str = (v: unknown, name: string): string => {
		if (typeof v !== 'string' || !v) throw new Error(`${name} is required`);
		return v;
	};
	const rootOf = (p: Record<string, unknown>) => resolve(str(p.root, 'root'));

	const methods: Record<string, (p: Record<string, unknown>) => Promise<unknown>> = {
		async ping() {
			return 'pong';
		},
		async 'site.init'(p) {
			const root = rootOf(p);
			return { root, written: initSite(root, p.config as RevelarConfigInput | undefined) };
		},
		async 'site.open'(p) {
			const root = rootOf(p);
			if (!isSite(root)) return { root, isSite: false };
			const config = await readConfig(root);
			await watchPhotos(resolve(root, config.photosDir));
			return { root, isSite: true, config, albums: await listAlbums(root) };
		},
		async 'site.albums'(p) {
			return listAlbums(rootOf(p));
		},
		async 'site.config.save'(p) {
			const root = rootOf(p);
			saveConfig(root, p.config as RevelarConfigInput);
			return readConfig(root);
		},
		async 'album.get'(p) {
			return readAlbum(rootOf(p), str(p.slug, 'slug'));
		},
		async 'album.save'(p) {
			await saveAlbum(rootOf(p), str(p.slug, 'slug'), (p.patch ?? {}) as Record<string, unknown>);
			return readAlbum(rootOf(p), str(p.slug, 'slug'));
		},
		async 'album.add'(p) {
			return addAlbum(rootOf(p), str(p.source, 'source'), p.name as string | undefined);
		},
		async ingest(p) {
			const root = rootOf(p);
			const report = await runIngest({
				root,
				quiet: true,
				force: Boolean(p.force),
				onEvent: (e: IngestEvent) => emit('ingest', e)
			});
			const { manifest: _m, ...rest } = report;
			void _m;
			return rest;
		},
		async build(p) {
			const root = rootOf(p);
			return buildSite({ root, logLevel: 'warn' });
		},
		async 'preview.start'(p) {
			const root = rootOf(p);
			if (preview) await preview.close();
			preview = await previewSite({ root, port: p.port as number | undefined });
			return { url: preview.url };
		},
		async 'preview.stop'() {
			await preview?.close();
			preview = undefined;
			return true;
		},
		async share(p) {
			return shareLinks(str(p.slug, 'slug'), { root: rootOf(p) });
		},
		async 'publish.netlify'(p) {
			const root = rootOf(p);
			return publishNetlify({
				dir: resolve(root, 'build'),
				token: str(p.token, 'token'),
				siteId: p.siteId as string | undefined,
				siteName: p.siteName as string | undefined,
				onEvent: (e: PublishEvent) => emit('publish', e)
			});
		}
	};

	t.onMessage(async (req) => {
		const method = methods[req.method];
		if (!method) {
			t.send({ id: req.id, error: `Unknown method "${req.method}"` });
			return;
		}
		try {
			t.send({ id: req.id, result: await method(req.params ?? {}) });
		} catch (err) {
			t.send({ id: req.id, error: err instanceof Error ? err.message : String(err) });
		}
	});
	emit('ready', { pid: process.pid });
}
