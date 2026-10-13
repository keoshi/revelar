import { beforeAll, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateFixtures } from '../fixtures/generate.ts';
import { runIngest, type IngestReport } from '../../src/engine/ingest.ts';
import type { RevelarConfigInput } from '../../src/lib/config.ts';
import {
	unlockWithKey,
	unlockWithPassword,
	WrongPasswordError,
	parseHash
} from '../../src/lib/crypto/client.ts';
import { decryptWithKey, importDek, fromBase64Url, toBase64Url } from '../../src/lib/crypto/aes.ts';
import { expandSources } from '../../src/lib/utils/sources.ts';

const PASSWORD = 'correct horse battery staple';
const config: RevelarConfigInput = {
	site: { title: 'Test', baseUrl: 'https://example.com' },
	images: { widths: [320, 640, 1280] }
};

let root: string;
let report: IngestReport;

beforeAll(async () => {
	root = mkdtempSync(join(tmpdir(), 'revelar-private-'));
	await generateFixtures(join(root, 'photos'), { extras: true });
	process.env.REVELAR_TEST_PW = PASSWORD;
	report = await runIngest({ root, config, quiet: true });
}, 120_000);

describe('unlisted albums', () => {
	it('are in the manifest with visibility unlisted', () => {
		const rooftops = report.manifest.albums.find((a) => a.slug === 'rooftops')!;
		expect(rooftops.visibility).toBe('unlisted');
	});
});

describe('private albums', () => {
	it('fails the build when the password env var is missing', async () => {
		const saved = process.env.REVELAR_TEST_PW;
		delete process.env.REVELAR_TEST_PW;
		try {
			const r = await runIngest({ root, config, quiet: true });
			expect(r.errors.some((e) => e.includes('REVELAR_TEST_PW'))).toBe(true);
			expect(r.manifest.privateAlbums).toHaveLength(0);
		} finally {
			process.env.REVELAR_TEST_PW = saved;
		}
	});

	it('writes only an encrypted entry to the manifest, with a stable random token', async () => {
		expect(report.manifest.albums.some((a) => a.slug === 'secret-garden')).toBe(false);
		const entry = report.manifest.privateAlbums[0];
		expect(entry.slug).toBe('secret-garden');
		expect(entry.token).toMatch(/^[A-Za-z0-9_-]{16}$/);
		expect(entry.title).toBeUndefined();
		expect(entry.iterations).toBe(600_000);
		const json = JSON.stringify(report.manifest.privateAlbums);
		expect(json).not.toContain('Hidden fountain');
		expect(json).not.toContain('Nobody else');
		const again = await runIngest({ root, config, quiet: true });
		expect(again.manifest.privateAlbums[0].token).toBe(entry.token);
		expect(again.stats.encryptedFiles).toBe(0);
	});

	it('stores derivatives only as encrypted .bin files with opaque names', () => {
		const entry = report.manifest.privateAlbums[0];
		expect(existsSync(join(root, 'static', 'media', 'secret-garden'))).toBe(false);
		const dir = join(root, 'static', 'media-private', entry.token);
		const files = readdirSync(dir);
		expect(files.length).toBeGreaterThan(6);
		for (const f of files) {
			expect(f).toMatch(/^[A-Za-z0-9_-]+\.bin$/);
			const head = readFileSync(join(dir, f)).subarray(0, 12);
			expect(head.toString('latin1')).not.toContain('ftyp'); // not a plain AVIF
			expect(head.toString('latin1')).not.toContain('RIFF'); // not a plain WebP
			expect(head[0] === 0xff && head[1] === 0xd8).toBe(false); // not a plain JPEG
		}
	});

	it('unlocks with the password and decrypts photos; rejects a wrong password', async () => {
		const entry = report.manifest.privateAlbums[0];
		await expect(unlockWithPassword(entry, 'nope')).rejects.toBeInstanceOf(WrongPasswordError);
		const unlocked = await unlockWithPassword(entry, PASSWORD);
		expect(unlocked.payload.title).toBe('Secret garden');
		expect(unlocked.payload.photos).toHaveLength(3);
		const first = unlocked.payload.photos.find((p) => p.title === 'Hidden fountain')!;
		const src = expandSources(first.sources);
		expect(src.avif[0].url).toMatch(
			new RegExp(`^/media-private/${entry.token}/[A-Za-z0-9_-]+\\.bin$`)
		);
		expect(first.download?.url).toMatch(/\.bin$/);
		// decrypt one derivative with the DEK and check it is a real WebP
		const key = await importDek(unlocked.dek, ['decrypt']);
		const encrypted = readFileSync(join(root, 'static', src.webp[0].url));
		const plain = await decryptWithKey(key, new Uint8Array(encrypted));
		expect(Buffer.from(plain.subarray(0, 4)).toString('latin1')).toBe('RIFF');
		// key links round-trip
		const hash = `#k=${toBase64Url(unlocked.dek)}&photo=${first.id}`;
		const parsed = parseHash(hash);
		expect(parsed.photo).toBe(first.id);
		expect(Array.from(parsed.key!)).toEqual(Array.from(unlocked.dek));
		const viaKey = await unlockWithKey(entry, fromBase64Url(toBase64Url(unlocked.dek)));
		expect(viaKey.payload.count).toBe(3);
	});

	it('re-encrypts with a new key when the password changes', async () => {
		const before = report.manifest.privateAlbums[0];
		process.env.REVELAR_TEST_PW = 'a different password 12345';
		try {
			const after = await runIngest({ root, config, quiet: true });
			const entry = after.manifest.privateAlbums[0];
			expect(entry.token).toBe(before.token);
			expect(entry.wrappedKey).not.toBe(before.wrappedKey);
			expect(after.stats.encryptedFiles).toBeGreaterThan(0);
			await expect(unlockWithPassword(entry, PASSWORD)).rejects.toBeInstanceOf(WrongPasswordError);
			await expect(unlockWithPassword(entry, 'a different password 12345')).resolves.toBeTruthy();
		} finally {
			process.env.REVELAR_TEST_PW = PASSWORD;
			await runIngest({ root, config, quiet: true });
		}
	});
});
