import { expect, test } from '@playwright/test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PASSWORD = process.env.REVELAR_TEST_PW ?? 'correct horse battery staple';
const SITE_ROOT = process.env.REVELAR_SITE_ROOT ?? 'tests/e2e/.site';

function manifest() {
	return JSON.parse(readFileSync(join(SITE_ROOT, '.cache/manifest.json'), 'utf8')) as {
		privateAlbums: { token: string }[];
	};
}

function walk(dir: string, out: string[] = []): string[] {
	for (const f of readdirSync(dir)) {
		const p = join(dir, f);
		if (statSync(p).isDirectory()) walk(p, out);
		else out.push(p);
	}
	return out;
}

test.describe('unlisted albums', () => {
	test('are reachable at their slug, noindex, and absent from the home page', async ({ page }) => {
		await page.goto('/');
		await expect(page.locator('.covers li')).toHaveCount(3);
		await expect(page.locator('.covers')).not.toContainText('Rooftops');
		await page.goto('/rooftops/');
		await expect(page.locator('h1')).toHaveText('Rooftops');
		await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
	});
});

test.describe('private albums', () => {
	test('nothing from the private album appears in plaintext in build/', () => {
		const files = walk(join(SITE_ROOT, 'build')).filter(
			(f) => !/\.(avif|webp|jpg|png|zip|woff2|bin)$/.test(f)
		);
		for (const f of files) {
			const text = readFileSync(f, 'latin1');
			expect(text, f).not.toContain('Hidden fountain');
			expect(text, f).not.toContain('Nobody else has seen this');
			expect(text, f).not.toContain('secret-garden');
			expect(text, f).not.toContain('Secret garden');
		}
		const { token } = manifest().privateAlbums[0];
		const bins = walk(join(SITE_ROOT, 'build', 'media-private', token));
		expect(bins.length).toBeGreaterThan(6);
		for (const b of bins) {
			const head = readFileSync(b).subarray(0, 12).toString('latin1');
			expect(head, b).not.toContain('ftyp');
			expect(head, b).not.toContain('RIFF');
		}
	});

	test('wrong password shows an error, the right one renders the album, and the viewer works', async ({
		page
	}) => {
		const { token } = manifest().privateAlbums[0];
		await page.goto(`/p/${token}/`);
		await expect(page.getByRole('dialog')).toBeVisible();
		await expect(page.locator('h1')).toHaveText('Private album');
		await page.getByLabel('Password').fill('wrong password');
		await page.getByRole('button', { name: 'Unlock' }).click();
		await expect(page.getByRole('alert')).toContainText('Wrong password', { timeout: 15000 });
		await page.getByLabel('Password').fill(PASSWORD);
		await page.getByRole('button', { name: 'Unlock' }).click();
		await expect(page.locator('h1')).toHaveText('Secret garden', { timeout: 15000 });
		const tiles = page.locator('[data-tile]');
		await expect(tiles).toHaveCount(3);
		await expect(tiles.first().locator('img')).toHaveAttribute('src', /^blob:/, { timeout: 15000 });
		await expect(tiles.first()).toHaveAttribute('href', /^#photo=[0-9a-f]{10}$/);
		await tiles.first().click();
		await expect(page.locator('.revelar-viewer.revelar-ready')).toBeVisible();
		await expect(page).toHaveURL(/#photo=[0-9a-f]{10}$/);
		await expect(page.locator('.revelar-viewer .pswp__img').first()).toHaveAttribute(
			'src',
			/^blob:/,
			{ timeout: 15000 }
		);
		await page.keyboard.press('Escape');
		await expect(page.locator('.revelar-viewer')).toHaveCount(0);
		// remembered for the session: a reload does not ask again
		await page.reload();
		await expect(page.locator('h1')).toHaveText('Secret garden', { timeout: 15000 });
	});

	test('a #k= key link unlocks without a password', async ({ page, context }) => {
		const { token } = manifest().privateAlbums[0];
		const keys = JSON.parse(
			readFileSync(join(SITE_ROOT, '.cache/private-keys.json'), 'utf8')
		) as Record<string, { dek: string }>;
		const dek = Buffer.from(keys['secret-garden'].dek, 'base64').toString('base64url');
		await context.clearCookies();
		await page.goto(`/p/${token}/#k=${dek}`);
		await expect(page.locator('h1')).toHaveText('Secret garden', { timeout: 15000 });
		await expect(page.locator('[data-tile]')).toHaveCount(3);
	});
});
