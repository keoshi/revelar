/**
 * Main process: one window, the revelar engine running as a utility process (so sharp, Vite and
 * the rest stay out of this process), a `site://` scheme that serves files from the open site
 * folder (thumbnails in the library and editor), and small settings/secret stores.
 */
import {
	app,
	BrowserWindow,
	dialog,
	ipcMain,
	nativeTheme,
	net,
	protocol,
	safeStorage,
	shell,
	utilityProcess
} from 'electron';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import type { EngineEvent, Settings } from '../shared/api.ts';

const require = createRequire(import.meta.url);
const HOST = join(dirname(require.resolve('revelar/package.json')), 'bin', 'revelar-host.js');

// Tests point the app at a throwaway profile (settings, secrets) instead of the user's, and can
// pin the appearance so screenshots come out the same on any machine.
if (process.env.REVELAR_USER_DATA) app.setPath('userData', process.env.REVELAR_USER_DATA);
const theme = process.env.REVELAR_THEME;
if (theme === 'light' || theme === 'dark') nativeTheme.themeSource = theme;

/** The app icon, also used as the dock icon when running from source. */
const ICON = join(import.meta.dirname, '../../build/icon.png');
/** Window background in the app's own palette, so resizes and loads never flash the wrong tone. */
const windowBackground = () => (nativeTheme.shouldUseDarkColors ? '#0d0d10' : '#ffffff');

protocol.registerSchemesAsPrivileged([
	{
		scheme: 'site',
		privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
	}
]);

let win: BrowserWindow | undefined;
let siteRoot: string | undefined;

// ---- engine ---------------------------------------------------------------------------------

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };
let engine: Electron.UtilityProcess | undefined;
let nextId = 1;
const pending = new Map<number, Pending>();

function startEngine(): Electron.UtilityProcess {
	const child = utilityProcess.fork(HOST, [], { serviceName: 'revelar-engine', stdio: 'pipe' });
	child.stdout?.on('data', (d) => process.stdout.write(`[engine] ${d}`));
	child.stderr?.on('data', (d) => process.stderr.write(`[engine] ${d}`));
	child.on(
		'message',
		(msg: { id?: number; result?: unknown; error?: string; event?: string; data?: unknown }) => {
			if (msg.id !== undefined) {
				const p = pending.get(msg.id);
				if (!p) return;
				pending.delete(msg.id);
				if (msg.error !== undefined) p.reject(new Error(msg.error));
				else p.resolve(msg.result);
			} else if (msg.event) {
				win?.webContents.send('engine:event', {
					event: msg.event,
					data: msg.data
				} satisfies EngineEvent);
			}
		}
	);
	child.on('exit', (code) => {
		for (const p of pending.values()) p.reject(new Error(`The engine stopped (exit code ${code})`));
		pending.clear();
		engine = undefined;
	});
	return child;
}

function call(method: string, params?: Record<string, unknown>): Promise<unknown> {
	engine ??= startEngine();
	const id = nextId++;
	return new Promise((resolve, reject) => {
		pending.set(id, { resolve, reject });
		engine!.postMessage({ id, method, params });
	});
}

// ---- settings and secrets -------------------------------------------------------------------

const settingsPath = () => join(app.getPath('userData'), 'settings.json');
function readSettings(): Settings {
	try {
		return JSON.parse(readFileSync(settingsPath(), 'utf8')) as Settings;
	} catch {
		return {};
	}
}
function writeSettings(s: Settings): Settings {
	mkdirSync(dirname(settingsPath()), { recursive: true });
	writeFileSync(settingsPath(), JSON.stringify(s, null, 2));
	return s;
}
const secretPath = (name: string) => join(app.getPath('userData'), `secret-${name}.bin`);

// ---- window ----------------------------------------------------------------------------------

function createWindow(): void {
	win = new BrowserWindow({
		width: 1200,
		height: 800,
		// Screens are laid out to fit without scrolling at the default size and adapt down to this.
		minWidth: 960,
		minHeight: 620,
		title: 'Revelar',
		icon: ICON,
		backgroundColor: windowBackground(),
		titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
		// Centre the traffic lights on the app's 50 px top bar.
		trafficLightPosition: { x: 18, y: 19 },
		webPreferences: { preload: join(import.meta.dirname, '../preload/index.mjs'), sandbox: false }
	});
	win.on('closed', () => (win = undefined));
	nativeTheme.on('updated', () => win?.setBackgroundColor(windowBackground()));
	if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL);
	else void win.loadFile(join(import.meta.dirname, '../renderer/index.html'));
}

app.whenReady().then(() => {
	if (process.platform === 'darwin' && existsSync(ICON)) app.dock?.setIcon(ICON);
	// Files of the open site: site://media/… and site://downloads/… map to static/, site://cache/…
	// to .cache/ (quick previews) and site://photos/… to the originals.
	const BASES: Record<string, string> = {
		media: 'static/media',
		'media-private': 'static/media-private',
		downloads: 'static/downloads',
		cache: '.cache',
		photos: 'photos'
	};
	protocol.handle('site', (request) => {
		if (!siteRoot) return new Response('No site open', { status: 404 });
		const url = new URL(request.url);
		const base = BASES[url.host];
		if (!base) return new Response('Not found', { status: 404 });
		const dir = join(siteRoot, base);
		const file = join(dir, decodeURIComponent(url.pathname));
		if (!file.startsWith(dir) || !existsSync(file))
			return new Response('Not found', { status: 404 });
		return net.fetch(pathToFileURL(file).href);
	});

	ipcMain.handle('engine', (_e, method: string, params?: Record<string, unknown>) =>
		call(method, params)
	);
	ipcMain.handle('site.setRoot', (_e, root: string) => {
		siteRoot = root;
	});
	ipcMain.handle('dialog.pickFolder', async (_e, title: string) => {
		const result = await dialog.showOpenDialog(win!, {
			title,
			properties: ['openDirectory', 'createDirectory']
		});
		return result.canceled ? undefined : result.filePaths[0];
	});
	ipcMain.handle('settings.get', () => readSettings());
	ipcMain.handle('settings.set', (_e, patch: Partial<Settings>) =>
		writeSettings({ ...readSettings(), ...patch })
	);
	ipcMain.handle('secrets.get', (_e, name: string) => {
		const path = secretPath(name);
		if (!existsSync(path)) return undefined;
		const bytes = readFileSync(path);
		return safeStorage.isEncryptionAvailable()
			? safeStorage.decryptString(bytes)
			: bytes.toString('utf8');
	});
	ipcMain.handle('secrets.set', (_e, name: string, value: string) => {
		mkdirSync(app.getPath('userData'), { recursive: true });
		const bytes = safeStorage.isEncryptionAvailable()
			? safeStorage.encryptString(value)
			: Buffer.from(value);
		writeFileSync(secretPath(name), bytes);
	});
	ipcMain.handle('shell.openExternal', (_e, url: string) => shell.openExternal(url));

	createWindow();
	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});

app.on('window-all-closed', () => {
	engine?.kill();
	if (process.platform !== 'darwin') app.quit();
});
app.on('before-quit', () => engine?.kill());
