<script lang="ts">
	/**
	 * Fullscreen viewer: a PhotoSwipe 5 wrapper (dynamically imported on first open) with
	 * all UI rendered by Svelte through PhotoSwipe's UI API. Handles autoplay with a
	 * decode-gated crossfade, auto-hiding chrome, keyboard shortcuts, native fullscreen
	 * and preloading. The album state drives it; URL handling lives in AlbumPage.
	 */
	import { mount, unmount } from 'svelte';
	import type PhotoSwipe from 'photoswipe';
	import type { SlideData } from 'photoswipe';
	import type { AlbumState } from '../state/album.svelte.ts';
	import type { Photo } from '../types.ts';
	import { expandSources, largestWidth, srcsetString } from '../utils/sources.ts';
	import { prefersReducedMotion, supportsAvif } from '../utils/formats.ts';
	import { withBase } from '../utils/href.ts';
	import ViewerChrome from './ViewerChrome.svelte';

	type Props = {
		albumState: AlbumState;
		language: string;
		slideshowInterval: number;
		transition: 'crossfade' | 'slide' | 'none';
		filmstripEnabled: boolean;
		exifPanel: boolean;
		/** returns the grid tile <img> for the zoom-from-thumbnail animation */
		getThumbEl: (index: number) => HTMLElement | null;
		downloadFor: (
			photo: Photo
		) => { href?: string; name?: string; bytes?: number; onClick?: () => void } | undefined;
		/** private albums: resolve a decrypted object URL for a photo at (at least) the given width */
		resolveSrc?: (photo: Photo, width: number) => Promise<string>;
		thumbSrc?: (photo: Photo) => Promise<string> | string;
		onIndexChange: (index: number) => void;
		/** the user asked to close (Esc, button, swipe); AlbumPage decides how the URL changes */
		onRequestClose: () => void;
		/** PhotoSwipe has fully closed */
		onClosed: () => void;
		/** the opening animation finished */
		onOpened?: () => void;
	};

	let {
		albumState,
		language,
		slideshowInterval,
		transition,
		filmstripEnabled,
		exifPanel,
		getThumbEl,
		downloadFor,
		resolveSrc,
		thumbSrc,
		onIndexChange,
		onRequestClose,
		onClosed,
		onOpened
	}: Props = $props();

	const INFO_WIDTH = 320;
	const CHROME_TIMEOUT = 2500;

	let pswp: PhotoSwipe | undefined;
	let chrome: ReturnType<typeof mount> | undefined;
	let opening = false;
	let closingRequested = false;
	let programmaticMove = false;
	let ready = false;
	let pendingClose = false;
	let pendingIndex: number | undefined;
	let autoplayTimer: ReturnType<typeof setTimeout> | undefined;
	let chromeTimer: ReturnType<typeof setTimeout> | undefined;
	let progressKey = $state(0);
	let useAvif = false;
	let reducedMotion = false;
	const canFullscreen =
		typeof document !== 'undefined' && Boolean(document.documentElement.requestFullscreen);

	function slideFor(photo: Photo, index: number): SlideData {
		const sources = expandSources(photo.sources);
		const maxW = largestWidth(photo.sources);
		const maxH = Math.round(maxW / photo.aspect);
		const thumb = getThumbEl(index);
		const thumbImg = thumb?.querySelector('img');
		const data: SlideData = {
			width: maxW,
			height: maxH,
			alt: photo.alt,
			element: thumb ?? undefined,
			thumbCropped: false,
			msrc: thumbImg?.currentSrc || undefined
		};
		if (!resolveSrc) {
			data.src = withBase(sources.jpeg);
			data.srcset = srcsetString(useAvif ? sources.avif : sources.webp, withBase(''));
		}
		return data;
	}

	async function openViewer(index: number) {
		if (pswp || opening) return;
		opening = true;
		const [{ default: PhotoSwipe }] = await Promise.all([
			import('photoswipe'),
			import('photoswipe/dist/photoswipe.css'),
			supportsAvif().then((ok) => (useAvif = ok))
		]);
		reducedMotion = prefersReducedMotion();
		if (albumState.mode !== 'viewer') {
			opening = false;
			return;
		}
		const photos = albumState.photos;
		const instance = new PhotoSwipe({
			dataSource: photos.map(slideFor),
			index,
			appendToEl: document.body,
			mainClass: 'revelar-viewer stage-dark',
			bgOpacity: 1,
			showHideAnimationType: reducedMotion ? 'none' : 'zoom',
			showAnimationDuration: reducedMotion ? 0 : 320,
			hideAnimationDuration: reducedMotion ? 0 : 240,
			zoomAnimationDuration: reducedMotion ? 0 : 240,
			zoom: false,
			close: false,
			counter: false,
			arrowPrev: false,
			arrowNext: false,
			trapFocus: true,
			returnFocus: false,
			escKey: true,
			arrowKeys: true,
			loop: true,
			preload: [1, 2],
			padding: { top: 0, bottom: 0, left: 0, right: 0 },
			initialZoomLevel: (levels) => Math.min(levels.fit, 1),
			secondaryZoomLevel: (levels) =>
				Math.max(Math.min(levels.fit * 2, 1), Math.min(levels.fit, 1)),
			maxZoomLevel: 1,
			imageClickAction: 'zoom-or-close',
			bgClickAction: 'close',
			tapAction: () => toggleChrome(),
			doubleTapAction: 'zoom',
			getViewportSizeFn: () => ({
				x: window.innerWidth - (albumState.infoOpen && window.innerWidth >= 640 ? INFO_WIDTH : 0),
				y: window.innerHeight
			})
		});
		pswp = instance;

		instance.addFilter('thumbEl', (el, _data, i) => getThumbEl(i) ?? el ?? undefined!);

		if (resolveSrc) {
			// Private albums: load decrypted object URLs instead of letting PhotoSwipe fetch.
			instance.on('contentLoad', (e) => {
				const { content } = e;
				const photo = photos[content.index];
				if (!photo) return;
				e.preventDefault();
				const img = document.createElement('img');
				img.className = 'pswp__img';
				img.alt = photo.alt;
				content.element = img;
				content.state = 'loading';
				const width =
					Math.max(content.displayedImageWidth || 0, 640) * (window.devicePixelRatio || 1);
				resolveSrc(photo, width)
					.then((url) => {
						img.src = url;
						return img.decode().catch(() => undefined);
					})
					.then(() => content.onLoaded())
					.catch(() => content.onError());
			});
		}

		instance.on('uiRegister', () => {
			instance.ui?.registerElement({
				name: 'revelar-chrome',
				appendTo: 'root',
				onInit: (el) => {
					el.style.position = 'absolute';
					el.style.inset = '0';
					el.style.pointerEvents = 'none';
					chrome = mount(ViewerChrome, {
						target: el,
						props: {
							albumState,
							language,
							slideshowInterval,
							filmstripEnabled,
							exifPanel,
							canFullscreen,
							get progressKey() {
								return progressKey;
							},
							downloadFor,
							thumbSrc,
							onClose: requestClose,
							onPrev: () => userNav(() => instance.prev()),
							onNext: () => userNav(() => instance.next()),
							onGoTo: (i) => userNav(() => instance.goTo(i)),
							onTogglePlay: togglePlay,
							onToggleInfo: toggleInfo,
							onToggleFilmstrip: () => albumState.toggleFilmstrip(),
							onToggleFullscreen: toggleFullscreen
						}
					});
				}
			});
		});

		instance.on('change', () => {
			if (instance.currIndex !== albumState.index) albumState.goTo(instance.currIndex);
			onIndexChange(instance.currIndex);
			if (!programmaticMove && ready) albumState.pause();
			else if (albumState.autoplay) scheduleAutoplay();
			showChrome();
		});
		instance.on('bindEvents', () => {
			const el = instance.element!;
			el.setAttribute('aria-label', 'Photo viewer');
			el.setAttribute('aria-roledescription', 'carousel');
			el.addEventListener('pointermove', onActivity);
			el.addEventListener('pointerdown', onUserInteraction);
			el.addEventListener('wheel', onUserInteraction, { passive: true });
		});
		instance.on('keydown', (e) => {
			const ev = e.originalEvent;
			if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
			const target = ev.target as HTMLElement | null;
			if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
			showChrome();
			switch (ev.key) {
				case ' ':
					ev.preventDefault();
					togglePlay();
					break;
				case 'i':
				case 'I':
					if (exifPanel) toggleInfo();
					break;
				case 't':
				case 'T':
					if (filmstripEnabled) albumState.toggleFilmstrip();
					break;
				case 'd':
				case 'D':
					triggerDownload();
					break;
				case 'f':
				case 'F':
					toggleFullscreen();
					break;
				case 'Escape':
					e.preventDefault();
					requestClose();
					break;
				case 'ArrowLeft':
				case 'ArrowRight':
					albumState.pause();
					break;
			}
		});
		instance.on('close', () => {
			// PhotoSwipe is closing (Esc handled above; also swipe down, bg click, pinch)
			stopAutoplay();
			if (!closingRequested) {
				closingRequested = true;
				onRequestClose();
			}
		});
		instance.on('openingAnimationEnd', () => {
			ready = true;
			onOpened?.();
			instance.element?.classList.add('revelar-ready');
			if (pendingClose) {
				pendingClose = false;
				instance.close();
			} else if (pendingIndex !== undefined) {
				const i = pendingIndex;
				pendingIndex = undefined;
				goTo(i);
			}
		});
		instance.on('destroy', () => {
			if (chrome) unmount(chrome);
			chrome = undefined;
			pswp = undefined;
			ready = false;
			pendingClose = false;
			pendingIndex = undefined;
			closingRequested = false;
			clearTimeout(chromeTimer);
			if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
			onClosed();
		});
		document.addEventListener('visibilitychange', onVisibility);
		document.addEventListener('fullscreenchange', onFullscreenChange);

		instance.init();
		opening = false;
		showChrome();
		if (albumState.autoplay) scheduleAutoplay();
	}

	function requestClose() {
		if (!pswp || closingRequested) return;
		closingRequested = true;
		stopAutoplay();
		onRequestClose();
		if (ready) pswp.close();
		else pendingClose = true;
	}

	/** Programmatic close (e.g. Back button) */
	export function close() {
		if (!pswp) return;
		closingRequested = true;
		stopAutoplay();
		if (ready) pswp.close();
		else pendingClose = true;
	}

	export function goTo(index: number) {
		if (!pswp || pswp.currIndex === index) return;
		if (!ready) {
			pendingIndex = index;
			return;
		}
		programmaticMove = true;
		pswp.goTo(index);
		programmaticMove = false;
	}

	function userNav(fn: () => void) {
		albumState.pause();
		fn();
	}

	// ---- autoplay -------------------------------------------------------------
	function togglePlay() {
		albumState.togglePlay();
		if (albumState.autoplay) scheduleAutoplay();
		else stopAutoplay();
	}

	function scheduleAutoplay() {
		clearTimeout(autoplayTimer);
		progressKey++;
		autoplayTimer = setTimeout(advance, slideshowInterval);
	}

	function stopAutoplay() {
		clearTimeout(autoplayTimer);
		autoplayTimer = undefined;
		albumState.pause();
	}

	async function advance() {
		if (!pswp || !albumState.autoplay || document.hidden) return;
		const n = albumState.count;
		const nextIndex = (pswp.currIndex + 1) % n;
		const mode = reducedMotion ? 'none' : transition;
		programmaticMove = true;
		try {
			if (mode === 'crossfade' && n > 1) await crossfadeTo(nextIndex);
			else if (mode === 'slide') pswp.next();
			else pswp.mainScroll.moveIndexBy(1, false);
		} finally {
			programmaticMove = false;
		}
	}

	/** Crossfade: an overlay of the next photo fades in over the stage, then the index moves instantly. */
	async function crossfadeTo(nextIndex: number): Promise<void> {
		const instance = pswp!;
		const photo = albumState.photos[nextIndex];
		const stage = instance.scrollWrap!;
		const viewport = instance.viewportSize;
		const dpr = window.devicePixelRatio || 1;
		const fitScale = Math.min(
			viewport.x / largestWidth(photo.sources),
			viewport.y / (largestWidth(photo.sources) / photo.aspect),
			1
		);
		const displayW = largestWidth(photo.sources) * fitScale;
		const img = document.createElement('img');
		img.alt = '';
		img.decoding = 'async';
		img.className = 'revelar-crossfade';
		if (resolveSrc) img.src = await resolveSrc(photo, displayW * dpr);
		else {
			const s = expandSources(photo.sources);
			img.sizes = `${Math.round(displayW)}px`;
			img.srcset = srcsetString(useAvif ? s.avif : s.webp, withBase(''));
			img.src = withBase(s.jpeg);
		}
		try {
			await img.decode();
		} catch {
			// fall through: still show it
		}
		if (!pswp || !albumState.autoplay) return;
		Object.assign(img.style, {
			position: 'absolute',
			left: '0',
			top: '0',
			width: `${viewport.x}px`,
			height: `${viewport.y}px`,
			objectFit: 'contain',
			opacity: '0',
			zIndex: '5',
			pointerEvents: 'none',
			transition: 'opacity var(--dur-crossfade) var(--ease-out)'
		});
		stage.appendChild(img);
		await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
		img.style.opacity = '1';
		await new Promise((r) => setTimeout(r, 400));
		if (pswp) pswp.mainScroll.moveIndexBy(nextIndex - pswp.currIndex, false);
		await new Promise((r) => requestAnimationFrame(r));
		img.remove();
	}

	// ---- chrome visibility ---------------------------------------------------
	function showChrome() {
		albumState.chromeVisible = true;
		pswp?.element?.classList.remove('revelar-idle');
		clearTimeout(chromeTimer);
		chromeTimer = setTimeout(hideChrome, CHROME_TIMEOUT);
	}
	function hideChrome() {
		if (!pswp || albumState.infoOpen) return;
		const active = document.activeElement;
		if (
			active &&
			pswp.element?.contains(active) &&
			active !== pswp.element &&
			active.closest('[data-controls]')
		) {
			// keep chrome while a control has keyboard focus
			chromeTimer = setTimeout(hideChrome, CHROME_TIMEOUT);
			return;
		}
		albumState.chromeVisible = false;
		pswp.element?.classList.add('revelar-idle');
	}
	function toggleChrome() {
		if (albumState.chromeVisible) {
			clearTimeout(chromeTimer);
			albumState.chromeVisible = false;
			pswp?.element?.classList.add('revelar-idle');
		} else showChrome();
	}
	function onActivity() {
		showChrome();
	}
	function onUserInteraction() {
		showChrome();
	}
	function onVisibility() {
		if (document.hidden) stopAutoplay();
	}

	// ---- info / fullscreen / download ----------------------------------------
	function toggleInfo() {
		albumState.toggleInfo();
		if (albumState.autoplay) stopAutoplay();
		showChrome();
		requestAnimationFrame(() => pswp?.updateSize(true));
	}
	function toggleFullscreen() {
		if (!canFullscreen || !pswp?.element) return;
		if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
		else pswp.element.requestFullscreen().catch(() => undefined);
	}
	function onFullscreenChange() {
		albumState.fullscreen = Boolean(document.fullscreenElement);
		pswp?.updateSize(true);
	}
	function triggerDownload() {
		const photo = albumState.current;
		if (!photo) return;
		const d = downloadFor(photo);
		if (!d) return;
		if (d.onClick) d.onClick();
		else if (d.href) {
			const a = document.createElement('a');
			a.href = d.href;
			a.download = d.name ?? '';
			a.click();
		}
	}

	// ---- lifecycle ------------------------------------------------------------
	$effect(() => {
		if (albumState.mode === 'viewer') {
			if (!pswp && !opening) void openViewer(albumState.index);
		} else if (pswp) close();
	});

	$effect(() => {
		// Keep PhotoSwipe in sync when the albumState index changes externally (filmstrip, Forward/Back).
		const i = albumState.index;
		if (pswp && pswp.currIndex !== i) goTo(i);
	});

	$effect(() => {
		// Layout changes when the info panel opens on desktop (stage shrinks, not overlaid).
		void albumState.infoOpen;
		pswp?.updateSize(true);
	});

	$effect(() => {
		// Client-only teardown (onDestroy would also run during prerendering).
		return () => {
			clearTimeout(autoplayTimer);
			clearTimeout(chromeTimer);
			document.removeEventListener('visibilitychange', onVisibility);
			document.removeEventListener('fullscreenchange', onFullscreenChange);
			pswp?.destroy();
		};
	});
</script>

<style>
	:global(.revelar-viewer) {
		--pswp-bg: var(--bg-stage, #000);
		--info-width: 320px;
		font-family: var(--font-ui);
	}

	:global(.revelar-viewer .pswp__bg) {
		background: var(--bg-stage, #000);
	}

	:global(.revelar-viewer.revelar-idle) {
		cursor: none;
	}

	:global(.revelar-viewer .pswp__img) {
		image-rendering: auto;
	}

	@media (prefers-reduced-motion: reduce) {
		:global(.revelar-viewer .pswp__img),
		:global(.revelar-viewer .pswp__container),
		:global(.revelar-viewer .pswp__bg) {
			transition: none !important;
		}
	}
</style>
