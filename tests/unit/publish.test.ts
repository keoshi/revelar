import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	cloudflareHash,
	exportSite,
	gitBlobSha,
	isManagedUrl,
	predictUrl,
	publishSpacefast,
	zipDirectory
} from '../../src/engine/publish.ts';
import { titleFromPath } from '../../src/engine/site.ts';

describe('predictUrl', () => {
	it('knows each host’s address pattern', () => {
		expect(predictUrl('netlify', 'my-photos')).toBe('https://my-photos.netlify.app');
		expect(predictUrl('vercel', 'my-photos')).toBe('https://my-photos.vercel.app');
		expect(predictUrl('cloudflare', 'my-photos')).toBe('https://my-photos.pages.dev');
		expect(predictUrl('spacefast', 'my-photos')).toBe('https://my-photos.space.fast');
		expect(predictUrl('github', 'my-photos', { login: 'Ana' })).toBe(
			'https://ana.github.io/my-photos'
		);
		expect(predictUrl('github', 'ana.github.io', { login: 'ana' })).toBe('https://ana.github.io');
	});
	it('is unknown without a name, or a GitHub login', () => {
		expect(predictUrl('netlify', '')).toBeUndefined();
		expect(predictUrl('github', 'x')).toBeUndefined();
	});
});

describe('isManagedUrl', () => {
	it('lets the publisher overwrite placeholders and host-given addresses', () => {
		expect(isManagedUrl('')).toBe(true);
		expect(isManagedUrl('https://photos.example.com')).toBe(true);
		expect(isManagedUrl('https://my-photos.netlify.app')).toBe(true);
		expect(isManagedUrl('https://ana.github.io/my-photos')).toBe(true);
		expect(isManagedUrl('https://my-photos.space.fast')).toBe(true);
		expect(isManagedUrl('https://my-photos.view.fast')).toBe(true);
		expect(isManagedUrl('not a url')).toBe(true);
	});
	it('leaves a custom domain alone', () => {
		expect(isManagedUrl('https://photos.ana.pt')).toBe(false);
		expect(isManagedUrl('https://dev.keoshi.com/revelar')).toBe(false);
	});
});

describe('exportSite', () => {
	it('refuses an address that is not one the site can live at', async () => {
		const root = mkdtempSync(join(tmpdir(), 'revelar-export-'));
		await expect(exportSite({ root, baseUrl: 'photos' })).rejects.toThrow('Not a web address');
		await expect(exportSite({ root, baseUrl: 'ftp://ana.pt' })).rejects.toThrow(
			'Not a web address'
		);
		await expect(exportSite({ root, baseUrl: 'https://photos.example.com' })).rejects.toThrow(
			'Enter the address'
		);
	});
});

describe('zipDirectory', () => {
	it('writes to the path it is given', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'revelar-zip-'));
		mkdirSync(join(dir, 'site'));
		writeFileSync(join(dir, 'site', 'index.html'), '<!doctype html>');
		const out = join(dir, 'site.zip');
		expect(await zipDirectory(join(dir, 'site'), undefined, out)).toBe(out);
		expect(existsSync(out) && statSync(out).size).toBeGreaterThan(0);
	});
});

