<script lang="ts">
	import PhotoShell from '#lib/components/PhotoShell.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<!-- During a client-side navigation to a route without album data, this component can
     receive the next page's data before it is torn down; render nothing then. -->
{#if data.album}
	<PhotoShell
		album={data.album}
		photo={data.photo}
		index={data.index}
		hasMap={data.hasMap}
		site={data.site}
	/>
{/if}
