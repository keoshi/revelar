<script lang="ts">
	import AlbumMapPage from '#lib/components/AlbumMapPage.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<AlbumMapPage {data} />
