<script lang="ts">
	import MapView, { type MapPhoto } from '#lib/components/MapView.svelte';
	import { photoHref } from '#lib/utils/href.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const photos = $derived<MapPhoto[]>(
		data.photos.map((p) => ({ ...p, href: photoHref(p.album, p.id) }))
	);
</script>

<svelte:head>
	<title>Map · {data.site.title}</title>
	<meta name="description" content="Where the photographs were taken" />
	<link rel="canonical" href="{data.site.baseUrl}/map/" />
</svelte:head>

<section class="container map-page">
	<header class="map-head">
		<h1>Map</h1>
		<p class="meta">{photos.length} {photos.length === 1 ? 'photo' : 'photos'} with a location</p>
	</header>
	<MapView
		{photos}
		bounds={data.bounds}
		styleLight={data.site.map.styleLight}
		styleDark={data.site.map.styleDark}
		onSelect={(p) => window.location.assign(p.href)}
	/>
	<h2 class="list-title">Photos on this map</h2>
	<ul class="locations">
		{#each data.photos as photo (photo.id)}
			<li>
				<a href={photoHref(photo.album, photo.id)}>{photo.title ?? photo.alt}</a>
				<span class="muted">· {photo.albumTitle}</span>
			</li>
		{/each}
	</ul>
</section>

<style>
	.map-page {
		padding-block: 8px 48px;
	}
	.map-head {
		padding-block: 8px 16px;
	}
	h1 {
		font-size: var(--text-xl);
		font-weight: 600;
		letter-spacing: -0.02em;
	}
	.meta,
	.muted {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}
	.list-title {
		margin-top: 24px;
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.locations {
		list-style: none;
		padding: 0;
		margin: 12px 0 0;
		display: grid;
		gap: 8px;
		font-size: var(--text-sm);
	}
</style>
