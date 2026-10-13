import { expect, test } from '@playwright/test';

test.describe('maps', () => {
	test('album map page lists geotagged photos and mounts the map', async ({ page }) => {
		await page.goto('/lisbon-walks/map/');
		await expect(page.locator('h1')).toHaveText('Map');
		const items = page.locator('.locations li');
		await expect(items).toHaveCount(1);
		await expect(items.first()).toContainText('approximate');
		await expect(items.first().locator('a')).toHaveAttribute(
			'href',
			/\/lisbon-walks\/[0-9a-f]{10}\/$/
		);
		// Either the WebGL map renders or (offline / no WebGL) the fallback message shows.
		await expect(page.locator('.map-wrap')).toBeVisible();
		await expect
			.poll(
				async () =>
					(await page.locator('.maplibregl-canvas').isVisible()) ||
					(await page.locator('.map-fallback').isVisible()),
				{ timeout: 20000 }
			)
			.toBe(true);
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
