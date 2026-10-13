<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { photoHref } from '../utils/href.ts';
	import type { Photo } from '../types.ts';
	import Picture from './Picture.svelte';
	import {
		GRID_SPACING,
		INLINE_LAYOUT_SCRIPT,
		computeLayout,
		rowHeightFor,
		type Layout
	} from '../utils/layout.ts';

	type Props = {
		photos: Photo[];
		albumSlug: string;
		rowHeight: { desktop: number; mobile: number };
		/** index of the photo whose tile should be focused (e.g. after the viewer closes) */
		onOpen?: (index: number, tile: HTMLElement) => void;
		/** resolves the href for a photo; defaults to /[album]/[photo]/ */
		hrefFor?: (photo: Photo) => string;
	};

	let { photos, albumSlug, rowHeight, onOpen, hrefFor }: Props = $props();

	let grid: HTMLElement | undefined = $state();
	let layout = $state<Layout | undefined>(undefined);
	let focusIndex = $state(0);
	let width = $state(0);
	let hydrated = $state(false);

	const aspects = $derived(photos.map((p) => p.aspect));
	const EAGER_ROW_WIDTH = 1552;
	const eagerCount = $derived.by(() => {
		let sum = 0;
		let n = 0;
		for (const a of aspects) {
			sum += a * rowHeight.desktop;
			n++;
			if (sum >= EAGER_ROW_WIDTH) break;
		}
		return n;
	});

	function relayout() {
		if (!grid) return;
		const w = grid.clientWidth;
		if (!w) return;
		width = w;
		layout = computeLayout(aspects, w, {
			rowHeight: rowHeightFor(w, rowHeight),
			spacing: GRID_SPACING
		});
	}

	onMount(() => {
		relayout();
		hydrated = true;
		let frame = 0;
		const ro = new ResizeObserver(() => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(relayout);
		});
		ro.observe(grid!);
		return () => {
			ro.disconnect();
			cancelAnimationFrame(frame);
		};
	});

	$effect(() => {
		// photos changed (e.g. private album decrypted): recompute
		void aspects;
		if (hydrated) relayout();
	});

	/** Estimated sizes for SSR: aspect × target row height, before the exact layout is known. */
	function ssrSizes(aspect: number): string {
		return `(max-width: 639px) ${Math.round(aspect * rowHeight.mobile)}px, ${Math.round(aspect * rowHeight.desktop)}px`;
	}

	function tileStyle(i: number): string | undefined {
		const b = layout?.boxes[i];
		if (!b) return undefined;
		return `top:${b.top}px;left:${b.left}px;width:${b.width}px;height:${b.height}px`;
	}

	function href(photo: Photo): string {
		return hrefFor ? hrefFor(photo) : photoHref(albumSlug, photo.id);
	}

	function tiles(): HTMLElement[] {
		return grid ? (Array.from(grid.querySelectorAll('[data-tile]')) as HTMLElement[]) : [];
	}

	export function focusTile(index: number) {
		focusIndex = index;
		tick().then(() => tiles()[index]?.focus({ preventScroll: false }));
	}

	function onClick(e: MouseEvent, i: number) {
		if (!onOpen) return;
		if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
		e.preventDefault();
		focusIndex = i;
		onOpen(i, e.currentTarget as HTMLElement);
	}

	/** Roving tabindex: arrows move between tiles, Up/Down pick the nearest tile in the adjacent row. */
	function onKeydown(e: KeyboardEvent, i: number) {
		if (!layout) return;
		const boxes = layout.boxes;
		let next = -1;
		switch (e.key) {
			case 'ArrowRight':
				next = Math.min(i + 1, boxes.length - 1);
				break;
			case 'ArrowLeft':
				next = Math.max(i - 1, 0);
				break;
			case 'Home':
				next = 0;
				break;
			case 'End':
				next = boxes.length - 1;
				break;
			case 'ArrowDown':
			case 'ArrowUp': {
				const cur = boxes[i];
				const cx = cur.left + cur.width / 2;
				const dir = e.key === 'ArrowDown' ? 1 : -1;
				const rowTops = [...new Set(boxes.map((b) => b.top))].sort((a, b) => a - b);
				const rowIdx = rowTops.indexOf(cur.top) + dir;
				if (rowIdx < 0 || rowIdx >= rowTops.length) return;
				const targetTop = rowTops[rowIdx];
				let best = -1;
				let bestDist = Infinity;
				boxes.forEach((b, j) => {
					if (b.top !== targetTop) return;
					const d = Math.abs(b.left + b.width / 2 - cx);
					if (d < bestDist) {
						bestDist = d;
						best = j;
					}
				});
				next = best;
				break;
			}
			default:
				return;
		}
		if (next < 0 || next === i) {
			e.preventDefault();
			return;
		}
		e.preventDefault();
		focusTile(next);
	}
