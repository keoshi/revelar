<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import MapView, { type MapPhoto } from '#lib/components/MapView.svelte';
	import { albumHref, photoHref } from '#lib/utils/href.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const photos = $derived<MapPhoto[]>(
		data.photos.map((p) => ({ ...p, href: photoHref(data.slug, p.id) }))
	);

	// `#photo=<id>` (from the info panel's mini map) opens the map on that photo.
	let focus = $state<{ lng: number; lat: number } | undefined>();
	onMount(() => {
		const id = new URLSearchParams(window.location.hash.slice(1)).get('photo');
		const photo = id ? photos.find((p) => p.id === id) : undefined;
		if (photo) focus = { lng: photo.gps.lng, lat: photo.gps.lat };
	});
</script>

<svelte:head>
	<title>Map · {data.title} · {data.site.title}</title>
	<meta name="description" content="Where the photos in {data.title} were taken" />
	{#if data.visibility === 'unlisted'}<meta name="robots" content="noindex" />{/if}
</svelte:head>

<section class="container map-page">
	<header class="map-head">
		<p class="back"><a href={albumHref(data.slug)}>← {data.title}</a></p>
		<h1>Map</h1>
		<p class="meta">{photos.length} {photos.length === 1 ? 'photo' : 'photos'} with a location</p>
	</header>
	<MapView
		{photos}
		bounds={data.bounds}
		styleLight={data.site.map.styleLight}
		styleDark={data.site.map.styleDark}
		{focus}
		onSelect={(p) => goto(p.href as `/${string}`)}
	/>
	<h2 class="list-title">Photos on this map</h2>
	<ul class="locations">
		{#each photos as photo (photo.id)}
			<li>
				<a href={photo.href}>{photo.title ?? photo.alt}</a>
				<span class="tabular coords"
					>{photo.gps.lat}, {photo.gps.lng}{photo.gps.precision === 'approximate'
						? ' (approximate)'
						: ''}</span
				>
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
		margin-top: 4px;
	}
	.back,
	.meta {
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
	.coords {
		margin-left: 12px;
		color: var(--text-muted);
	}
</style>
