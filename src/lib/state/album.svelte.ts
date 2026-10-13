import type { Photo } from '../types.ts';

export type ViewMode = 'grid' | 'viewer';

/**
 * One store per album, shared by the grid and the fullscreen viewer.
 * Holds the current index, view mode, panel visibility and the preload queue.
 */
export class AlbumState {
	photos = $state<Photo[]>([]);
	index = $state(0);
	mode = $state<ViewMode>('grid');
	autoplay = $state(false);
	infoOpen = $state(false);
	filmstripOpen = $state(true);
	chromeVisible = $state(true);
	fullscreen = $state(false);
	/** indices the viewer should warm up next */
	preloadQueue = $state<number[]>([]);
	/** set when the viewer was opened from the grid in this document (so Back closes it) */
	openedFromGrid = $state(false);

	constructor(photos: Photo[], opts: { filmstrip?: boolean } = {}) {
		this.photos = photos;
		this.filmstripOpen = opts.filmstrip ?? true;
	}

	get count(): number {
		return this.photos.length;
	}

	get current(): Photo | undefined {
		return this.photos[this.index];
	}

	open(index: number, opts: { autoplay?: boolean; fromGrid?: boolean } = {}): void {
		this.index = this.clamp(index);
		this.openedFromGrid = Boolean(opts.fromGrid);
		this.mode = 'viewer';
		this.chromeVisible = true;
		this.autoplay = Boolean(opts.autoplay);
		this.updatePreload();
	}

	close(): void {
		this.mode = 'grid';
		this.autoplay = false;
		this.infoOpen = false;
		this.fullscreen = false;
		this.preloadQueue = [];
	}

	goTo(index: number): void {
		this.index = this.clamp(index);
		this.updatePreload();
	}

	next(): void {
		this.goTo((this.index + 1) % this.count);
	}

	prev(): void {
		this.goTo((this.index - 1 + this.count) % this.count);
	}

	togglePlay(): void {
		this.autoplay = !this.autoplay;
		if (this.autoplay) this.infoOpen = false;
		this.updatePreload();
	}

	pause(): void {
		this.autoplay = false;
	}

	toggleInfo(): void {
		this.infoOpen = !this.infoOpen;
		if (this.infoOpen) this.autoplay = false;
	}

	toggleFilmstrip(): void {
		this.filmstripOpen = !this.filmstripOpen;
	}

	private clamp(i: number): number {
		if (this.count === 0) return 0;
		return Math.min(Math.max(0, i), this.count - 1);
	}

	private updatePreload(): void {
		const n = this.count;
		if (n <= 1) {
			this.preloadQueue = [];
			return;
		}
		const next = (this.index + 1) % n;
		const prev = (this.index - 1 + n) % n;
		const after = (this.index + 2) % n;
		this.preloadQueue = this.autoplay ? [next, after, prev] : [next, prev];
	}
}

export function createAlbumState(
	album: { photos: Photo[] },
	opts: { filmstrip?: boolean } = {}
): AlbumState {
	return new AlbumState(album.photos, opts);
}
