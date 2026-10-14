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
			await run('Building the site', () => engine.build(site.root), { counts: false });
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
		<span class="url">{url || 'Building…'}</span>
		<button type="button" onclick={rebuild}>Rebuild</button>
		{#if url}<button type="button" class="ext" onclick={() => window.revelar.openExternal(url)}
				>Open in browser</button
			>{/if}
	</header>
	{#if error}<p class="error">{error}</p>{/if}
	{#if url}
		<div class="frame"><iframe src={url} title="Site preview"></iframe></div>
	{/if}
</section>

<style>
	.preview {
		display: flex;
		flex-direction: column;
		height: 100%;
		gap: 14px;
	}
	header {
		gap: 14px;
	}
	.url {
		font: 12px var(--f-mono);
		color: var(--muted);
		margin-right: auto;
		user-select: text;
	}
	/* The wrapper clips the site to the rounded corners and draws a hairline where the app ends;
	   rounding the iframe itself left ragged edges where its content met the border. */
	.frame {
		flex: 1;
		min-height: 0;
		border: 1px solid var(--line);
		border-radius: 16px;
		overflow: hidden;
		/* the page tone, so the anti-aliased corner of the clipped site blends in */
		background: var(--bg);
	}
	iframe {
		display: block;
		border: 0;
		width: 100%;
		height: 100%;
	}
</style>
