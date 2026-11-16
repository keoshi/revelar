<script lang="ts">
	import { onMount } from 'svelte';
	import AlbumPage from './AlbumPage.svelte';
	import { albumJsonHref } from '../utils/href.ts';
	import type { AlbumMeta, Photo } from '../types.ts';
	import type { SiteSettings } from '../config.ts';

	// A photo page is a thin shell, wherever it is served (its album's folder, or the root of a
	// single-album site).
	type Props = {
		album: AlbumMeta;
		photo: Photo;
		index: number;
		hasMap: boolean;
		site: SiteSettings;
	};
	let { album, photo, index, hasMap, site }: Props = $props();

	// The page renders this photo straight away; the rest of the album arrives from album.json
	// and the grid and viewer appear once it has.
	const albumJson = $derived(albumJsonHref(album.slug));
	let photos = $state<Photo[] | undefined>();
	let failed = $state(false);

	onMount(async () => {
		try {
			const res = await fetch(albumJson);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			photos = ((await res.json()) as { photos: Photo[] }).photos;
		} catch {
			failed = true;
		}
	});
</script>

<svelte:head>
	<link rel="preload" href={albumJson} as="fetch" crossorigin="anonymous" />
</svelte:head>

{#key album.slug}
	<AlbumPage
		{album}
		{photos}
		deepLink={{ photo, index, failed }}
		initialPhoto={photo.id}
		{site}
		{hasMap}
	/>
{/key}
