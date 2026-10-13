import { expect, test, type Page } from '@playwright/test';

const READY = '.revelar-viewer.revelar-ready';
async function openFirst(page: Page, nth = 0) {
	await page.locator('[data-tile]').nth(nth).click();
	await expect(page.locator(READY)).toBeVisible();
}

test.describe('fullscreen viewer', () => {
	test('opens from a tile, updates the URL, and Back returns to the grid with focus restored', async ({
		page
	}) => {
		await page.goto('/lisbon-walks/');
		const second = page.locator('[data-tile]').nth(1);
		const href = await second.getAttribute('href');
		await second.click();
		const viewer = page.locator('.revelar-viewer');
		await expect(page.locator(READY)).toBeVisible();
		await expect(page).toHaveURL(href!);
		await expect(page.locator('.counter')).toHaveText(/2 \/ 7/);
		await page.goBack();
		await expect(viewer).toHaveCount(0);
		await expect(page).toHaveURL(/\/lisbon-walks\/$/);
		await expect(second).toBeFocused();
	});

	test('keyboard: arrows navigate, Esc closes, Space toggles autoplay', async ({ page }) => {
		await page.goto('/lisbon-walks/');
		await openFirst(page);
		await expect(page.locator('.counter')).toHaveText(/1 \/ 7/);
		await page.keyboard.press('ArrowRight');
		await expect(page.locator('.counter')).toHaveText(/2 \/ 7/);
		await expect(page).toHaveURL(/\/lisbon-walks\/[0-9a-f]{10}\/$/);
		// The crossfade overlay is removed once the real slide has loaded underneath it.
		await expect(page.locator('.revelar-crossfade')).toHaveCount(0);
		// Rapid presses chain from the photo heading into view, not the one still on screen.
		await page.keyboard.press('ArrowRight');
		await page.keyboard.press('ArrowRight');
		await expect(page.locator('.counter')).toHaveText(/4 \/ 7/);
		await expect(page.locator('.revelar-crossfade')).toHaveCount(0);
		await page.keyboard.press('ArrowLeft');
		await page.keyboard.press('ArrowLeft');
		await page.keyboard.press('ArrowLeft');
		await expect(page.locator('.counter')).toHaveText(/1 \/ 7/);
		await page.keyboard.press('Space');
		await expect(page.locator('button[aria-label="Pause slideshow"]')).toBeVisible();
		await page.keyboard.press('Space');
		await expect(page.locator('button[aria-label="Play slideshow"]')).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(page.locator('.revelar-viewer')).toHaveCount(0);
	});

	test('a deep link opens the viewer on the right photo and renders a plain image for crawlers', async ({
		page,
		request
	}) => {
		await page.goto('/lisbon-walks/');
		const third = page.locator('[data-tile]').nth(2);
		const href = (await third.getAttribute('href'))!;
		const html = await (await request.get(href)).text();
		expect(html).toContain('<figure class="deep-link');
		expect(html).toMatch(/<img[^>]+alt="[^"]+"/);
		await page.goto(href);
		await expect(page.locator(READY)).toBeVisible();
		await expect(page.locator('.counter')).toHaveText(/3 \/ 7/);
		// closing a deep-linked viewer stays on the album page
		await page.keyboard.press('Escape');
		await expect(page.locator('.revelar-viewer')).toHaveCount(0);
		await expect(page).toHaveURL(/\/lisbon-walks\/$/);
	});

	test('filmstrip selects photos and T toggles it', async ({ page }) => {
		await page.goto('/lisbon-walks/');
		await openFirst(page);
		const strip = page.locator('.filmstrip');
		await expect(strip).toBeVisible();
		await strip.locator('.thumb').nth(4).click();
		await expect(page.locator('.counter')).toHaveText(/5 \/ 7/);
		await page.keyboard.press('t');
		await expect(strip).toHaveCount(0);
		await page.keyboard.press('t');
		await expect(strip).toBeVisible();
	});

	test('reduced motion disables the zoom and fade transitions', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await page.goto('/lisbon-walks/');
		await page.locator('[data-tile]').first().click();
		await expect(page.locator('.revelar-viewer')).toBeVisible();
		const transition = await page
			.locator('.revelar-viewer .pswp__img')
			.first()
			.evaluate((el) => getComputedStyle(el).transitionDuration);
		expect(['0s', '0.00001s', '0.01ms', '1e-05s']).toContain(transition);
		const picture = page.locator('[data-tile] img').first();
		const fade = await picture.evaluate((el) => getComputedStyle(el).transitionDuration);
		expect(fade).not.toBe('0.24s');
	});

	test('autoplay advances the slide', async ({ page }) => {
		await page.goto('/lisbon-walks/');
		await page.getByRole('button', { name: 'Play' }).click();
		await expect(page.locator(READY)).toBeVisible();
		await expect(page.locator('button[aria-label="Pause slideshow"]')).toBeVisible();
		await expect(page.locator('.counter')).toHaveText(/1 \/ 7/);
		await expect(page.locator('.counter')).toHaveText(/2 \/ 7/, { timeout: 8000 });
	});
});

test.describe('downloads and info panel', () => {
	test('shows per-photo and album download links with sizes', async ({ page }) => {
		await page.goto('/lisbon-walks/');
		const albumDownload = page.locator('.album-header a[download]');
		await expect(albumDownload).toHaveAttribute(
			'href',
			/\/downloads\/lisbon-walks-[0-9a-f]{8}\.zip$/
		);
		await expect(albumDownload).toContainText(/Download album · \d+(\.\d+)? (KB|MB)/);
		await openFirst(page, 1);
		const link = page.locator('.chrome a[download]').first();
		await expect(link).toHaveAttribute('href', /\/media\/lisbon-walks\/.+\.jpg$/);
		await expect(link).toHaveAttribute('download', /^lisbon-walks-.+\.jpg$/);
	});

	test('info panel shows formatted EXIF and toggles with I', async ({ page }) => {
		await page.goto('/lisbon-walks/');
		await openFirst(page, 1);
		await page.keyboard.press('i');
		const panel = page.locator('.info.open');
		await expect(panel).toBeVisible();
		await expect(panel).toContainText('Sony α7 IV');
		await expect(panel).toContainText('35 mm · ƒ/2.8 · 1/250 s · ISO 400 · −0.3 EV');
		await expect(panel).toContainText('FE 35mm F1.8');
		await expect(panel.locator('.chip')).toHaveCount(2);
		await page.keyboard.press('i');
		await expect(page.locator('.info.open')).toHaveCount(0);
	});

	test('filmstrip starts collapsed on small screens and the counter reveals it', async ({
		browser
	}) => {
		const context = await browser.newContext({
			viewport: { width: 390, height: 844 },
			isMobile: true,
			hasTouch: true
		});
		const page = await context.newPage();
		await page.goto('/lisbon-walks/');
		await page.locator('[data-tile]').first().tap();
		await expect(page.locator(READY)).toBeVisible();
		await expect(page.locator('.filmstrip')).toHaveCount(0);
		await page.locator('.counter').tap();
		await expect(page.locator('.filmstrip')).toBeVisible();
		await context.close();
	});
});
