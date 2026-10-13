<script lang="ts">
	import AlbumPage from '#lib/components/AlbumPage.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

{#key data.album.slug}
	<AlbumPage
		album={data.album}
		site={data.site}
		hasMap={data.hasMap}
		inlineScript={data.inlineScript}
		initialPhoto={data.photoId}
	/>
{/key}