</script>

<div
	bind:this={grid}
	class="grid"
	class:abs={Boolean(layout)}
	data-layout={layout ? 'abs' : 'flow'}
	data-row-desktop={rowHeight.desktop}
	data-row-mobile={rowHeight.mobile}
	style:height={layout ? `${layout.height}px` : undefined}
	style:--row-h="{rowHeight.desktop}px"
	style:--row-h-mobile="{rowHeight.mobile}px"
	aria-label="Photos"
>
	{#each photos as photo, i (photo.id)}
		<a
			class="tile"
			data-tile
			data-aspect={photo.aspect}
			href={href(photo)}
			tabindex={i === focusIndex ? 0 : -1}
			style={tileStyle(i)}
			style:--aspect={photo.aspect}
			onclick={(e) => onClick(e, i)}
			onkeydown={(e) => onKeydown(e, i)}
			onfocus={() => (focusIndex = i)}
			aria-label={photo.title ? `${photo.title}` : `Photo ${i + 1} of ${photos.length}`}
		>
			<Picture
				sources={photo.sources}
				alt={photo.alt}
				width={photo.width}
				height={photo.height}
				thumbhash={photo.thumbhash}
				color={photo.color}
				sizes={layout && width ? `${Math.round(layout.boxes[i].width)}px` : ssrSizes(photo.aspect)}
				loading={i < eagerCount ? 'eager' : 'lazy'}
				priority={i < eagerCount}
			/>
			{#if photo.title}
				<span class="overlay"><span class="overlay-title">{photo.title}</span></span>
			{/if}
		</a>
	{/each}
</div>
{#if !hydrated}
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- static, dependency-free layout script (see utils/layout.ts) -->
	{@html `<script>${INLINE_LAYOUT_SCRIPT}</script>`}
{/if}

<style>
	.grid {
		position: relative;
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		align-content: flex-start;
	}

	.tile {
		position: relative;
		display: block;
		overflow: hidden;
		background: var(--surface);
		/* pre-JS fallback: a flex row that approximates the justified layout */
		flex: var(--aspect) 1 calc(var(--aspect) * var(--row-h));
		height: var(--row-h);
		max-width: 100%;
	}

	@media (max-width: 639px) {
		.tile {
			flex-basis: calc(var(--aspect) * var(--row-h-mobile));
			height: var(--row-h-mobile);
		}
	}

	.grid[data-layout='abs'] .tile {
		position: absolute;
		flex: none;
		max-width: none;
	}

	.tile :global(.picture) {
		transition: transform var(--dur-ui) var(--ease-out);
	}

	@media (hover: hover) {
		.tile:hover :global(.picture) {
			transform: scale(1.02);
		}
	}

	.tile:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
		border-radius: 0;
	}

	.overlay {
		position: absolute;
		inset: auto 0 0 0;
		padding: 24px 12px 10px;
		background: linear-gradient(to top, rgb(0 0 0 / 0.55), rgb(0 0 0 / 0));
		color: #fff;
		font-size: var(--text-sm);
		line-height: 1.3;
		opacity: 0;
		transition: opacity var(--dur-ui) var(--ease-out);
		pointer-events: none;
	}

	.overlay-title {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	@media (hover: hover) {
		.tile:hover .overlay {
			opacity: 1;
		}
	}

	.tile:focus-visible .overlay {
		opacity: 1;
	}
</style>
