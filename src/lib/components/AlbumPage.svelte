<script lang="ts">
	import { albumHref, withBase } from '../utils/href.ts';
	import type { AlbumSummary } from '../types.ts';
	import type { SiteSettings } from '../config.ts';
	import { expandSources } from '../utils/sources.ts';
	import AlbumHeader from './AlbumHeader.svelte';
	import Grid from './Grid.svelte';

	type Props = {
		album: AlbumSummary;
		site: SiteSettings;
		hasMap: boolean;
		/** photo id to open in the viewer on load (deep link) */
		initialPhoto?: string;
	};

	let { album, site, hasMap, initialPhoto }: Props = $props();

	const current = $derived(
		initialPhoto ? album.photos.find((p) => p.id === initialPhoto) : undefined
	);
	const currentIndex = $derived(current ? album.photos.indexOf(current) : -1);

	const description = $derived(
		current?.caption ??
			album.description ??
			album.photos.find((p) => p.caption)?.caption ??
			site.description
	);
	const canonical = $derived(
		current ? `${site.baseUrl}/${album.slug}/${current.id}/` : `${site.baseUrl}/${album.slug}/`
	);
	const pageTitle = $derived(
		current ? `${current.title ?? `Photo ${currentIndex + 1}`} · ${album.title}` : album.title
	);
	const ogImage = $derived(expandSources((current ?? album.cover).sources).jpeg);
</script>

<svelte:head>
	<title>{pageTitle} · {site.title}</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={canonical} />
	{#if album.visibility === 'unlisted'}
		<meta name="robots" content="noindex" />
	{/if}
	<meta property="og:type" content="website" />
	<meta property="og:title" content={current ? pageTitle : album.title} />
	<meta property="og:description" content={description} />
	<meta property="og:url" content={canonical} />
	<meta property="og:image" content={site.baseUrl + ogImage} />
	<meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<section class="container album">
	<AlbumHeader
		title={album.title}
		date={album.date}
		dateRange={album.dateRange}
		descriptionHtml={album.descriptionHtml}
		count={album.count}
		language={site.language}
		albumDownload={album.albumDownload}
		mapHref={hasMap ? `${albumHref(album.slug)}map/` : undefined}
	/>
	<Grid photos={album.photos} albumSlug={album.slug} rowHeight={site.viewer.gridRowHeight} />
	{#if current}
		<!-- Plain markup for crawlers and no-JS visitors; the viewer replaces it once hydrated. -->
		<figure class="deep-link">
			<img
				src={withBase(ogImage)}
				alt={current.alt}
				width={current.width}
				height={current.height}
				loading="lazy"
			/>
			<figcaption>
				{#if current.title}<strong>{current.title}</strong>{/if}
				{#if current.caption}<span>{current.caption}</span>{/if}
			</figcaption>
		</figure>
	{/if}
</section>

<style>
	.album {
		padding-bottom: 48px;
	}

	.deep-link {
		margin: 32px 0 0;
	}

	.deep-link img {
		width: 100%;
		max-height: 80vh;
		object-fit: contain;
		background: var(--bg-stage);
	}

	.deep-link figcaption {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding-top: 12px;
		font-size: var(--text-sm);
		color: var(--text-muted);
	}
</style>
