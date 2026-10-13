<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{data.site.title}</title>
	<meta name="description" content={data.site.description} />
</svelte:head>

<section class="container home">
	{#if data.site.introHtml}
		<!-- eslint-disable-next-line svelte/no-at-html-tags -- Markdown authored by the site owner, rendered at build -->
		<div class="prose intro">{@html data.site.introHtml}</div>
	{/if}

	{#if data.albums.length === 0}
		<div class="empty">
			<h1>No albums yet</h1>
			<p>
				Drop a folder of photos into <code>photos/</code> and run <code>npm run build</code>. Every
				subfolder becomes an album.
			</p>
		</div>
	{:else}
		<ul class="covers">
			{#each data.albums as album (album.slug)}
				<li>{album.title}</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.home {
		padding-block: 16px 48px;
	}

	.intro {
		margin-bottom: 32px;
	}

	.empty {
		padding-block: 96px;
		text-align: center;
		color: var(--text-muted);
	}

	.empty h1 {
		font-family: var(--font-titles);
		font-size: var(--text-xl);
		font-weight: 500;
		color: var(--text);
		margin-bottom: 12px;
	}

	code {
		font-family: ui-monospace, Menlo, monospace;
		font-size: 0.9em;
		color: var(--text);
	}
</style>
