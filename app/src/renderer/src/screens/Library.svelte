<script lang="ts">
	import { engine, run, siteUrl, type SiteState } from '../lib/engine.svelte.ts';

	type Props = {
		site: SiteState;
		onOpenAlbum: (slug: string) => void;
		onChanged: () => Promise<void>;
		onPreview: () => void;
	};
	let { site, onOpenAlbum, onChanged, onPreview }: Props = $props();
	let error = $state('');

	const pending = $derived(site.albums.filter((a) => !a.built || a.built.count !== a.files).length);

	async function addAlbum() {
		const source = await window.revelar.pickFolder('Choose a folder of photos to add as an album');
		if (!source) return;
		error = '';
		try {
			await run('Copying photos', () => engine.addAlbum(site.root, source));
			await onChanged();
			await process();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	}

	async function process(force = false) {
		error = '';
		try {
			const report = await run('Processing photos', () => engine.ingest(site.root, force));
			if (report.errors.length) error = report.errors.join('\n');
			await onChanged();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	}

	const cover = (a: SiteState['albums'][number]) => a.built?.coverUrl ?? a.preview?.coverUrl;
</script>

<section>
	<header class="head">
		<div>
			<h1>{site.config.site.title}</h1>
			<p class="muted small">
				{site.albums.length}
				{site.albums.length === 1 ? 'album' : 'albums'} ·
				{#if pending}{pending} to process{:else}everything processed{/if}
			</p>
		</div>
		<div class="row">
			{#if pending}
				<button type="button" onclick={() => process()}
					>Process {pending} {pending === 1 ? 'album' : 'albums'}</button
				>
			{/if}
			<button type="button" onclick={addAlbum}>Add album…</button>
			<button type="button" class="primary" onclick={onPreview}>Preview site</button>
		</div>
	</header>
	{#if error}<p class="error">{error}</p>{/if}

	{#if site.albums.length === 0}
		<div class="empty rise">
			<p>No albums yet.</p>
			<p class="muted">
				Add a folder of photos, or drop folders into <code>{site.root}/photos</code>. They appear
				here as soon as they land.
			</p>
		</div>
	{:else}
		<div class="grid">
			{#each site.albums as album, i (album.slug)}
				<button
					type="button"
					class="card rise"
					style:animation-delay="{Math.min(i, 12) * 40}ms"
					onclick={() => onOpenAlbum(album.slug)}
				>
					<div class="cover" style:background={album.built?.coverColor ?? 'var(--surface-2)'}>
						{#if cover(album)}<img src={siteUrl(cover(album)!)} alt="" loading="lazy" />{/if}
						{#if !album.built || album.built.count !== album.files}<span class="badge"
								>not processed</span
							>{/if}
						{#if album.visibility !== 'public'}<span class="badge vis">{album.visibility}</span
							>{/if}
					</div>
					<div class="meta">
						<strong>{album.title}</strong>
						<span class="muted small"
							>{album.date ?? ''}{album.date ? ' · ' : ''}{album.files} photos</span
						>
					</div>
				</button>
			{/each}
		</div>
	{/if}
</section>

<style>
	.head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 16px;
		margin-bottom: 20px;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 16px;
	}
	.card {
		padding: 0;
		background: none;
		border: 0;
		text-align: left;
		border-radius: var(--radius);
		overflow: hidden;
	}
	.cover {
		position: relative;
		aspect-ratio: 3 / 2;
		border-radius: var(--radius);
		overflow: hidden;
		transition:
			transform 220ms var(--ease),
			box-shadow 220ms var(--ease);
	}
	.card:hover .cover {
		transform: translateY(-2px);
		box-shadow: 0 10px 24px rgb(0 0 0 / 0.4);
	}
	.card:focus-visible {
		outline: none;
	}
	.card:focus-visible .cover {
		outline: 2px solid var(--accent);
	}
	.cover img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
		transition: transform 600ms var(--ease);
	}
	.card:hover .cover img {
		transform: scale(1.03);
	}
	.badge {
		position: absolute;
		left: 8px;
		bottom: 8px;
		font-size: 11px;
		padding: 2px 7px;
		border-radius: 999px;
		background: rgb(0 0 0 / 0.6);
		color: #fff;
		backdrop-filter: blur(6px);
	}
	.badge.vis {
		left: auto;
		right: 8px;
	}
	.meta {
		display: flex;
		flex-direction: column;
		padding: 8px 2px;
	}
	.empty {
		padding: 48px;
		text-align: center;
		border: 1px dashed var(--hairline);
		border-radius: var(--radius);
	}
	code {
		user-select: text;
	}
</style>
