import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	cloudflareHash,
	exportSite,
	gitBlobSha,
	isManagedUrl,
	predictUrl,
	zipDirectory
} from '../../src/engine/publish.ts';
import { titleFromPath } from '../../src/engine/site.ts';

describe('predictUrl', () => {
	it('knows each host’s address pattern', () => {
		expect(predictUrl('netlify', 'my-photos')).toBe('https://my-photos.netlify.app');
		expect(predictUrl('vercel', 'my-photos')).toBe('https://my-photos.vercel.app');
		expect(predictUrl('cloudflare', 'my-photos')).toBe('https://my-photos.pages.dev');
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
