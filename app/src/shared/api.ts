/** Types shared by the main process, the preload bridge and the renderer. */

export type EngineEvent = { event: string; data: unknown };

export type Settings = {
	lastRoot?: string;
	/** most recent first */
	recentRoots?: string[];
	netlify?: { siteId?: string; siteName?: string; url?: string };
};

export type RevelarBridge = {
	/** Call an engine method (see src/engine/host.ts in the revelar package). */
	call<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
	/** Subscribe to engine events; returns an unsubscribe function. */
	on(fn: (e: EngineEvent) => void): () => void;
	pickFolder(title: string): Promise<string | undefined>;
	/** Tell the main process which site folder `site://` URLs map to. */
	setRoot(root: string): Promise<void>;
	settings: {
		get(): Promise<Settings>;
		set(patch: Partial<Settings>): Promise<Settings>;
	};
	secrets: {
		get(name: string): Promise<string | undefined>;
		set(name: string, value: string): Promise<void>;
	};
	openExternal(url: string): Promise<void>;
};
