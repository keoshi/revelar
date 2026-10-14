<script lang="ts">
	// The brand mark from ../art/mark.svg, sized by height and coloured by `color`.
	import mark from '../art/mark.svg?raw';
	let { height = 18, label = '' }: { height?: number; label?: string } = $props();
</script>

<span
	class="mark"
	style:height="{height}px"
	role={label ? 'img' : undefined}
	aria-label={label || undefined}
	aria-hidden={label ? undefined : 'true'}
>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- a bundled SVG file, not user content -->
	{@html mark}
</span>

<style>
	.mark {
		display: inline-flex;
		flex: none;
		line-height: 0;
	}
	.mark :global(svg) {
		height: 100%;
		width: auto;
		display: block;
	}
</style>
