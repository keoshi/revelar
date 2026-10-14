// Draws the app icon from the mark: an ink tile with the mark in the accent, on the 1024 px
// canvas macOS expects (the tile covers 824 px, with transparent margins). The mark is placed
// by its centre of mass rather than its bounding box, so the heavy left side and the thin leg
// balance in the tile. Run after changing src/renderer/src/art/mark.svg:  node app/scripts/icon.mjs
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const markSvg = readFileSync(join(app, 'src/renderer/src/art/mark.svg'), 'utf8');
const inner = markSvg
	.replace(/<!--[\s\S]*?-->/, '')
	.replace(/<svg[^>]*>/, '')
	.replace('</svg>', '');

const size = 1024;
const tile = 824;
const off = (size - tile) / 2;
const markW = 466;
const scale = (tile * 0.56) / markW;
// Centre of mass of the mark's alpha, in mark units.
const probe = await sharp(Buffer.from(markSvg))
	.resize({ width: markW })
	.ensureAlpha()
	.raw()
	.toBuffer({ resolveWithObject: true });
let sx = 0,
	sy = 0,
	n = 0;
for (let py = 0; py < probe.info.height; py++)
	for (let px = 0; px < probe.info.width; px++) {
		const a = probe.data[(py * probe.info.width + px) * 4 + 3];
		if (a > 127) {
			sx += px;
			sy += py;
			n++;
		}
	}
const cx = sx / n;
const cy = sy / n;
const x = size / 2 - cx * scale;
const y = size / 2 - cy * scale;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect x="${off}" y="${off}" width="${tile}" height="${tile}" rx="185" fill="#11111a"/>
  <g fill="#ff5900" transform="translate(${x} ${y}) scale(${scale})">${inner}</g>
</svg>`;
writeFileSync(join(app, 'build/icon.svg'), svg);
await sharp(Buffer.from(svg)).png().toFile(join(app, 'build/icon.png'));

// The .icns for the bundle: an iconset of the standard sizes, assembled by iconutil (macOS).
if (process.platform === 'darwin') {
	const { execFileSync } = await import('node:child_process');
	const { mkdirSync, rmSync } = await import('node:fs');
	const iconset = join(app, 'build/icon.iconset');
	rmSync(iconset, { recursive: true, force: true });
	mkdirSync(iconset);
	for (const px of [16, 32, 128, 256, 512]) {
		await sharp(Buffer.from(svg))
			.resize(px)
			.png()
			.toFile(join(iconset, `icon_${px}x${px}.png`));
		await sharp(Buffer.from(svg))
			.resize(px * 2)
			.png()
			.toFile(join(iconset, `icon_${px}x${px}@2x.png`));
	}
	execFileSync('iconutil', ['-c', 'icns', iconset, '-o', join(app, 'build/icon.icns')]);
	rmSync(iconset, { recursive: true });
	console.log('wrote app/build/icon.svg, icon.png and icon.icns');
} else console.log('wrote app/build/icon.svg and icon.png');
