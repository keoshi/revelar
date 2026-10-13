/** Private-album share links: the album URL (asks for the password) and the `#k=` key link. */
import { join, resolve } from 'node:path';
import { readJsonFile } from './cache.ts';
import { loadConfig } from './config.ts';
import { fromBase64, toBase64Url } from '../lib/crypto/aes.ts';

export type ShareLinks = { url: string; keyLink: string };

export async function shareLinks(
	slug: string,
	opts: { root?: string; config?: string } = {}
): Promise<ShareLinks> {
	const root = resolve(opts.root ?? process.env.REVELAR_SITE_ROOT ?? process.cwd());
	const config = await loadConfig(
		opts.config
			? resolve(opts.config)
			: process.env.REVELAR_CONFIG
				? undefined
				: join(root, 'revelar.config.ts')
	);
	const tokens = readJsonFile<Record<string, string>>(
		join(root, '.cache', 'private-tokens.json'),
		{}
	);
	const keys = readJsonFile<Record<string, { dek: string }>>(
		join(root, '.cache', 'private-keys.json'),
		{}
	);
	const token = tokens[slug];
	const key = keys[slug];
	if (!token || !key)
		throw new Error(
			`No private album "${slug}" found. Run \`revelar ingest\` first; the album must have visibility: private.`
		);
	const base = config.site.baseUrl.replace(/\/$/, '');
	const url = `${base}/p/${token}/`;
	return { url, keyLink: `${url}#k=${toBase64Url(fromBase64(key.dek))}` };
}
