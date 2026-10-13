<script lang="ts">
	import { onMount } from 'svelte';
	import type { Photo } from '../types.ts';
	import type { PhotoSources } from '../utils/sources.ts';
	import { expandSources } from '../utils/sources.ts';
	import { prefersReducedMotion } from '../utils/formats.ts';
	import { withBase } from '../utils/href.ts';

	type Props = {
		photos: Photo[];
		index: number;
		onSelect: (index: number) => void;
		/** resolves a thumbnail src for private albums; defaults to the smallest WebP derivative */
		thumbSrc?: (photo: Photo) => Promise<string> | string;
	};

	let { photos, index, onSelect, thumbSrc }: Props = $props();

	const VIRTUALISE_FROM = 200;
	const GAP = 4;

	let strip: HTMLElement | undefined = $state();
	let size = $state(72);
	let scrollLeft = $state(0);
	let clientWidth = $state(0);
	const virtual = $derived(photos.length > VIRTUALISE_FROM);
	const pitch = $derived(size + GAP);
	const range = $derived.by(() => {
		if (!virtual) return [0, photos.length] as const;
		const buffer = 10;
		const start = Math.max(0, Math.floor(scrollLeft / pitch) - buffer);
		const end = Math.min(photos.length, Math.ceil((scrollLeft + clientWidth) / pitch) + buffer);
		return [start, end] as const;
	});
	const visible = $derived(
		photos.slice(range[0], range[1]).map((photo, i) => ({ photo, i: i + range[0] }))
	);

	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- plain lookup cache, never rendered directly
	const srcCache = new Map<string, string>();
	function defaultThumb(sources: PhotoSources): string {
		const s = expandSources(sources);
		return withBase(s.webp[0]?.url ?? s.jpeg);
	}
	function srcFor(photo: Photo): string | undefined {
		if (!thumbSrc) return defaultThumb(photo.sources);
		const cached = srcCache.get(photo.id);
		if (cached) return cached;
		const r = thumbSrc(photo);
		if (typeof r === 'string') {
			srcCache.set(photo.id, r);
			return r;
		}
		r.then((url) => {
			srcCache.set(photo.id, url);
			resolved = { ...resolved, [photo.id]: url };
		});
		return undefined;
	}
	let resolved = $state<Record<string, string>>({});

	function centerActive(behavior: ScrollBehavior) {
		if (!strip) return;
		const target = index * pitch + size / 2 - strip.clientWidth / 2;
		strip.scrollTo({ left: Math.max(0, target), behavior });
	}

	onMount(() => {
		size = window.innerWidth < 640 ? 56 : 72;
		clientWidth = strip?.clientWidth ?? 0;
		centerActive('instant');
		const ro = new ResizeObserver(() => {
			clientWidth = strip?.clientWidth ?? 0;
			size = window.innerWidth < 640 ? 56 : 72;
			centerActive('instant');
		});
		if (strip) ro.observe(strip);
		return () => ro.disconnect();
	});

	$effect(() => {
		void index;
		centerActive(prefersReducedMotion() ? 'instant' : 'smooth');
	});

	// Drag to scroll (pointer devices)
	let dragging = false;
	let dragStartX = 0;
	let dragStartScroll = 0;
	let dragMoved = false;
	function onPointerDown(e: PointerEvent) {
		if (e.pointerType !== 'mouse' || !strip) return;
		dragging = true;
		dragMoved = false;
		dragStartX = e.clientX;
		dragStartScroll = strip.scrollLeft;
	}
	function onPointerMove(e: PointerEvent) {
		if (!dragging || !strip) return;
		const dx = e.clientX - dragStartX;
		if (!dragMoved && Math.abs(dx) > 4) {
			dragMoved = true;
			// capture only once a real drag starts, so plain clicks still reach the thumbnails
			strip.setPointerCapture(e.pointerId);
		}
		if (dragMoved) strip.scrollLeft = dragStartScroll - dx;
	}
	function onPointerUp(e: PointerEvent) {
		if (!dragging || !strip) return;
		dragging = false;
		if (strip.hasPointerCapture(e.pointerId)) strip.releasePointerCapture(e.pointerId);
	}
	function onWheel(e: WheelEvent) {
		if (!strip || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
		e.preventDefault();
		strip.scrollLeft += e.deltaY;
	}
	function onClick(i: number) {
		if (dragMoved) {
			dragMoved = false;
			return;
		}
		onSelect(i);
	}
</script>

<div
	bind:this={strip}
	class="filmstrip"
	style:--size="{size}px"
	style:--gap="{GAP}px"
	onscroll={() => (scrollLeft = strip?.scrollLeft ?? 0)}
	onpointerdown={onPointerDown}
	onpointermove={onPointerMove}
	onpointerup={onPointerUp}
	onpointercancel={onPointerUp}
	onwheel={onWheel}
	role="group"
	aria-label="Filmstrip"
>
	<div class="track" style:width={virtual ? `${photos.length * pitch - GAP}px` : undefined}>
		{#each visible as { photo, i } (photo.id)}
			{@const src = srcFor(photo) ?? resolved[photo.id]}
			<button
				type="button"
				class="thumb"
				class:active={i === index}
				aria-current={i === index ? 'true' : undefined}
				aria-label={photo.title ? `${i + 1}: ${photo.title}` : `Photo ${i + 1}`}
				tabindex={i === index ? 0 : -1}
				style:left={virtual ? `${i * pitch}px` : undefined}
				style:background-color={photo.color}
				onclick={() => onClick(i)}
			>
				{#if src}
					<img
						{src}
						alt=""
						width={size}
						height={size}
						loading="lazy"
						decoding="async"
						draggable="false"
					/>
				{/if}
			</button>
		{/each}
	</div>
</div>

<style>
	.filmstrip {
		overflow-x: auto;
		overflow-y: hidden;
		scrollbar-width: none;
		padding: 8px 12px 10px;
		-webkit-overflow-scrolling: touch;
		cursor: grab;
		user-select: none;
	}

	.filmstrip::-webkit-scrollbar {
		display: none;
	}

	.track {
		position: relative;
		display: flex;
		gap: var(--gap);
		height: var(--size);
		width: max-content;
	}

	.thumb {
		position: relative;
		flex: none;
		width: var(--size);
		height: var(--size);
		overflow: hidden;
		opacity: 0.55;
		transition: opacity var(--dur-ui) var(--ease-out);
	}

	.track > .thumb[style*='left'] {
		position: absolute;
		top: 0;
	}

	.thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.thumb::after {
		content: '';
		position: absolute;
		inset: auto 0 0 0;
		height: 2px;
		background: var(--accent);
		opacity: 0;
		transition: opacity var(--dur-ui) var(--ease-out);
	}

	.thumb:hover,
	.thumb.active {
		opacity: 1;
	}

	.thumb.active::after {
		opacity: 1;
	}

	.thumb:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}
</style>
