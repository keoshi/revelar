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
	Menu,
	nativeTheme,
	net,
	protocol,
	safeStorage,
	session,
	shell,
	utilityProcess
} from 'electron';
import { createRequire } from 'node:module';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { updateElectronApp, UpdateSourceType } from 'update-electron-app';
import type { AppCommand, EngineEvent, Settings } from '../shared/api.ts';

const require = createRequire(import.meta.url);
const HOST = join(
	dirname(require.resolve('@index84/revelar/package.json')),
	'bin',
	'revelar-host.js'
);

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
	// Builds run from a writable mirror of the engine package under the app's data folder (see
	// bin/workspace.js in the package): an installed app's bundle is read-only.
	const env = { ...process.env, REVELAR_WORK_DIR: join(app.getPath('userData'), 'engine') };
	const child = utilityProcess.fork(HOST, [], {
		serviceName: 'revelar-engine',
		stdio: 'pipe',
		env
	});
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

/** The settings the renderer may write; anything else in a patch is dropped. */
const SETTINGS_KEYS: (keyof Settings)[] = ['lastRoot', 'recentRoots', 'publish'];
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
/** Secret names are short identifiers ("netlify-token"), never paths. */
function secretPath(name: string): string {
	if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(name)) throw new Error(`Bad secret name "${name}"`);
	return join(app.getPath('userData'), `secret-${name}.bin`);
}
/** Only web links leave the app; file:, custom schemes and the like are refused. */
function openExternal(url: string): Promise<void> {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return Promise.reject(new Error(`Not a web address: ${url}`));
	}
	if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')
		return Promise.reject(new Error(`Not a web address: ${url}`));
	return shell.openExternal(parsed.href);
}

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
		webPreferences: {
			preload: join(import.meta.dirname, '../preload/index.cjs'),
			// The renderer is sandboxed: the preload is CommonJS and uses nothing but the bridge.
			sandbox: true,
			contextIsolation: true,
			nodeIntegration: false
		}
	});
	win.on('closed', () => (win = undefined));
	// The window shows the app and nothing else: no navigation away from it, and links that
	// want a new window open in the browser instead (web links only).
	win.webContents.on('will-navigate', (e, url) => {
		if (url !== win?.webContents.getURL()) e.preventDefault();
	});
	win.webContents.setWindowOpenHandler(({ url }) => {
		void openExternal(url).catch(() => {});
		return { action: 'deny' };
	});
	nativeTheme.on('updated', () => win?.setBackgroundColor(windowBackground()));
	if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL);
	else void win.loadFile(join(import.meta.dirname, '../renderer/index.html'));
}

/**
 * The application menu carries the keyboard shortcuts; the renderer does the work. The Edit
 * roles matter: without them a custom menu would lose copy and paste in the form fields.
 */
