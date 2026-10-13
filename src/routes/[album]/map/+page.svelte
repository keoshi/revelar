<script lang="ts">
	import { albumHref, photoHref } from '#lib/utils/href.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Map · {data.title} · {data.site.title}</title>
	{#if data.visibility === 'unlisted'}<meta name="robots" content="noindex" />{/if}
</svelte:head>

<section class="container map-page">
	<p class="back"><a href={albumHref(data.slug)}>← {data.title}</a></p>
	<h1>Map</h1>
	<ul class="locations">
		{#each data.photos as photo (photo.id)}
			<li>
				<a href={photoHref(data.slug, photo.id)}>{photo.title ?? photo.alt}</a>
				<span class="tabular coords"
					>{photo.gps.lat}, {photo.gps.lng}{photo.gps.precision === 'approximate'
						? ' (approx.)'
						: ''}</span
				>
			</li>
		{/each}
	</ul>
</section>

<style>
	.map-page {
		padding-block: 16px 48px;
	}
	h1 {
		font-family: var(--font-titles);
		font-size: var(--text-xl);
		font-weight: 500;
		margin-block: 8px 16px;
	}
	.back {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}
	.locations {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 8px;
	}
	.coords {
		margin-left: 12px;
		color: var(--text-muted);
		font-size: var(--text-sm);
	}
</style>
