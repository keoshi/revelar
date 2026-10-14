// Window screenshots of the app with the real macOS chrome (title bar, rounded corners, shadow),
// for the README and the marketing page. Drives the app with Playwright and captures each screen
// with macOS's own `screencapture`, so the terminal running this needs Screen Recording
// permission (System Settings → Privacy & Security → Screen & System Audio Recording).
//
//   node app/scripts/screenshots.mjs <site folder> <out folder> [--app <Revelar.app>] [--theme dark|light] [--readme]
//
// Without --app the development build runs (npm run build -w app first). --readme also writes
// 1600 px wide JPEGs on white into docs/screenshots/ for the README. The site is used as is;
// pick one with real photos for the marketing shots. Output: <out>/<screen>.png, 2× on Retina,
// transparent around the window's shadow.
import { _electron as electron } from 'playwright';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, '..');
const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const [site, out] = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!site || !out)
	throw new Error(
		'Usage: screenshots.mjs <site folder> <out folder> [--app Revelar.app] [--theme dark|light] [--readme]'
	);
const theme = option('--theme') ?? 'dark';
const bundle = option('--app');
const exe = bundle ? join(resolve(bundle), 'Contents/MacOS/Revelar') : require('electron');
if (process.platform !== 'darwin') throw new Error('Window capture is macOS-only');
mkdirSync(out, { recursive: true });

// ---- window id by owner pid, through a tiny Swift helper compiled once into app/dist ----
const helper = join(app, 'dist', 'winid');
if (!existsSync(helper)) {
	mkdirSync(dirname(helper), { recursive: true });
	const src = join(app, 'dist', 'winid.swift');
	writeFileSync(
		src,
		`import CoreGraphics
import Foundation
let pid = Int32(CommandLine.arguments[1])!
let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as! [[String: Any]]
for w in list {
    if (w[kCGWindowOwnerPID as String] as? Int32) == pid, (w[kCGWindowLayer as String] as? Int) == 0,
       let n = w[kCGWindowNumber as String] as? Int { print(n); exit(0) }
}
exit(1)
`
	);
	execFileSync('xcrun', ['swiftc', '-O', src, '-o', helper], { stdio: 'inherit' });
}

const electronApp = await electron.launch({
	executablePath: exe,
	args: bundle ? [] : [join(app, 'out/main/index.js')],
	cwd: app,
	env: { ...process.env, REVELAR_USER_DATA: join(out, '.profile'), REVELAR_THEME: theme }
});
const pid = electronApp.process().pid;
mkdirSync(join(out, '.profile'), { recursive: true });
const win = await electronApp.firstWindow();
await win.emulateMedia({ colorScheme: theme });
await win.setViewportSize({ width: 1200, height: 800 });
await win.evaluate(
	(root) => window.revelar.settings.set({ lastRoot: root, recentRoots: [root] }),
	resolve(site)
);
await win.reload();

// The drag step reorders photos and the editor saves itself, so every album.yaml is put back
// afterwards: the site comes out of this exactly as it went in.
const photosDir = join(resolve(site), 'photos');
const sidecars = existsSync(photosDir)
	? readdirSync(photosDir)
			.map((d) => join(photosDir, d, 'album.yaml'))
			.filter((f) => existsSync(f))
			.map((f) => [f, readFileSync(f)])
	: [];
const shots = [];
async function shot(name) {
	// Focused window: coloured traffic lights in every capture, not only the first.
	await electronApp.evaluate(({ app, BrowserWindow }) => {
		app.focus({ steal: true });
		BrowserWindow.getAllWindows()[0]?.focus();
	});
	await win.waitForTimeout(500);
	const id = execFileSync(helper, [String(pid)], { encoding: 'utf8' }).trim();
	const file = join(out, `${name}.png`);
	try {
		execFileSync('screencapture', ['-x', '-l', id, file], { stdio: 'pipe' });
	} catch (e) {
		throw new Error(
			`screencapture failed (${String(e.stderr || e.message).trim()}). The terminal needs Screen Recording permission: System Settings → Privacy & Security → Screen & System Audio Recording.`,
			{ cause: e }
		);
	}
	shots.push(file);
	console.log('captured', name);
}

try {
	await win.waitForSelector('.card', { timeout: 60000 });
	await win.waitForTimeout(800);
	await shot('library');

	await win.locator('.card').first().click();
	await win.waitForSelector('.thumb', { timeout: 30000 });
	await win.waitForTimeout(800);
	await win.locator('.thumb').first().click();
	await shot('album');
	const thumbs = win.locator('.thumb');
	if ((await thumbs.count()) > 2) {
		await thumbs.nth(2).hover();
		await win.mouse.down();
		const box = await thumbs.nth(0).boundingBox();
		await win.mouse.move(box.x + 30, box.y + 30, { steps: 8 });
		await win.mouse.move(box.x + 34, box.y + 34, { steps: 2 });
		await shot('album-drag');
		await win.mouse.up();
	}

	await win.getByRole('button', { name: 'Publish', exact: true }).click();
	await win.waitForSelector('.tile');
	await win.waitForTimeout(400);
	await shot('publish');

	await win.locator('.trigger').click();
	await win.waitForTimeout(300);
	await shot('site-menu');
	await win.getByRole('menuitem', { name: /Site settings/ }).click();
	await win.waitForSelector('#s-author');
	await shot('settings');

	await win.getByRole('button', { name: 'Preview', exact: true }).click();
	await win.waitForSelector('.veil', { timeout: 10000 }).catch(() => {});
	await shot('busy');
	await win.waitForSelector('iframe', { timeout: 300000 });
	await win.waitForTimeout(2500);
	await shot('preview');

	await win.evaluate(() => window.revelar.settings.set({ lastRoot: undefined, recentRoots: [] }));
	await win.reload();
	await win.waitForSelector('.welcome');
	await win.waitForTimeout(1500);
	await shot('welcome');
} finally {
	await electronApp.close();
	for (const [file, content] of sidecars) writeFileSync(file, content);
}

// README copies: flattened on white, 1600 px wide, as JPEG.
if (args.includes('--readme')) {
	const docs = join(app, '..', 'docs', 'screenshots');
	for (const file of shots) {
		const name = `app-${file.split('/').pop().replace('.png', '')}.jpg`;
		await sharp(file)
			.flatten({ background: '#ffffff' })
			.resize({ width: 1600 })
			.jpeg({ quality: 84, mozjpeg: true })
			.toFile(join(docs, name));
		console.log('readme', name);
	}
}
