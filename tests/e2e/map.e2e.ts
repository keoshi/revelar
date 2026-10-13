import { expect, test } from '@playwright/test';

test.describe('maps', () => {
	test('album map page lists geotagged photos and mounts the map', async ({ page }) => {
		// MapLibre parses tiles in a worker it fetches by URL; a wrong URL only shows up as a
		// console error (the map silently falls back), so collect those.
		const workerErrors: string[] = [];
		page.on('console', (m) => {
			if (m.type() === 'error' && /worker/i.test(m.text())) workerErrors.push(m.text());
		});
		await page.goto('/lisbon-walks/map/');
		await expect(page.locator('h1')).toHaveText('Map');
		const items = page.locator('.locations li');
		await expect(items).toHaveCount(1);
		await expect(items.first()).toContainText('approximate');
		await expect(items.first().locator('a')).toHaveAttribute(
			'href',
			/\/lisbon-walks\/[0-9a-f]{10}\/$/
		);
		// Either the WebGL map finishes loading (style, sources and tiles, which needs MapLibre's
		// worker to start) or (offline / no WebGL) the fallback message shows.
		await expect(page.locator('.map-wrap')).toBeVisible();
		await expect
			.poll(
				async () =>
					(await page.locator('.map-fallback').isVisible()) ||
					(await page.locator('.map').evaluate((el) => {
						const map = (el as HTMLElement & { revelarMap?: { loaded(): boolean } }).revelarMap;
						return Boolean(map?.loaded());
					})),
				{ timeout: 30000 }
			)
			.toBe(true);
		expect(workerErrors).toEqual([]);
	});

	test('album header links to the map only when photos have locations', async ({ page }) => {
		await page.goto('/lisbon-walks/');
		await expect(page.locator('.album-header a', { hasText: 'Map' })).toHaveAttribute(
			'href',
			/\/lisbon-walks\/map\/$/
		);
		await page.goto('/iceland/');
		await expect(page.locator('.album-header a', { hasText: 'Map' })).toHaveCount(0);
	});
});
