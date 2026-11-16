<script lang="ts">
	import AlbumPage from '#lib/components/AlbumPage.svelte';
	import PhotoShell from '#lib/components/PhotoShell.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<!-- During a client-side navigation to a route without album data, this component can
     receive the next page's data before it is torn down; render nothing then. -->
{#if data.kind === 'photo' && data.album}
	<PhotoShell
		album={data.album}
		photo={data.photo}
		index={data.index}
		hasMap={data.hasMap}
		site={data.site}
	/>
{:else if data.kind === 'album' && data.album}
	{#key data.album.slug}
		<AlbumPage
			album={data.album}
			photos={data.album.photos}
			site={data.site}
			hasMap={data.hasMap}
			inlineScript={data.inlineScript}
		/>
	{/key}
{/if}
