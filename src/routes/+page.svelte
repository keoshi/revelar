<script lang="ts">
	import AlbumCover from '#lib/components/AlbumCover.svelte';
	import { withBase } from '#lib/utils/href.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{data.site.title}</title>
	<meta name="description" content={data.site.description} />
	<link rel="canonical" href="{data.site.baseUrl}/" />
	<meta property="og:title" content={data.site.title} />
	<meta property="og:description" content={data.site.description} />
	{#if data.albums[0]}
		<meta
			property="og:image"
			content={data.site.baseUrl +
				('base' in data.albums[0].cover.sources
					? `${data.albums[0].cover.sources.base}-${data.albums[0].cover.sources.jpegWidth}.jpg`
					: data.albums[0].cover.sources.jpeg)}
		/>
	{/if}
</svelte:head>

<section class="container home">
	{#if data.site.introHtml}
		<!-- eslint-disable-next-line svelte/no-at-html-tags -- Markdown authored by the site owner, rendered at build -->
		<div class="prose intro">{@html data.site.introHtml}</div>
	{/if}

	{#if data.albums.length === 0}
		<div class="empty">
			<h1>No albums yet</h1>
			<p>
				Drop a folder of photos into <code>photos/</code> and run <code>npm run build</code>. Every
				subfolder becomes an album.
			</p>
		</div>
	{:else}
		<h1 class="visually-hidden">Albums</h1>
		{#if data.hasGlobalMap}
			<p class="global-map"><a href={withBase('/map/')}>Map of all photos →</a></p>
		{/if}
		<ul class="covers">
			{#each data.albums as album, i (album.slug)}
				<li><AlbumCover {album} language={data.site.language} priority={i < 3} /></li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.home {
		padding-block: 16px 48px;
	}

	.intro {
		margin-bottom: 32px;
	}

	.global-map {
		margin-bottom: 24px;
		font-size: var(--text-sm);
		color: var(--text-muted);
	}

	.covers {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: 1fr;
		gap: 32px 24px;
	}

	@media (min-width: 640px) {
		.covers {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	@media (min-width: 1100px) {
		.covers {
			grid-template-columns: repeat(3, 1fr);
		}
	}

	.empty {
		padding-block: 96px;
		text-align: center;
		color: var(--text-muted);
	}

	.empty h1 {
		font-size: var(--text-xl);
		font-weight: 600;
		letter-spacing: -0.02em;
		color: var(--text);
		margin-bottom: 12px;
	}

	code {
		font-family: ui-monospace, Menlo, monospace;
		font-size: 0.9em;
		color: var(--text);
	}
</style>
