/**
 * Publishing a built site to a static host with nothing but a token: Netlify (zip deploy),
 * Vercel (file upload plus a deployment), Cloudflare Pages (direct upload) and GitHub Pages (a
 * `gh-pages` branch written through the Git data API). Every provider has the same shape, a
 * token, a name and a URL back, so a "Publish" button can offer them side by side.
 *
 * `publishSite` wraps a provider with the site address: when `site.baseUrl` is still the
 * placeholder or a host-given address, it is set to where the site will live before the build,
 * and corrected (with one more build and upload) if the host hands back a different one.
 * `exportSite` is the same without a host: the built folder (or a zip of it) to upload anywhere.
 */
import { createHash } from 'node:crypto';
import { createWriteStream, readdirSync, readFileSync, statSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import yazl from 'yazl';
import pLimit from 'p-limit';
import { blake3 } from '@noble/hashes/blake3.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { runIngest, type IngestEvent } from './ingest.ts';
import { buildSite } from './build.ts';
import { patchConfig, readConfig } from './site.ts';

export type PublishEvent =
	{ type: 'status'; message: string } | { type: 'progress'; done: number; total: number };

export type PublishTarget = 'netlify' | 'vercel' | 'cloudflare' | 'github';
export const PUBLISH_TARGETS: PublishTarget[] = ['netlify', 'vercel', 'cloudflare', 'github'];

export type PublishOptions = {
	/** absolute path of the built site */
	dir: string;
	target: PublishTarget;
	/** a personal access / API token for the provider */
	token: string;
	/** site, project or repository name (Netlify may leave it empty for a random one) */
	name?: string;
	/** Cloudflare account ID */
	account?: string;
	/** an existing Netlify site to update instead of creating one */
	siteId?: string;
	onEvent?: (e: PublishEvent) => void;
};

export type PublishResult = {
	target: PublishTarget;
	name: string;
	/** Netlify's site id (needed to update the same site again) */
	siteId?: string;
	/** where the site is served from, without a trailing slash */
	url: string;
};

type Emit = (e: PublishEvent) => void;
type Entry = { abs: string; rel: string; size: number };

const MIME: Record<string, string> = {
	html: 'text/html',
	css: 'text/css',
	js: 'text/javascript',
	mjs: 'text/javascript',
	json: 'application/json',
	xml: 'application/xml',
	txt: 'text/plain',
	svg: 'image/svg+xml',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	webp: 'image/webp',
	avif: 'image/avif',
	png: 'image/png',
	ico: 'image/x-icon',
	woff2: 'font/woff2',
	woff: 'font/woff',
	zip: 'application/zip',
	webmanifest: 'application/manifest+json'
};
const contentType = (rel: string) =>
	MIME[extname(rel).slice(1).toLowerCase()] ?? 'application/octet-stream';

/** Every file under `dir` with its path relative to it, forward slashes, Finder litter skipped. */
export function listFiles(dir: string): Entry[] {
	const out: Entry[] = [];
	for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
		if (!entry.isFile() || entry.name === '.DS_Store') continue;
		const abs = join(entry.parentPath, entry.name);
		out.push({ abs, rel: relative(dir, abs).split('\\').join('/'), size: statSync(abs).size });
	}
	return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

async function mapLimit<T, R>(
	items: T[],
	concurrency: number,
	fn: (item: T) => Promise<R>,
	onProgress?: (done: number, total: number) => void
): Promise<R[]> {
	const limit = pLimit(concurrency);
	let done = 0;
	return Promise.all(
		items.map((item) =>
			limit(async () => {
				const r = await fn(item);
				onProgress?.(++done, items.length);
				return r;
			})
		)
	);
}

async function request<T>(
	label: string,
	url: string,
	init: RequestInit & { json?: unknown } = {}
): Promise<T> {
	const { json, ...rest } = init;
	const headers = new Headers(rest.headers);
	if (json !== undefined) headers.set('Content-Type', 'application/json');
	const res = await fetch(url, {
		...rest,
		headers,
		body: json !== undefined ? JSON.stringify(json) : rest.body
	});
	if (!res.ok) {
		const text = (await res.text()).slice(0, 400);
		throw new Error(`${label} (${res.status}): ${text || res.statusText}`);
	}
	return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The address a site will have on a host, before anything is uploaded. */
export function predictUrl(
	target: PublishTarget,
	name: string,
	extra: { login?: string } = {}
): string | undefined {
	if (!name) return undefined;
	switch (target) {
		case 'netlify':
			return `https://${name}.netlify.app`;
		case 'vercel':
			return `https://${name}.vercel.app`;
		case 'cloudflare':
			return `https://${name}.pages.dev`;
		case 'github': {
			if (!extra.login) return undefined;
			const login = extra.login.toLowerCase();
			return name.toLowerCase() === `${login}.github.io`
				? `https://${login}.github.io`
				: `https://${login}.github.io/${name}`;
		}
	}
}

/**
 * Whether `baseUrl` is one the publisher may overwrite: the placeholder, empty, or an address a
 * host hands out. A custom domain is the owner's decision and is left alone.
 */
export function isManagedUrl(baseUrl: string): boolean {
	if (!baseUrl) return true;
	try {
		const host = new URL(baseUrl).hostname;
		return (
			host === 'photos.example.com' ||
			/\.(netlify\.app|vercel\.app|pages\.dev|github\.io)$/.test(host)
		);
	} catch {
		return true;
	}
}

const normaliseUrl = (url: string) => url.replace(/\/+$/, '').toLowerCase();

/** Runs the provider for `opts.target`. */
export async function publish(opts: PublishOptions): Promise<PublishResult> {
	switch (opts.target) {
		case 'netlify':
			return publishNetlify(opts);
		case 'vercel':
			return publishVercel(opts);
		case 'cloudflare':
			return publishCloudflare(opts);
		case 'github':
			return publishGitHub(opts);
	}
}

export type PublishSiteOptions = Omit<PublishOptions, 'dir'> & {
	/** the site folder */
	root: string;
	onIngest?: (e: IngestEvent) => void;
};

export type PublishSiteResult = PublishResult & {
	/** `site.baseUrl` after publishing */
	baseUrl: string;
	/** whether the config was rewritten with the live address */
	baseUrlChanged: boolean;
};

/**
 * Processes, builds and publishes a site, keeping `site.baseUrl` in step with where it lives so
 * shared links, the sitemap and feeds point at the right place without the owner editing the
 * config by hand.
 */
export async function publishSite(opts: PublishSiteOptions): Promise<PublishSiteResult> {
	const emit: Emit = opts.onEvent ?? (() => {});
	const { root } = opts;
	let config = await readConfig(root);
	const managed = isManagedUrl(config.site.baseUrl);
	let changed = false;

	const expected = await expectedUrl(opts);
	if (managed && expected && normaliseUrl(expected) !== normaliseUrl(config.site.baseUrl)) {
		emit({ type: 'status', message: `Site address set to ${expected}` });
		config = await patchConfig(root, { site: { baseUrl: expected } });
		changed = true;
	}

	emit({ type: 'status', message: 'Processing photos' });
	await runIngest({ root, quiet: true, onEvent: opts.onIngest });
	emit({ type: 'status', message: 'Building the site' });
	await buildSite({ root, logLevel: 'warn' });

	const dir = resolve(root, 'build');
	let result = await publish({ ...opts, dir });

	// The host chose a different address (a name taken, a random Netlify name): build once more
	// with the real one so nothing inside the site points at the wrong place.
	if (managed && result.url && normaliseUrl(result.url) !== normaliseUrl(config.site.baseUrl)) {
		emit({ type: 'status', message: `Live at ${result.url}; rebuilding with that address` });
		config = await patchConfig(root, { site: { baseUrl: result.url } });
		changed = true;
		await buildSite({ root, logLevel: 'warn' });
		result = await publish({
			...opts,
			dir,
			siteId: result.siteId ?? opts.siteId,
			name: result.name
		});
	}
	emit({ type: 'status', message: `Live at ${result.url}` });
	return { ...result, baseUrl: config.site.baseUrl, baseUrlChanged: changed };
}

export type ExportSiteOptions = {
	/** the site folder */
	root: string;
	/** where the owner will upload the site; becomes `site.baseUrl` */
	baseUrl: string;
	onEvent?: (e: PublishEvent) => void;
	onIngest?: (e: IngestEvent) => void;
};

export type ExportSiteResult = {
	/** the built site, ready to upload as is */
	dir: string;
	files: number;
	bytes: number;
	baseUrl: string;
	baseUrlChanged: boolean;
};

/**
 * Processes and builds a site for a server of the owner's own: no host, no token. The address
 * matters as much as with a host (shared links, the sitemap and feeds use it, and a path such as
 * `/photos` makes every page work from that subfolder), so it is written into the config first.
 */
export async function exportSite(opts: ExportSiteOptions): Promise<ExportSiteResult> {
	const emit = opts.onEvent ?? (() => {});
	const { root } = opts;
	let url: URL;
	try {
		url = new URL(opts.baseUrl.trim());
	} catch {
		throw new Error(`Not a web address: ${opts.baseUrl}`);
	}
	if (url.protocol !== 'https:' && url.protocol !== 'http:')
		throw new Error(`Not a web address: ${opts.baseUrl}`);
	if (url.hostname === 'photos.example.com')
		throw new Error('Enter the address the site will live at');
	const baseUrl = url.href.replace(/\/+$/, '');

	let config = await readConfig(root);
	let changed = false;
	if (normaliseUrl(baseUrl) !== normaliseUrl(config.site.baseUrl)) {
		config = await patchConfig(root, { site: { baseUrl } });
		changed = true;
	}
	emit({ type: 'status', message: 'Processing photos' });
	await runIngest({ root, quiet: true, onEvent: opts.onIngest });
	emit({ type: 'status', message: 'Building the site' });
	await buildSite({ root, logLevel: 'warn' });

	const dir = resolve(root, 'build');
	const files = listFiles(dir);
	return {
		dir,
		files: files.length,
		bytes: files.reduce((sum, f) => sum + f.size, 0),
		baseUrl: config.site.baseUrl,
		baseUrlChanged: changed
	};
}

/** Where the site will be once published, when that can be known up front. */
async function expectedUrl(opts: PublishSiteOptions): Promise<string | undefined> {
	if (opts.target === 'netlify' && opts.siteId) {
		const site = await request<{ ssl_url?: string; url?: string }>(
			'Netlify: could not read the site',
			`${NETLIFY}/sites/${opts.siteId}`,
			{ headers: { Authorization: `Bearer ${opts.token}` } }
		);
		return site.ssl_url ?? site.url;
	}
	if (opts.target === 'github')
		return predictUrl('github', opts.name ?? '', { login: await githubLogin(opts.token) });
	return predictUrl(opts.target, opts.name ?? '');
}

// ---- Netlify ----------------------------------------------------------------------------------

const NETLIFY = 'https://api.netlify.com/api/v1';

/**
 * Zips `dir` (store-only for already-compressed media, deflate for the rest) into `out`, a temp
 * file by default.
 */
export async function zipDirectory(
	dir: string,
	onEvent?: Emit,
	out = join(tmpdir(), `revelar-deploy-${Date.now()}.zip`)
): Promise<string> {
	const files = listFiles(dir);
	const zip = new yazl.ZipFile();
	const stream = createWriteStream(out);
	const finished = new Promise<void>((resolve, reject) => {
		stream.on('close', () => resolve());
		stream.on('error', reject);
	});
	zip.outputStream.pipe(stream);
	let done = 0;
	for (const file of files) {
		const compress = !/\.(jpe?g|webp|avif|png|zip|woff2?)$/i.test(file.rel);
		zip.addFile(file.abs, file.rel, { compress, mtime: statSync(file.abs).mtime });
		onEvent?.({ type: 'progress', done: ++done, total: files.length });
	}
	zip.end();
	await finished;
	return out;
}

export async function publishNetlify(opts: Omit<PublishOptions, 'target'>): Promise<PublishResult> {
	const headers = { Authorization: `Bearer ${opts.token}` };
	const emit: Emit = opts.onEvent ?? (() => {});
	let siteId = opts.siteId;
	let siteName = opts.name ?? '';
	if (!siteId) {
		emit({ type: 'status', message: 'Creating the Netlify site' });
		const site = await request<{ id: string; name: string }>(
			'Netlify: could not create the site',
			`${NETLIFY}/sites`,
			{ method: 'POST', headers, json: siteName ? { name: siteName } : {} }
		);
		siteId = site.id;
		siteName = site.name;
	}
	emit({ type: 'status', message: 'Packing the site' });
	const zipPath = await zipDirectory(opts.dir, emit);
	emit({ type: 'status', message: 'Uploading to Netlify' });
	const body = await readFile(zipPath);
	let deploy: { id: string; ssl_url?: string; url?: string };
	try {
		deploy = await request('Netlify: upload failed', `${NETLIFY}/sites/${siteId}/deploys`, {
			method: 'POST',
			headers: { ...headers, 'Content-Type': 'application/zip' },
			body
		});
	} finally {
		await rm(zipPath, { force: true });
	}
	emit({ type: 'status', message: 'Waiting for Netlify to process the deploy' });
	for (let i = 0; i < 150; i++) {
		const state = await request<{ state: string; ssl_url?: string; url?: string; name?: string }>(
			'Netlify: could not read the deploy',
			`${NETLIFY}/deploys/${deploy.id}`,
			{ headers }
		);
		if (state.state === 'ready') {
			const url = (state.ssl_url ?? state.url ?? deploy.ssl_url ?? deploy.url ?? '').replace(
				/\/$/,
				''
			);
			return { target: 'netlify', siteId, name: siteName || (state.name ?? ''), url };
		}
		if (state.state === 'error') throw new Error('Netlify reported a failed deploy');
		await sleep(2000);
	}
	throw new Error('Netlify: the deploy did not finish in time');
}

// ---- Vercel -----------------------------------------------------------------------------------

const VERCEL = 'https://api.vercel.com';

export async function publishVercel(opts: Omit<PublishOptions, 'target'>): Promise<PublishResult> {
	const name = opts.name?.trim();
	if (!name) throw new Error('Vercel needs a project name');
	const headers = { Authorization: `Bearer ${opts.token}` };
	const emit: Emit = opts.onEvent ?? (() => {});
	const files = listFiles(opts.dir);

	emit({ type: 'status', message: 'Uploading to Vercel' });
	const entries = await mapLimit(
		files,
		8,
		async (f) => {
			const data = readFileSync(f.abs);
			const sha = createHash('sha1').update(data).digest('hex');
			await request('Vercel: upload failed', `${VERCEL}/v2/files`, {
				method: 'POST',
				headers: { ...headers, 'Content-Type': 'application/octet-stream', 'x-vercel-digest': sha },
				body: data
			});
			return { file: f.rel, sha, size: data.length };
		},
		(done, total) => emit({ type: 'progress', done, total })
	);

	emit({ type: 'status', message: 'Creating the deployment' });
	const deployment = await request<{ id: string; url: string; readyState: string }>(
		'Vercel: could not create the deployment',
		`${VERCEL}/v13/deployments?skipAutoDetectionConfirmation=1`,
		{
			method: 'POST',
			headers,
			json: { name, files: entries, target: 'production', projectSettings: { framework: null } }
		}
	);

	emit({ type: 'status', message: 'Waiting for Vercel to finish the deployment' });
	for (let i = 0; i < 150; i++) {
		const state = await request<{ readyState: string; url: string; alias?: string[] }>(
			'Vercel: could not read the deployment',
			`${VERCEL}/v13/deployments/${deployment.id}`,
			{ headers }
		);
		if (state.readyState === 'READY') {
			const aliases = state.alias ?? [];
			const host =
				aliases.find((a) => a === `${name}.vercel.app`) ??
				aliases.find((a) => a.endsWith('.vercel.app')) ??
				aliases[0] ??
				state.url;
			return { target: 'vercel', name, url: `https://${host}` };
		}
		if (state.readyState === 'ERROR' || state.readyState === 'CANCELED')
			throw new Error(`Vercel reported a ${state.readyState.toLowerCase()} deployment`);
		await sleep(2000);
	}
	throw new Error('Vercel: the deployment did not finish in time');
}

// ---- Cloudflare Pages ------------------------------------------------------------------------

const CF = 'https://api.cloudflare.com/client/v4';
const CF_BUCKET_BYTES = 40 * 1024 * 1024;
const CF_BUCKET_FILES = 2000;

/** Cloudflare's asset key: blake3 of the base64 content plus the extension, 32 hex chars. */
export function cloudflareHash(data: Buffer, rel: string): string {
	const b64 = data.toString('base64');
	return bytesToHex(blake3(utf8ToBytes(b64 + extname(rel).slice(1)))).slice(0, 32);
}

export async function publishCloudflare(
	opts: Omit<PublishOptions, 'target'>
): Promise<PublishResult> {
	const name = opts.name?.trim();
	if (!name) throw new Error('Cloudflare Pages needs a project name');
	if (!opts.account) throw new Error('Cloudflare Pages needs your account ID');
	const headers = { Authorization: `Bearer ${opts.token}` };
	const emit: Emit = opts.onEvent ?? (() => {});
	const base = `${CF}/accounts/${opts.account}/pages/projects`;
	type Project = { result: { subdomain?: string; production_branch?: string } };

	let project: Project['result'];
	const existing = await fetch(`${base}/${name}`, { headers });
	if (existing.status === 404) {
		emit({ type: 'status', message: 'Creating the Cloudflare Pages project' });
		project = (
			await request<Project>('Cloudflare: could not create the project', base, {
				method: 'POST',
				headers,
				json: { name, production_branch: 'main' }
			})
		).result;
	} else if (!existing.ok) {
		throw new Error(`Cloudflare: could not read the project (${existing.status})`);
	} else project = ((await existing.json()) as Project).result;

	const { jwt } = (
		await request<{ result: { jwt: string } }>(
			'Cloudflare: could not get an upload token',
			`${base}/${name}/upload-token`,
			{ headers }
		)
	).result;
	const assetHeaders = { Authorization: `Bearer ${jwt}` };

	emit({ type: 'status', message: 'Checking what Cloudflare already has' });
	const files = listFiles(opts.dir).map((f) => ({
		...f,
		hash: cloudflareHash(readFileSync(f.abs), f.rel)
	}));
	const missing = new Set<string>();
	for (let i = 0; i < files.length; i += 5000) {
		const res = await request<{ result: string[] }>(
			'Cloudflare: could not check assets',
			`${CF}/pages/assets/check-missing`,
			{
				method: 'POST',
				headers: assetHeaders,
				json: { hashes: files.slice(i, i + 5000).map((f) => f.hash) }
			}
		);
		for (const h of res.result) missing.add(h);
	}

	const toUpload = files.filter((f) => missing.has(f.hash));
	const buckets: (typeof toUpload)[] = [];
	let bucket: typeof toUpload = [];
	let bytes = 0;
	for (const f of toUpload) {
		if (bucket.length && (bytes + f.size > CF_BUCKET_BYTES || bucket.length >= CF_BUCKET_FILES)) {
			buckets.push(bucket);
			bucket = [];
			bytes = 0;
		}
		bucket.push(f);
		bytes += f.size;
	}
	if (bucket.length) buckets.push(bucket);

	emit({ type: 'status', message: `Uploading ${toUpload.length} files to Cloudflare` });
	let uploaded = 0;
	await mapLimit(buckets, 3, async (b) => {
		const payload = b.map((f) => ({
			key: f.hash,
			value: readFileSync(f.abs).toString('base64'),
			metadata: { contentType: contentType(f.rel) },
			base64: true
		}));
		await request('Cloudflare: upload failed', `${CF}/pages/assets/upload`, {
			method: 'POST',
			headers: assetHeaders,
			json: payload
		});
		uploaded += b.length;
		emit({ type: 'progress', done: uploaded, total: toUpload.length });
	});
	await request('Cloudflare: could not register assets', `${CF}/pages/assets/upsert-hashes`, {
		method: 'POST',
		headers: assetHeaders,
		json: { hashes: files.map((f) => f.hash) }
	});

	emit({ type: 'status', message: 'Creating the deployment' });
	const form = new FormData();
	form.append(
		'manifest',
		JSON.stringify(Object.fromEntries(files.map((f) => [`/${f.rel}`, f.hash])))
	);
	form.append('branch', project.production_branch ?? 'main');
	const deployment = await request<{ result: { id: string; url: string } }>(
		'Cloudflare: could not create the deployment',
		`${base}/${name}/deployments`,
		{ method: 'POST', headers, body: form }
	);

	emit({ type: 'status', message: 'Waiting for Cloudflare to finish the deployment' });
	for (let i = 0; i < 60; i++) {
		const state = await request<{ result: { latest_stage?: { name: string; status: string } } }>(
			'Cloudflare: could not read the deployment',
			`${base}/${name}/deployments/${deployment.result.id}`,
			{ headers }
		);
		const stage = state.result.latest_stage;
		if (stage?.name === 'deploy' && stage.status === 'success') break;
		if (stage?.status === 'failure') throw new Error('Cloudflare reported a failed deployment');
		await sleep(2000);
	}
	return { target: 'cloudflare', name, url: `https://${project.subdomain ?? `${name}.pages.dev`}` };
}

// ---- GitHub Pages -----------------------------------------------------------------------------

const GH = 'https://api.github.com';
const ghHeaders = (token: string) => ({
	Authorization: `Bearer ${token}`,
	Accept: 'application/vnd.github+json',
	'X-GitHub-Api-Version': '2022-11-28',
	'User-Agent': 'revelar'
});

async function githubLogin(token: string): Promise<string> {
	const user = await request<{ login: string }>(
		'GitHub: could not read the account',
		`${GH}/user`,
		{
			headers: ghHeaders(token)
		}
	);
	return user.login;
}

/** The sha1 Git gives a blob, so unchanged files can be reused without uploading them again. */
export function gitBlobSha(data: Buffer): string {
	return createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex');
}

export async function publishGitHub(opts: Omit<PublishOptions, 'target'>): Promise<PublishResult> {
	const name = opts.name?.trim();
	if (!name) throw new Error('GitHub Pages needs a repository name');
	const headers = ghHeaders(opts.token);
	const emit: Emit = opts.onEvent ?? (() => {});
	const login = await githubLogin(opts.token);
	const repo = `${GH}/repos/${login}/${name}`;
	const branch = 'gh-pages';

	const exists = await fetch(repo, { headers });
	if (exists.status === 404) {
		emit({ type: 'status', message: `Creating the repository ${login}/${name}` });
		await request('GitHub: could not create the repository', `${GH}/user/repos`, {
			method: 'POST',
			headers,
			json: {
				name,
				description: 'A photo site built with Revelar',
				has_issues: false,
				has_wiki: false,
				has_projects: false
			}
		});
	} else if (!exists.ok)
		throw new Error(`GitHub: could not read the repository (${exists.status})`);

	// What is on the branch now, so only changed files travel.
	let parent: string | undefined;
	const known = new Map<string, string>();
	const ref = await fetch(`${repo}/git/ref/heads/${branch}`, { headers });
	if (ref.ok) {
		parent = ((await ref.json()) as { object: { sha: string } }).object.sha;
		const tree = await request<{ tree: { path: string; type: string; sha: string }[] }>(
			'GitHub: could not read the branch',
			`${repo}/git/trees/${parent}?recursive=1`,
			{ headers }
		);
		for (const t of tree.tree) if (t.type === 'blob') known.set(t.path, t.sha);
	}

	// `.nojekyll` keeps GitHub from dropping the `_app/` folder.
	const files = listFiles(opts.dir).map((f) => ({ rel: f.rel, data: () => readFileSync(f.abs) }));
	files.push({ rel: '.nojekyll', data: () => Buffer.alloc(0) });

	emit({ type: 'status', message: 'Uploading to GitHub' });
	const tree = await mapLimit(
		files,
		6,
		async (f) => {
			const data = f.data();
			const sha = gitBlobSha(data);
			if (known.get(f.rel) !== sha) {
				await request('GitHub: upload failed', `${repo}/git/blobs`, {
					method: 'POST',
					headers,
					json: { content: data.toString('base64'), encoding: 'base64' }
				});
			}
			return { path: f.rel, mode: '100644', type: 'blob', sha };
		},
		(done, total) => emit({ type: 'progress', done, total })
	);

	emit({ type: 'status', message: 'Committing' });
	const { sha: treeSha } = await request<{ sha: string }>(
		'GitHub: could not write the tree',
		`${repo}/git/trees`,
		{ method: 'POST', headers, json: { tree } }
	);
	const { sha: commitSha } = await request<{ sha: string }>(
		'GitHub: could not commit',
		`${repo}/git/commits`,
		{
			method: 'POST',
			headers,
			json: { message: 'Publish site', tree: treeSha, parents: parent ? [parent] : [] }
		}
	);
	if (parent)
		await request('GitHub: could not update the branch', `${repo}/git/refs/heads/${branch}`, {
			method: 'PATCH',
			headers,
			json: { sha: commitSha, force: true }
		});
	else
		await request('GitHub: could not create the branch', `${repo}/git/refs`, {
			method: 'POST',
			headers,
			json: { ref: `refs/heads/${branch}`, sha: commitSha }
		});

	emit({ type: 'status', message: 'Turning on GitHub Pages' });
	type Pages = { html_url?: string; source?: { branch: string; path: string } };
	let pages: Pages | undefined;
	const current = await fetch(`${repo}/pages`, { headers });
	if (current.status === 404) {
		pages = await request<Pages>('GitHub: could not enable Pages', `${repo}/pages`, {
			method: 'POST',
			headers,
			json: { build_type: 'legacy', source: { branch, path: '/' } }
		});
	} else if (current.ok) {
		pages = (await current.json()) as Pages;
		if (pages.source?.branch !== branch || pages.source?.path !== '/') {
			await request('GitHub: could not point Pages at the branch', `${repo}/pages`, {
				method: 'PUT',
				headers,
				json: { source: { branch, path: '/' } }
			});
		}
	} else throw new Error(`GitHub: could not read the Pages settings (${current.status})`);

	const url = (pages?.html_url ?? predictUrl('github', name, { login }) ?? '').replace(/\/$/, '');
	emit({ type: 'status', message: 'Waiting for GitHub to publish the site' });
	for (let i = 0; i < 90; i++) {
		await sleep(2000);
		const build = await fetch(`${repo}/pages/builds/latest`, { headers });
		if (!build.ok) continue;
		const { status } = (await build.json()) as { status: string | null };
		if (status === 'built') break;
		if (status === 'errored') throw new Error('GitHub Pages reported a failed build');
	}
	return { target: 'github', name, url };
}
