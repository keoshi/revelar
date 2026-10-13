<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { engine, run, type SiteState } from '../lib/engine.svelte.ts';

	type Props = { site: SiteState };
	let { site }: Props = $props();
	let url = $state('');
	let error = $state('');

	async function rebuild() {
		error = '';
		try {
			await run('Processing photos', () => engine.ingest(site.root));
			await run('Building the site', () => engine.build(site.root));
			const res = await engine.previewStart(site.root);
			url = `${res.url.replace(/\/$/, '')}${basePath()}/`;
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	}

	function basePath(): string {
		try {
			return new URL(site.config.site.baseUrl).pathname.replace(/\/$/, '');
		} catch {
			return '';
		}
	}

	onMount(rebuild);
	onDestroy(() => void engine.previewStop());
</script>

<section class="preview">
	<header class="row">
		<h1>Preview</h1>
		<span class="muted small">{url || 'Building…'}</span>
		<button type="button" onclick={rebuild}>Rebuild</button>
		{#if url}<button type="button" onclick={() => window.revelar.openExternal(url)}
				>Open in browser</button
			>{/if}
	</header>
	{#if error}<p class="error">{error}</p>{/if}
	{#if url}
		<iframe src={url} title="Site preview"></iframe>
	{/if}
</section>

<style>
	.preview {
		display: flex;
		flex-direction: column;
		height: 100%;
		gap: 12px;
	}
	header {
		gap: 14px;
	}
	iframe {
		flex: 1;
		border: 1px solid var(--hairline);
		border-radius: var(--radius);
		background: #fff;
		width: 100%;
	}
</style>
