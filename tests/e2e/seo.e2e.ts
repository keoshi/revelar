import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test.describe('SEO and feeds', () => {
	test('sitemap lists public pages and photos only', async ({ request }) => {
		const xml = await (await request.get('/sitemap.xml')).text();
		expect(xml).toContain('<loc>https://photos.example.com/</loc>');
		expect(xml).toContain('<loc>https://photos.example.com/lisbon-walks/</loc>');
		expect(xml).toMatch(/<loc>https:\/\/photos\.example\.com\/lisbon-walks\/[0-9a-f]{10}\/<\/loc>/);
		expect(xml).toContain('<loc>https://photos.example.com/lisbon-walks/map/</loc>');
		expect(xml).not.toContain('/rooftops/');
		expect(xml).not.toContain('/p/');
		expect(xml).toContain('<image:image>');
	});

	test('rss has one item per public album', async ({ request }) => {
		const xml = await (await request.get('/rss.xml')).text();
		expect(xml).toContain('<title>Lisbon walks</title>');
		expect(xml).toContain('<title>iceland</title>');
		expect(xml).not.toContain('Rooftops');
		expect(xml).not.toContain('Secret garden');
		expect((xml.match(/<item>/g) ?? []).length).toBe(3);
	});

	test('robots.txt disallows private paths and points to the sitemap', async ({ request }) => {
		const txt = await (await request.get('/robots.txt')).text();
		expect(txt).toContain('Disallow: /p/');
		expect(txt).toContain('Sitemap: https://photos.example.com/sitemap.xml');
	});

	test('album and photo pages carry canonical, Open Graph and JSON-LD', async ({ page }) => {
		await page.goto('/lisbon-walks/');
		await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
			'href',
			'https://photos.example.com/lisbon-walks/'
		);
		await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
			'content',
			/^https:\/\/photos\.example\.com\/media\/lisbon-walks\/.+\.jpg$/
		);
		const gallery = JSON.parse(
			(await page.locator('script[type="application/ld+json"]').textContent()) ?? '{}'
		);
		expect(gallery['@type']).toBe('ImageGallery');
		expect(gallery.numberOfItems).toBe(7);
		const href = (await page.locator('[data-tile]').nth(1).getAttribute('href'))!;
		await page.goto(href);
		await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
			'href',
			`https://photos.example.com${href}`
		);
		const photo = JSON.parse(
			(await page.locator('script[type="application/ld+json"]').textContent()) ?? '{}'
		);
		expect(photo['@type']).toBe('ImageObject');
		expect(photo.name).toBe('Tram 28 at dawn');
		expect(photo.creator.name).toBe('Your Name');
		await expect(page).toHaveTitle(/Tram 28 at dawn · Lisbon walks/);
	});

	test('private pages are noindex and have no Open Graph image', async ({ page }) => {
		const manifest = JSON.parse(
			readFileSync(join(process.cwd(), 'src/lib/generated/manifest.json'), 'utf8')
		);
		await page.goto(`/p/${manifest.privateAlbums[0].token}/`);
		await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
		await expect(page.locator('meta[property="og:image"]')).toHaveCount(0);
	});

	test('ships a _headers file with immutable caching for media', async ({ request }) => {
		const txt = await (await request.get('/_headers')).text();
		expect(txt).toContain('/media/*');
		expect(txt).toContain('max-age=31536000, immutable');
	});
});
