<script lang="ts">
	import { onMount } from 'svelte';
	import AlbumPage from '#lib/components/AlbumPage.svelte';
	import { withBase } from '#lib/utils/href.ts';
	import type { Photo } from '#lib/types.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// The page renders this photo straight away; the rest of the album arrives from album.json
	// and the grid and viewer appear once it has.
	const albumJson = $derived(withBase(`/${data.album.slug}/album.json`));
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

<!-- During a client-side navigation to a route without album data, this component can
     receive the next page's data before it is torn down; render nothing then. -->
{#if data.album}
	{#key data.album.slug}
		<AlbumPage
			album={data.album}
			{photos}
			deepLink={{ photo: data.photo, index: data.index, failed }}
			initialPhoto={data.photo.id}
			site={data.site}
			hasMap={data.hasMap}
		/>
	{/key}
{/if}
