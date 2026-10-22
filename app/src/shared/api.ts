/** Types shared by the main process, the preload bridge and the renderer. */

export type EngineEvent = { event: string; data: unknown };

export type PublishTarget = 'netlify' | 'vercel' | 'cloudflare' | 'github';
/** Where the Publish screen sends the site: a host, or 'own' for a server of the owner's own. */
export type PublishChoice = PublishTarget | 'own';
export type PublishedSite = { name?: string; siteId?: string; url?: string; account?: string };

export type Settings = {
	lastRoot?: string;
	/** most recent first */
	recentRoots?: string[];
	publish?: { target?: PublishChoice; sites?: Partial<Record<PublishChoice, PublishedSite>> };
	/** from before there was more than one host; read as publish.sites.netlify */
	netlify?: { siteId?: string; siteName?: string; url?: string };
};

/** Commands the application menu sends to the renderer (their shortcuts live in the menu). */
export type AppCommand = 'new' | 'open' | 'settings' | 'save' | 'library' | 'preview' | 'publish';

export type RevelarBridge = {
	/** 'darwin', 'win32' or 'linux': the top bar leaves room for macOS traffic lights. */
	platform: string;
	/** Call an engine method (see src/engine/host.ts in the revelar package). */
	call<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
	/** Subscribe to engine events; returns an unsubscribe function. */
	on(fn: (e: EngineEvent) => void): () => void;
	pickFolder(title: string): Promise<string | undefined>;
	/** Tell the main process which site folder `site://` URLs map to. */
	setRoot(root: string): Promise<void>;
	/** Open the open site's build/ folder in Finder (or Explorer). */
	showBuild(): Promise<void>;
	/** Ask where to save a zip of the build and write it; undefined when cancelled. */
	saveZip(): Promise<string | undefined>;
	settings: {
		get(): Promise<Settings>;
		set(patch: Partial<Settings>): Promise<Settings>;
	};
	secrets: {
		get(name: string): Promise<string | undefined>;
		set(name: string, value: string): Promise<void>;
	};
	openExternal(url: string): Promise<void>;
	/** Subscribe to application-menu commands (⌘N, ⌘O, ⌘S…); returns an unsubscribe function. */
	onCommand(fn: (command: AppCommand) => void): () => void;
};
