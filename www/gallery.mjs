// Captures the live example site for the hero (album grid, viewer, viewer with the info panel,
// each in dark and light) and the Open Graph image, into www/img/. Run from the repository:
//   node www/gallery.mjs [site url]
import { chromium } from 'playwright';
import sharp from 'sharp';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), 'img');
const url = process.argv[2] ?? 'https://revelar-app-vercel-test-alpha-1.vercel.app/synthest/';
const save = async (png, name) => {
	await sharp(png)
		.resize({ width: 1800 })
		.webp({ quality: 82 })
		.toFile(join(out, `${name}.webp`));
	await sharp(png)
		.resize({ width: 1800 })
		.avif({ quality: 58 })
		.toFile(join(out, `${name}.avif`));
};
const b = await chromium.launch();
for (const scheme of ['dark', 'light']) {
	const ctx = await b.newContext({
		viewport: { width: 1440, height: 900 },
		deviceScaleFactor: 2,
		colorScheme: scheme
	});
	const p = await ctx.newPage();
	await p.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
	await p.waitForTimeout(2500);
	const grid = await p.screenshot({ type: 'png' });
	await save(grid, `gallery-${scheme}`);
	if (scheme === 'dark')
		await sharp(grid)
			.resize({ width: 1200 })
			.extract({ left: 0, top: 0, width: 1200, height: 630 })
			.jpeg({ quality: 84, mozjpeg: true })
			.toFile(join(out, 'og.jpg'));
	await p.locator('.grid a, .grid button').nth(4).click();
	await p.waitForTimeout(2500);
	await save(await p.screenshot({ type: 'png' }), `viewer-${scheme}`);
	await p.locator('button[aria-label="Photo information"]').click();
	await p.waitForTimeout(1800);
	await save(await p.screenshot({ type: 'png' }), `info-${scheme}`);
	console.log(scheme, 'ok');
	await ctx.close();
}
await b.close();
