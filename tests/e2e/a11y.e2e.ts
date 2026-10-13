import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

async function audit(page: import('@playwright/test').Page, label: string) {
	const results = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
		.analyze();
	expect(
		results.violations.map(
			(v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join('; ')})`
		),
		label
	).toEqual([]);
}

test.describe('accessibility (axe-core)', () => {
	test('home', async ({ page }) => {
		await page.goto('/');
		await audit(page, 'home');
	});

	test('album grid', async ({ page }) => {
		await page.goto('/lisbon-walks/');
		await audit(page, 'album');
	});

	test('viewer open with info panel', async ({ page }) => {
		await page.goto('/lisbon-walks/');
		await page.locator('[data-tile]').nth(1).click();
		await expect(page.locator('.revelar-viewer.revelar-ready')).toBeVisible();
		await audit(page, 'viewer');
		await page.keyboard.press('i');
		await expect(page.locator('.info.open')).toBeVisible();
		await audit(page, 'viewer + info');
	});

	test('map page', async ({ page }) => {
		await page.goto('/lisbon-walks/map/');
		await audit(page, 'map');
	});

	test('password gate', async ({ page }) => {
		const manifest = JSON.parse(
			readFileSync(join(process.cwd(), 'src/lib/generated/manifest.json'), 'utf8')
		);
		await page.goto(`/p/${manifest.privateAlbums[0].token}/`);
		await expect(page.getByRole('dialog')).toBeVisible();
		await audit(page, 'gate');
	});

	test('light theme keeps contrast', async ({ page }) => {
		await page.emulateMedia({ colorScheme: 'light' });
		await page.goto('/lisbon-walks/');
		await audit(page, 'album light');
	});
});
