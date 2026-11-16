/** Typed client over the preload bridge, plus the app's shared state. */
import type {
	AlbumDetail,
	AlbumListing,
	RevelarConfig,
	IngestEvent,
	PublishEvent,
	PublishSiteResult,
	PublishTarget,
	PublishPhase,
	ExportSiteResult
} from '@index84/revelar';

export type SiteState = { root: string; config: RevelarConfig; albums: AlbumListing[] };
export type Screen = 'welcome' | 'library' | 'album' | 'preview' | 'publish' | 'settings';

const bridge = () => window.revelar;

export const engine = {
	open: (root: string) =>
		bridge().call<{
			root: string;
			isSite: boolean;
			config?: RevelarConfig;
			albums?: AlbumListing[];
		}>('site.open', { root }),
	init: (root: string) => bridge().call<{ root: string; written: string[] }>('site.init', { root }),
	albums: (root: string) => bridge().call<AlbumListing[]>('site.albums', { root }),
	saveConfig: (root: string, config: unknown) =>
		bridge().call<RevelarConfig>('site.config.save', { root, config: $state.snapshot(config) }),
	album: (root: string, slug: string) => bridge().call<AlbumDetail>('album.get', { root, slug }),
	saveAlbum: (root: string, slug: string, patch: Record<string, unknown>) =>
		bridge().call<AlbumDetail>('album.save', { root, slug, patch }),
	addAlbum: (root: string, source: string) =>
		bridge().call<{ folder: string; copied: number }>('album.add', { root, source }),
	ingest: (root: string, force = false) =>
		bridge().call<{
			warnings: string[];
			errors: string[];
			ms: number;
			stats: { photos: number; encoded: number };
		}>('ingest', { root, force }),
	build: (root: string) => bridge().call<{ outDir: string }>('build', { root }),
	previewStart: (root: string) => bridge().call<{ url: string }>('preview.start', { root }),
	previewStop: () => bridge().call('preview.stop'),
	/** Processes, builds and uploads the site, built for the host's address unless it has a domain. */
	publish: (
		root: string,
		opts: { target: PublishTarget; token: string; name?: string; account?: string; siteId?: string }
	) => bridge().call<PublishSiteResult>('publish', { root, ...opts }),
	/** Processes and builds the site for a server of the owner's own, at `baseUrl`. */
	export: (root: string, baseUrl: string) =>
		bridge().call<ExportSiteResult>('export', { root, baseUrl })
};

/** Live progress of the running ingest / publish, for the status bar. */
export const activity = $state({
	busy: false,
	/** false for steps with nothing to count (building): progress events are ignored then,
	 *  which also keeps a late event from the previous step off the fresh card */
	counts: true,
	label: '',
	slug: '',
	done: 0,
	total: 0,
	log: [] as { level: string; message: string }[],
	/** a publish's checklist: the stages it goes through, and how far it is (-1 before the first) */
	phases: [] as { key: PublishPhase; label: string }[],
	phase: -1
});

let siteListeners: (() => void)[] = [];
/** Called when files or folders change in the open site's photos/ (the engine watches it). */
export function onSiteChanged(fn: () => void): () => void {
	siteListeners = [...siteListeners, fn];
	return () => {
		siteListeners = siteListeners.filter((f) => f !== fn);
	};
}

export function watchEvents(): () => void {
	return bridge().on(({ event, data }) => {
		if (event === 'site') {
			for (const fn of siteListeners) fn();
		} else if (event === 'ingest') {
			const e = data as IngestEvent;
			if (e.type === 'progress') {
				if (!activity.counts) return;
				activity.slug = e.slug;
				activity.done = e.done;
				activity.total = e.total;
			} else if (e.type === 'log') {
				activity.log = [...activity.log.slice(-199), { level: e.level, message: e.message }];
			}
		} else if (event === 'publish') {
			const e = data as PublishEvent;
			if (e.type === 'status') activity.label = e.message;
			else if (e.type === 'phase') {
				// Only forward: a rebuild for a corrected address stays under "Going live".
				const i = activity.phases.findIndex((p) => p.key === e.phase);
				if (i > activity.phase) {
					activity.phase = i;
					// counts belong to the stage that reports them
					activity.slug = '';
					activity.done = 0;
					activity.total = 0;
				}
			} else if (activity.counts) {
				activity.done = e.done;
				activity.total = e.total;
			}
		}
	});
}

export async function run<T>(
	label: string,
	fn: () => Promise<T>,
	opts: { counts?: boolean; phases?: { key: PublishPhase; label: string }[] } = {}
): Promise<T> {
	activity.phases = opts.phases ?? [];
	activity.phase = -1;
	activity.busy = true;
	activity.counts = opts.counts ?? true;
	activity.label = label;
	activity.slug = '';
	activity.done = 0;
	activity.total = 0;
	try {
		const result = await fn();
		if (activity.phases.length) {
			// a beat with every stage checked, so the end is seen before the card goes
			activity.phase = activity.phases.length;
			await new Promise((r) => setTimeout(r, 700));
		}
		return result;
	} finally {
		activity.busy = false;
		activity.label = '';
		activity.phases = [];
	}
}

/** Thumbnails and covers are served by the main process from the site's static/ folder. */
export function siteUrl(path: string): string {
	return `site://${path.replace(/^\//, '')}`;
}