function buildMenu(): void {
	const send = (command: AppCommand) => () => win?.webContents.send('app:command', command);
	const mac = process.platform === 'darwin';
	const template: Electron.MenuItemConstructorOptions[] = [
		...(mac ? [{ role: 'appMenu' as const }] : []),
		{
			label: 'File',
			submenu: [
				{ label: 'New Site…', accelerator: 'CmdOrCtrl+N', click: send('new') },
				{ label: 'Open Site Folder…', accelerator: 'CmdOrCtrl+O', click: send('open') },
				{ type: 'separator' },
				{ label: 'Save', accelerator: 'CmdOrCtrl+S', click: send('save') },
				{ type: 'separator' },
				{ label: 'Site Settings…', accelerator: 'CmdOrCtrl+,', click: send('settings') },
				{ type: 'separator' },
				{ role: mac ? 'close' : 'quit' }
			]
		},
		{ role: 'editMenu' },
		{
			label: 'View',
			submenu: [
				{ label: 'Library', accelerator: 'CmdOrCtrl+1', click: send('library') },
				{ label: 'Preview', accelerator: 'CmdOrCtrl+2', click: send('preview') },
				{ label: 'Publish', accelerator: 'CmdOrCtrl+3', click: send('publish') },
				{ type: 'separator' },
				...(app.isPackaged
					? []
					: [{ role: 'reload' as const }, { role: 'toggleDevTools' as const }]),
				{ role: 'togglefullscreen' }
			]
		},
		{ role: 'windowMenu' }
	];
	Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
	if (process.platform === 'darwin' && existsSync(ICON)) app.dock?.setIcon(ICON);
	buildMenu();
	// Nothing in the app needs camera, microphone, notifications or the rest.
	session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) =>
		callback(false)
	);
	// Updates come from the GitHub releases of keoshi/revelar through update.electronjs.org,
	// which only works for the signed, packaged app.
	if (app.isPackaged)
		updateElectronApp({
			updateSource: { type: UpdateSourceType.ElectronPublicUpdateService, repo: 'keoshi/revelar' },
			updateInterval: '1 hour'
		});
	// Files of the open site: site://media/… and site://downloads/… map to static/, site://cache/…
	// to .cache/ (quick previews) and site://photos/… to the originals.
	// Only the folders the renderer needs; `.cache` holds private album keys, so just its thumbs.
	const BASES: Record<string, string> = {
		media: 'static/media',
		'media-private': 'static/media-private',
		downloads: 'static/downloads',
		cache: '.cache/thumbs',
		photos: 'photos'
	};
	protocol.handle('site', (request) => {
		if (!siteRoot) return new Response('No site open', { status: 404 });
		const url = new URL(request.url);
		const base = BASES[url.host];
		if (!base) return new Response('Not found', { status: 404 });
		const dir = resolve(siteRoot, base);
		const file = resolve(dir, '.' + decodeURIComponent(url.pathname));
		// Stays inside `dir` itself: "media" must not reach "media-private" through a prefix match.
		if (!file.startsWith(dir + sep)) return new Response('Not found', { status: 404 });
		let regular = false;
		try {
			regular = statSync(file).isFile();
		} catch {
			/* missing */
		}
		if (!regular) return new Response('Not found', { status: 404 });
		return net.fetch(pathToFileURL(file).href);
	});

	ipcMain.handle('engine', (_e, method: string, params?: Record<string, unknown>) =>
		call(method, params)
	);
	ipcMain.handle('site.setRoot', (_e, root: string) => {
		// Only a real site folder: the renderer gets this path from the engine after opening it.
		if (typeof root !== 'string' || !existsSync(join(root, 'revelar.config.ts')))
			throw new Error('Not a site folder');
		siteRoot = resolve(root);
	});
	ipcMain.handle('dialog.pickFolder', async (_e, title: string) => {
		const result = await dialog.showOpenDialog(win!, {
			title,
			properties: ['openDirectory', 'createDirectory']
		});
		return result.canceled ? undefined : result.filePaths[0];
	});
	// The built site for a server of the owner's own: shown in Finder or saved as a zip. Paths come
	// from here, never from the renderer.
	ipcMain.handle('site.showBuild', async () => {
		const dir = siteRoot && join(siteRoot, 'build');
		if (!dir || !existsSync(dir)) throw new Error('Build the site first');
		const error = await shell.openPath(dir);
		if (error) throw new Error(error);
	});
	ipcMain.handle('site.saveZip', async () => {
		if (!siteRoot) throw new Error('No site open');
		const result = await dialog.showSaveDialog(win!, {
			title: 'Save the site as a zip',
			defaultPath: join(app.getPath('downloads'), `${basename(siteRoot)}.zip`),
			filters: [{ name: 'Zip archive', extensions: ['zip'] }]
		});
		if (result.canceled || !result.filePath) return undefined;
		await call('export.zip', { root: siteRoot, out: result.filePath });
		return result.filePath;
	});
	ipcMain.handle('settings.get', () => readSettings());
	ipcMain.handle('settings.set', (_e, patch: Partial<Settings>) => {
		const next = readSettings();
		for (const key of SETTINGS_KEYS) if (key in patch) next[key] = patch[key] as never;
		return writeSettings(next);
	});
	ipcMain.handle('secrets.get', (_e, name: string) => {
		const path = secretPath(name);
		if (!existsSync(path)) return undefined;
		const bytes = readFileSync(path);
		return safeStorage.isEncryptionAvailable()
			? safeStorage.decryptString(bytes)
			: bytes.toString('utf8');
	});
	ipcMain.handle('secrets.set', (_e, name: string, value: string) => {
		if (typeof value !== 'string') throw new Error('A secret must be a string');
		mkdirSync(app.getPath('userData'), { recursive: true });
		const bytes = safeStorage.isEncryptionAvailable()
			? safeStorage.encryptString(value)
			: Buffer.from(value);
		writeFileSync(secretPath(name), bytes);
	});
	ipcMain.handle('shell.openExternal', (_e, url: string) => openExternal(url));

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
