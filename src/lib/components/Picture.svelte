<script lang="ts">
	import { onMount } from 'svelte';
	import { withBase } from '../utils/href.ts';
	import type { PhotoSources } from '../utils/sources.ts';
	import { expandSources, srcsetString } from '../utils/sources.ts';
	import { thumbhashUrl } from '../utils/thumbhash.ts';

	type Props = {
		sources: PhotoSources;
		alt: string;
		width: number;
		height: number;
		thumbhash?: string;
		color?: string;
		sizes: string;
		loading?: 'lazy' | 'eager';
		priority?: boolean;
		/** object-fit for the img; 'cover' for crops like album covers and filmstrip thumbs */
		fit?: 'contain' | 'cover';
		draggable?: boolean;
		class?: string;
		onload?: (img: HTMLImageElement) => void;
	};

	let {
		sources,
		alt,
		width,
		height,
		thumbhash,
		color = '#222',
		sizes,
		loading = 'lazy',
		priority = false,
		fit = 'cover',
		draggable = false,
		class: className = '',
		onload
	}: Props = $props();

	const expanded = $derived(expandSources(sources));
	const base = withBase('');
	let img: HTMLImageElement | undefined = $state();
	let loaded = $state(false);
	let placeholder = $state<string | undefined>(undefined);

	function markLoaded() {
		if (loaded) return;
		loaded = true;
		if (img) onload?.(img);
	}

	onMount(() => {
		if (img && img.complete && img.naturalWidth > 0) markLoaded();
		else if (thumbhash) placeholder = thumbhashUrl(thumbhash);
	});
</script>

<picture class="picture {className}" class:loaded style:background-color={color}>
	{#if placeholder && !loaded}
		<span class="placeholder" style:background-image="url({placeholder})" aria-hidden="true"></span>
	{/if}
	<source type="image/avif" srcset={srcsetString(expanded.avif, base)} {sizes} />
	<source type="image/webp" srcset={srcsetString(expanded.webp, base)} {sizes} />
	<img
		bind:this={img}
		src={base + expanded.jpeg}
		{alt}
		{width}
		{height}
		{loading}
		decoding={priority ? 'sync' : 'async'}
		fetchpriority={priority ? 'high' : 'auto'}
		{draggable}
		style:object-fit={fit}
		onload={markLoaded}
	/>
</picture>

<style>
	.picture {
		position: relative;
		display: block;
		overflow: hidden;
		width: 100%;
		height: 100%;
	}

	.placeholder {
		position: absolute;
		inset: 0;
		background-size: cover;
		background-position: center;
	}

	img {
		position: relative;
		display: block;
		width: 100%;
		height: 100%;
		opacity: 0;
		transition: opacity var(--dur-image) var(--ease-out);
	}

	.loaded img {
		opacity: 1;
	}
</style>
