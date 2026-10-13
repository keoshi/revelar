<script lang="ts">
	/**
	 * Fullscreen viewer: a PhotoSwipe 5 wrapper (dynamically imported on first open) with
	 * all UI rendered by Svelte through PhotoSwipe's UI API. Handles the configured
	 * transition between photos (a decode-gated crossfade by default, for manual
	 * navigation and autoplay alike), auto-hiding chrome, keyboard shortcuts, native
	 * fullscreen and preloading. The album state drives it; URL handling lives in AlbumPage.
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
	import type { InfoMapSettings } from './InfoPanel.svelte';

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
		/** mini map in the info panel; undefined when maps are disabled */
		map?: InfoMapSettings;
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
		map,
		onIndexChange,
		onRequestClose,
		onClosed,
		onOpened
	}: Props = $props();

	const INFO_WIDTH = 320;
	const CHROME_TIMEOUT = 2500;
	/** --dur-image: crossfade for manual navigation */
	const FADE_MANUAL = 240;
	/** --dur-crossfade: crossfade between slideshow photos */
	const FADE_SLIDESHOW = 400;
	/** how long to keep the overlay up while the underlying slide finishes loading */
	const SWAP_LOAD_TIMEOUT = 1500;

	let pswp: PhotoSwipe | undefined;
	let chrome: ReturnType<typeof mount> | undefined;
	let opening = false;
	let closingRequested = false;
	/** index a programmatic move is heading for; a `change` to any other index came from the user */
	let programmaticTarget: number | undefined;
	/** target of the crossfade in flight, so repeated presses chain from it */
	let inflightIndex: number | undefined;
	/** bumped on every navigation; a crossfade whose token is stale never swaps the slide */
	let navToken = 0;
	let overlays: HTMLElement[] = [];
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
			// Arrow keys are handled below so they go through the configured transition.
			arrowKeys: false,
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
							map,
							onClose: requestClose,
							onPrev: () => userNav(() => navigateBy(-1)),
							onNext: () => userNav(() => navigateBy(1)),
							onGoTo: (i) => userNav(() => navigateTo(i)),
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
			const programmatic = programmaticTarget === instance.currIndex;
			programmaticTarget = undefined;
			if (!programmatic) {
				// A swipe or drag moved the slide: drop any crossfade in flight and stop the slideshow.
				navToken++;
				inflightIndex = undefined;
				clearOverlays();
				if (ready) albumState.pause();
			} else if (albumState.autoplay) scheduleAutoplay();
			if (instance.currIndex !== albumState.index) albumState.goTo(instance.currIndex);
			onIndexChange(instance.currIndex);
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
				case 'ArrowRight': {
					const slide = instance.currSlide;
					// Zoomed in, the arrows pan (PhotoSwipe's own behaviour); otherwise they navigate.
					if (slide && slide.currZoomLevel > slide.zoomLevels.fit) return;
					e.preventDefault();
					ev.preventDefault();
					if (albumState.count > 1) userNav(() => navigateBy(ev.key === 'ArrowRight' ? 1 : -1));
					break;
				}
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
			navToken++;
			inflightIndex = undefined;
			overlays = [];
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

	/** Programmatic move (Back/Forward, filmstrip): uses the configured transition. */
	export function goTo(index: number) {
		void navigateTo(index);
	}

	function userNav(fn: () => void) {
		albumState.pause();
		fn();
	}

	function wrapIndex(index: number) {
		const n = albumState.count;
		return ((index % n) + n) % n;
	}

	/** Previous/next relative to the photo currently heading into view, so key repeats chain. */
	function navigateBy(delta: 1 | -1) {
		if (!pswp) return;
		const mode = reducedMotion ? 'none' : transition;
		if (mode === 'slide') {
			programmaticTarget = wrapIndex(pswp.potentialIndex + delta);
			if (delta > 0) pswp.next();
			else pswp.prev();
			return;
		}
		void navigateTo((inflightIndex ?? pswp.currIndex) + delta);
	}

	/**
	 * Move to a photo with the configured transition. Crossfade: a decoded overlay of the
	 * target fades in over the stage, the slide index then moves instantly underneath it,
	 * and the overlay goes once the real slide has loaded. Navigations issued mid-fade
	 * stack their overlays; only the latest one swaps the slide.
	 */
	async function navigateTo(index: number, fade = FADE_MANUAL) {
		if (!pswp) return;
		index = wrapIndex(index);
		if (!ready) {
			pendingIndex = index;
			return;
		}
		const token = ++navToken;
		if (pswp.currIndex === index) {
			inflightIndex = undefined;
			clearOverlays();
			return;
		}
		const mode = reducedMotion ? 'none' : transition;
		programmaticTarget = index;
		if (mode === 'crossfade' && albumState.count > 1) {
			inflightIndex = index;
			try {
				await crossfadeTo(index, fade, token);
			} finally {
				if (token === navToken) inflightIndex = undefined;
			}
		} else if (mode === 'slide') pswp.goTo(index);
		else pswp.mainScroll.moveIndexBy(index - pswp.currIndex, false);
	}

	function clearOverlays() {
		for (const img of overlays) img.remove();
		overlays = [];
	}

	/** Resolves when the slide's content has loaded (or errored), or after `timeout` ms. */
	function slideLoaded(slide: PhotoSwipe['currSlide'], timeout: number): Promise<void> {
		return new Promise((resolve) => {
			const instance = pswp;
			const content = slide?.content;
			if (!instance || !content || content.state === 'loaded' || content.isError()) {
				resolve();
				return;
			}
			const done = () => {
				clearTimeout(timer);
				instance.off('loadComplete', onLoad);
				resolve();
			};
			const onLoad = (e: { slide?: PhotoSwipe['currSlide'] }) => {
				if (e.slide === slide) done();
			};
			instance.on('loadComplete', onLoad);
			const timer = setTimeout(done, timeout);
		});
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

	function advance() {
		if (!pswp || !albumState.autoplay || document.hidden) return;
		void navigateTo(pswp.currIndex + 1, FADE_SLIDESHOW);
	}

	async function crossfadeTo(nextIndex: number, fade: number, token: number): Promise<void> {
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
		if (!pswp || token !== navToken) return;
		// The overlay is opaque (stage background + photo) so the outgoing photo fades out
		// underneath exactly as the incoming one fades in, whatever their aspect ratios.
		const layer = document.createElement('div');
		layer.className = 'revelar-crossfade';
		Object.assign(layer.style, {
			position: 'absolute',
			left: '0',
			top: '0',
			width: `${viewport.x}px`,
			height: `${viewport.y}px`,
			background: 'var(--bg-stage, #000)',
			opacity: '0',
			zIndex: '5',
			pointerEvents: 'none',
			transition: `opacity ${fade}ms var(--ease-out)`
		});
		Object.assign(img.style, { width: '100%', height: '100%', objectFit: 'contain' });
		layer.appendChild(img);
		stage.appendChild(layer);
		overlays.push(layer);
		await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
		layer.style.opacity = '1';
		await new Promise((r) => setTimeout(r, fade));
		if (!pswp || token !== navToken) return;
		programmaticTarget = nextIndex;
		pswp.mainScroll.moveIndexBy(nextIndex - pswp.currIndex, false);
		await slideLoaded(pswp.currSlide, SWAP_LOAD_TIMEOUT);
		if (token !== navToken) return;
		await new Promise((r) => requestAnimationFrame(r));
		if (token === navToken) clearOverlays();
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
			// Teardown (e.g. navigating away): PhotoSwipe still fires `close`, which must not
			// be mistaken for the user asking to close and rewrite the URL mid-navigation.
			closingRequested = true;
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
