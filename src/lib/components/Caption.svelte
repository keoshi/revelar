<script lang="ts">
	import Icon from './Icon.svelte';

	let {
		title,
		caption,
		expandable = true
	}: { title?: string; caption?: string; expandable?: boolean } = $props();
	let expanded = $state(false);
	const long = $derived((caption?.length ?? 0) > 160);
</script>

{#if title || caption}
	<div class="caption" class:expanded>
		{#if title}<p class="title">{title}</p>{/if}
		{#if caption}
			<p class="text" id="viewer-caption">{caption}</p>
			{#if expandable && long}
				<button
					type="button"
					class="more"
					onclick={() => (expanded = !expanded)}
					aria-expanded={expanded}
					aria-controls="viewer-caption"
				>
					<span>{expanded ? 'Less' : 'More'}</span>
					<Icon name="chevron-down" size={14} />
				</button>
			{/if}
		{/if}
	</div>
{/if}

<style>
	.caption {
		max-width: min(640px, 70vw);
		color: #fff;
		font-size: var(--text-sm);
		line-height: 1.5;
		text-shadow: 0 1px 2px rgb(0 0 0 / 0.4);
	}

	.title {
		font-weight: 600;
	}

	.text {
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
		color: rgb(255 255 255 / 0.85);
	}

	.expanded .text {
		display: block;
		-webkit-line-clamp: unset;
		line-clamp: unset;
		max-height: 40vh;
		overflow: auto;
	}

	.more {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		margin-top: 4px;
		color: rgb(255 255 255 / 0.7);
		font-size: var(--text-xs);
	}

	.expanded .more :global(svg) {
		transform: rotate(180deg);
	}
</style>
