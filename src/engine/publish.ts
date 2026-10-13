/**
 * Publishing a built site. Netlify first: its deploy API accepts a zip of the site, needs only
 * a personal access token, and gives a URL back in under a minute, which is what a one-click
 * "Publish" needs. Other targets (Cloudflare Pages, GitHub Pages, SFTP) can follow the same shape.
 */
import { createWriteStream, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import yazl from 'yazl';

export type PublishEvent =
	{ type: 'status'; message: string } | { type: 'progress'; done: number; total: number };

/** Zips `dir` (store-only for already-compressed media, deflate for the rest) into a temp file. */
export async function zipDirectory(
	dir: string,
	onEvent?: (e: PublishEvent) => void
): Promise<string> {
	const files: string[] = [];
	for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
		if (entry.isFile() && entry.name !== '.DS_Store')
			files.push(join(entry.parentPath, entry.name));
	}
	const out = join(tmpdir(), `revelar-deploy-${Date.now()}.zip`);
	const zip = new yazl.ZipFile();
	const stream = createWriteStream(out);
	const finished = new Promise<void>((resolve, reject) => {
		stream.on('close', () => resolve());
		stream.on('error', reject);
	});
	zip.outputStream.pipe(stream);
	let done = 0;
	for (const file of files) {
		const rel = relative(dir, file).split('\\').join('/');
		const compress = !/\.(jpe?g|webp|avif|png|zip|woff2?)$/i.test(rel);
		zip.addFile(file, rel, { compress, mtime: statSync(file).mtime });
		onEvent?.({ type: 'progress', done: ++done, total: files.length });
	}
	zip.end();
	await finished;
	return out;
}

export type NetlifyOptions = {
	/** absolute path of the built site */
	dir: string;
	/** personal access token (app.netlify.com → User settings → Applications) */
	token: string;
	/** deploy to an existing site; otherwise a new site is created */
	siteId?: string;
	/** name for a new site (becomes <name>.netlify.app when available) */
	siteName?: string;
	onEvent?: (e: PublishEvent) => void;
};

export type NetlifyResult = { siteId: string; siteName: string; url: string; deployId: string };

const API = 'https://api.netlify.com/api/v1';

export async function publishNetlify(opts: NetlifyOptions): Promise<NetlifyResult> {
	const headers = { Authorization: `Bearer ${opts.token}` };
	const emit = opts.onEvent ?? (() => {});
	let siteId = opts.siteId;
	let siteName = opts.siteName ?? '';
	if (!siteId) {
		emit({ type: 'status', message: 'Creating the Netlify site' });
		const res = await fetch(`${API}/sites`, {
			method: 'POST',
			headers: { ...headers, 'Content-Type': 'application/json' },
			body: JSON.stringify(opts.siteName ? { name: opts.siteName } : {})
		});
		if (!res.ok)
			throw new Error(`Netlify: could not create the site (${res.status} ${await res.text()})`);
		const site = (await res.json()) as { id: string; name: string };
		siteId = site.id;
		siteName = site.name;
	}
	emit({ type: 'status', message: 'Packing the site' });
	const zipPath = await zipDirectory(opts.dir, emit);
	emit({ type: 'status', message: 'Uploading' });
	const { readFile, rm } = await import('node:fs/promises');
	const body = await readFile(zipPath);
	const res = await fetch(`${API}/sites/${siteId}/deploys`, {
		method: 'POST',
		headers: { ...headers, 'Content-Type': 'application/zip' },
		body
	});
	await rm(zipPath, { force: true });
	if (!res.ok) throw new Error(`Netlify: upload failed (${res.status} ${await res.text()})`);
	const deploy = (await res.json()) as {
		id: string;
		ssl_url?: string;
		url?: string;
		state: string;
	};
	emit({ type: 'status', message: 'Waiting for Netlify to process the deploy' });
	for (let i = 0; i < 120; i++) {
		const poll = await fetch(`${API}/deploys/${deploy.id}`, { headers });
		const state = (await poll.json()) as {
			state: string;
			ssl_url?: string;
			url?: string;
			name?: string;
		};
		if (state.state === 'ready') {
			const url = state.ssl_url ?? state.url ?? deploy.ssl_url ?? deploy.url ?? '';
			emit({ type: 'status', message: `Live at ${url}` });
			return { siteId, siteName: siteName || (state.name ?? ''), url, deployId: deploy.id };
		}
		if (state.state === 'error') throw new Error('Netlify reported a failed deploy');
		await new Promise((r) => setTimeout(r, 2000));
	}
	throw new Error('Netlify: the deploy did not finish in time');
}