describe('hashes', () => {
	it('matches Git’s blob id', () => {
		// `git hash-object` of an empty file and of "hello\n"
		expect(gitBlobSha(Buffer.alloc(0))).toBe('e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
		expect(gitBlobSha(Buffer.from('hello\n'))).toBe('ce013625030ba8dba906f756967f9e9ca394464a');
	});
	it('gives Cloudflare a 32-character key that depends on the extension', () => {
		const a = cloudflareHash(Buffer.from('<p>hi</p>'), 'index.html');
		const b = cloudflareHash(Buffer.from('<p>hi</p>'), 'index.txt');
		expect(a).toMatch(/^[0-9a-f]{32}$/);
		expect(a).not.toBe(b);
		expect(cloudflareHash(Buffer.from('<p>hi</p>'), 'other/index.html')).toBe(a);
	});
});

describe('titleFromPath', () => {
	it('turns the folder name into a title', () => {
		expect(titleFromPath('/Users/ana/Sites/my-photos')).toBe('My photos');
		expect(titleFromPath('/tmp/untitled folder')).toBe('Untitled folder');
		expect(titleFromPath('/tmp/2026_Travels')).toBe('2026 Travels');
	});
});

describe('publishSpacefast', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	const space = {
		id: 'spc_1',
		slug: 'my-photos',
		defaultHostname: 'my-photos.space.fast',
		liveUrl: 'https://my-photos.space.fast/'
	};
	const site = (...names: string[]) => {
		const dir = mkdtempSync(join(tmpdir(), 'revelar-sf-'));
		for (const n of names) writeFileSync(join(dir, n), n);
		return dir;
	};
	const target = (path: string) => ({
		path,
		method: 'PUT',
		url: `https://box.example/${path}`,
		headers: {}
	});
	const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
	const started = (paths: string[], total = paths.length) => ({
		data: {
			space,
			version: { id: 'ver_1', status: 'created' },
			activation: { outcome: 'pending' },
			next: { action: paths.length ? 'upload' : 'done' },
			upload: paths.length
				? {
						id: 'upl_1',
						summary: { upload: total, reused: 0, ignored: 0 },
						targets: paths.map(target)
					}
				: null
		}
	});
	/** A fake Spacefast: `routes` answers by URL suffix, in order for repeated calls. */
	function fake(routes: Record<string, (() => Response)[]>) {
		const calls: { method: string; url: string; body?: string; auth: string | null }[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: string | URL, init: RequestInit = {}) => {
				const url = String(input);
				calls.push({
					method: init.method ?? 'GET',
					url,
					body: typeof init.body === 'string' ? init.body : undefined,
					auth: new Headers(init.headers).get('authorization')
				});
				const key = Object.keys(routes).find((k) => url.endsWith(k));
				const queue = key ? routes[key] : undefined;
				const answer = queue && (queue.length > 1 ? queue.shift()! : queue[0]);
				return answer ? answer() : new Response('{}', { status: 404 });
			})
		);
		return calls;
	}
	const ready = () => json({ data: { id: 'ver_1', status: 'ready' } });

	it('declares the files, uploads them, refreshes to finish and waits for the version', async () => {
		const dir = site('index.html', 'a.jpg');
		const calls = fake({
			'/v1/publish': [() => json(started(['a.jpg']))],
			'box.example/a.jpg': [() => new Response(null)],
			'/uploads/refresh': [() => json({ data: { versionId: 'ver_1', upload: null } })],
			'/versions/ver_1': [() => json({ data: { id: 'ver_1', status: 'finalizing' } }), ready]
		});
		vi.useFakeTimers();
		const run = publishSpacefast({ dir, token: 'st_x', name: 'my-photos' });
		await vi.runAllTimersAsync();
		const result = await run;

		expect(result).toEqual({
			target: 'spacefast',
			siteId: 'spc_1',
			name: 'my-photos',
			url: 'https://my-photos.space.fast'
		});
		const start = JSON.parse(calls[0].body!) as {
			files: { path: string; sha256: string }[];
			space: unknown;
			publishMode: string;
		};
		expect(start.files.map((f) => f.path)).toEqual(['a.jpg', 'index.html']);
		expect(start.files[0].sha256).toMatch(/^[0-9a-f]{64}$/);
		expect(start.space).toEqual({ slug: 'my-photos', title: 'my-photos' });
		expect(start.publishMode).toBe('snapshot');
		// pre-signed upload addresses never see the API key
		expect(calls.find((c) => c.url.includes('box.example'))!.auth).toBeNull();
		expect(calls.map((c) => `${c.method} ${c.url.replace(/^https:\/\/[^/]+/, '')}`)).toEqual([
			'POST /v1/publish',
			'PUT /a.jpg',
			'POST /v1/spaces/spc_1/versions/ver_1/uploads/refresh',
			'GET /v1/spaces/spc_1/versions/ver_1',
			'GET /v1/spaces/spc_1/versions/ver_1'
		]);
	});

	it('pages through the upload until the refresh has nothing pending', async () => {
		const dir = site('a.jpg', 'b.jpg');
		const calls = fake({
			'/v1/publish': [() => json(started(['a.jpg'], 2))],
			'box.example/a.jpg': [() => new Response(null)],
			'box.example/b.jpg': [() => new Response(null)],
			'/uploads/refresh': [
				() =>
					json({
						data: { upload: { id: 'upl_1', summary: { upload: 2 }, targets: [target('b.jpg')] } }
					}),
				() => json({ data: { upload: null } })
			],
			'/versions/ver_1': [ready]
		});
		await publishSpacefast({ dir, token: 't', name: 'my-photos' });
		expect(calls.filter((c) => c.method === 'PUT').map((c) => c.url)).toEqual([
			'https://box.example/a.jpg',
			'https://box.example/b.jpg'
		]);
	});

	it('retries a busy upload host and finalizes when the server hands that step back', async () => {
		const dir = site('a.jpg');
		const calls = fake({
			'/v1/publish': [() => json(started(['a.jpg']))],
			'box.example/a.jpg': [() => new Response('busy', { status: 503 }), () => new Response(null)],
			'/uploads/refresh': [() => json({ data: { upload: null } })],
			'/versions/ver_1': [() => json({ data: { id: 'ver_1', status: 'uploaded' } }), ready],
			'/finalize': [() => json({ data: { id: 'ver_1', status: 'finalizing' } })]
		});
		vi.useFakeTimers();
		const run = publishSpacefast({ dir, token: 't', name: 'my-photos' });
		await vi.runAllTimersAsync();
		await run;
		expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(2);
		expect(calls.some((c) => c.url.endsWith('/finalize'))).toBe(true);
	});

	it('reports a failed version with Spacefast’s reason', async () => {
		const dir = site('a.jpg');
		fake({
			'/v1/publish': [() => json(started([]))],
			'/versions/ver_1': [
				() => json({ data: { id: 'ver_1', status: 'failed', failureMessage: 'Disk full' } })
			]
		});
		await expect(publishSpacefast({ dir, token: 't', siteId: 'spc_1' })).rejects.toThrow(
			'Spacefast reported a failed publish: Disk full'
		);
	});

	it('names the existing space instead of creating one', async () => {
		const dir = site('index.html');
		const calls = fake({ '/v1/publish': [() => json(started([]))], '/versions/ver_1': [ready] });
		await publishSpacefast({ dir, token: 't', name: 's', siteId: 'spc_1' });
		const body = JSON.parse(calls[0].body!) as Record<string, unknown>;
		expect(body.spaceId).toBe('spc_1');
		expect(body.space).toBeUndefined();
	});

	it('updates a space of its own when the name is already taken by it', async () => {
		const dir = site('index.html');
		const calls = fake({
			'/v1/publish': [
				() => json({ detail: 'Unavailable', code: 'slug_unavailable' }, 422),
				() => json(started([]))
			],
			'/v1/spaces': [() => json({ data: [{ id: 'spc_mine', slug: 'taken' }] })],
			'/versions/ver_1': [ready]
		});
		await publishSpacefast({ dir, token: 't', name: 'taken' });
		const second = JSON.parse(calls.filter((c) => c.url.endsWith('/v1/publish'))[1].body!);
		expect(second.spaceId).toBe('spc_mine');
	});

	it('reads a problem document as its detail', async () => {
		const dir = site('index.html');
		fake({
			'/v1/publish': [
				() =>
					json({ detail: 'That name is taken', code: 'slug_unavailable', requestId: 'req_9' }, 409)
			]
		});
		await expect(publishSpacefast({ dir, token: 't', siteId: 'spc_x' })).rejects.toThrow(
			'Spacefast: could not start the publish (409): That name is taken (slug_unavailable, request req_9)'
		);
	});
});
