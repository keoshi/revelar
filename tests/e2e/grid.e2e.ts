import { expect, test, type Page } from '@playwright/test';

/** Measure cumulative layout shift from navigation until the grid has settled. */
async function measureCls(page: Page, url: string): Promise<number> {
	await page.addInitScript(() => {
		(window as unknown as { __cls: number }).__cls = 0;
		new PerformanceObserver((list) => {
			for (const entry of list.getEntries() as (PerformanceEntry & {
				hadRecentInput: boolean;
				value: number;
			})[]) {
				if (!entry.hadRecentInput) (window as unknown as { __cls: number }).__cls += entry.value;
			}
		}).observe({ type: 'layout-shift', buffered: true });
	});
	await page.goto(url, { waitUntil: 'networkidle' });
	await page.waitForTimeout(500);
	return page.evaluate(() => (window as unknown as { __cls: number }).__cls);
}

test.describe('home', () => {
	test('lists albums newest first with covers', async ({ page }) => {
		await page.goto('/');
		const covers = page.locator('.covers li');
		await expect(covers).toHaveCount(2);
		await expect(covers.first()).toContainText('Lisbon walks');
		await expect(covers.first().locator('img')).toHaveAttribute('alt', /.+/);
	});
});

test.describe('album grid', () => {
	test('has zero layout shift on load', async ({ page }) => {
		const cls = await measureCls(page, '/lisbon-walks/');
		expect(cls).toBeLessThanOrEqual(0.01);
	});

	test('renders a justified layout and relayouts from 320 to 2560 px', async ({ page }) => {
		await page.goto('/lisbon-walks/');
		const grid = page.locator('.grid');
		await expect(grid).toHaveAttribute('data-layout', 'abs');
		for (const width of [320, 640, 1024, 1600, 2560]) {
			await page.setViewportSize({ width, height: 900 });
			await page.waitForTimeout(150);
			const boxes = await grid.locator('[data-tile]').evaluateAll((els) =>
				els.map((el) => {
					const r = (el as HTMLElement).getBoundingClientRect();
					return { left: r.left, right: r.right, width: r.width, height: r.height };
				})
			);
			const gridBox = await grid.boundingBox();
			for (const b of boxes) {
				expect(b.width, `width ${width}`).toBeGreaterThan(20);
				expect(b.right, `width ${width}`).toBeLessThanOrEqual(gridBox!.x + gridBox!.width + 1);
				expect(b.left, `width ${width}`).toBeGreaterThanOrEqual(gridBox!.x - 1);
			}
			// rows share a height
			const rows = new Map<number, number[]>();
			const tops = await grid
				.locator('[data-tile]')
				.evaluateAll((els) => els.map((el) => Math.round((el as HTMLElement).offsetTop)));
			tops.forEach((t, i) => rows.set(t, [...(rows.get(t) ?? []), Math.round(boxes[i].height)]));
			for (const heights of rows.values()) expect(new Set(heights).size).toBe(1);
			await expect(page).toHaveScreenshot(`grid-${width}.png`, {
				fullPage: false,
				animations: 'disabled'
			});
		}
	});

	test('tiles link to photo pages and have alt text', async ({ page }) => {
		await page.goto('/lisbon-walks/');
		const first = page.locator('[data-tile]').first();
		await expect(first).toHaveAttribute('href', /\/lisbon-walks\/[0-9a-f]{10}\/$/);
		await expect(first.locator('img')).toHaveAttribute('alt', /.+/);
		await expect(first.locator('img')).toHaveAttribute('width', /\d+/);
	});

	test('arrow keys move focus between tiles', async ({ page }) => {
		await page.goto('/lisbon-walks/');
		await page.locator('[data-tile]').first().focus();
		await page.keyboard.press('ArrowRight');
		await expect(page.locator('[data-tile]').nth(1)).toBeFocused();
		await page.keyboard.press('ArrowLeft');
		await expect(page.locator('[data-tile]').nth(0)).toBeFocused();
		await page.keyboard.press('End');
		await expect(page.locator('[data-tile]').last()).toBeFocused();
	});
});
