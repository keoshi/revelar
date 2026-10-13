#!/usr/bin/env tsx
/** `npm run share <album>`: print the private album URL and the `#k=` key link. */
import { join } from 'node:path';
import { readJsonFile } from './ingest/cache.js';
import { loadConfig, ROOT } from './ingest/config.js';
import { fromBase64, toBase64Url } from '../src/lib/crypto/aes.ts';

const slug = process.argv[2];
if (!slug) {
	console.error('usage: npm run share <album-slug>');
	process.exit(1);
}
const config = await loadConfig();
const tokens = readJsonFile<Record<string, string>>(
	join(ROOT, '.cache', 'private-tokens.json'),
	{}
);
const keys = readJsonFile<Record<string, { dek: string }>>(
	join(ROOT, '.cache', 'private-keys.json'),
	{}
);
const token = tokens[slug];
const key = keys[slug];
if (!token || !key) {
	console.error(
		`No private album "${slug}" found. Run \`npm run ingest\` first; the album must have visibility: private.`
	);
	process.exit(1);
}
const base = config.site.baseUrl.replace(/\/$/, '');
const url = `${base}/p/${token}/`;
console.log(`Album URL (asks for the password):\n  ${url}\n`);
console.log(
	`Key link (unlocks without a password — share only with people who may see the album):\n  ${url}#k=${toBase64Url(fromBase64(key.dek))}`
);
