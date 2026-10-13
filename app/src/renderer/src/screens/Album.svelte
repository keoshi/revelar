<script lang="ts">
	import { onMount } from 'svelte';
	import type { AlbumDetail } from 'revelar';
	import { engine, run, siteUrl, type SiteState } from '../lib/engine.svelte.ts';

	type Props = { site: SiteState; slug: string; onBack: () => void };
	let { site, slug, onBack }: Props = $props();

	let album = $state<AlbumDetail | undefined>();
	let error = $state('');
	let saved = $state(false);
	let selected = $state<string | undefined>();

	// Album fields, mirrored from album.yaml (empty string = "use the default").
	let form = $state({
		title: '',
		description: '',
		date: '',
		visibility: 'public',
		sort: '',
		downloads: '',
		location: '',
		cover: ''
	});
	// Per-photo overrides keyed by file name.
	let photos = $state<Record<string, { title: string; caption: string }>>({});

	function load(detail: AlbumDetail) {
		album = detail;
		const s = detail.sidecar;
		form = {
			title: (s.title as string) ?? '',
			description: (s.description as string) ?? '',
			date: s.date ? String(s.date) : '',
			visibility: (s.visibility as string) ?? 'public',
			sort: (s.sort as string) ?? '',
			downloads: (s.downloads as string) ?? '',
			location: (s.location as string) ?? '',
			cover: (s.cover as string) ?? ''
		};
		const overrides = (s.photos ?? {}) as Record<string, { title?: string; caption?: string }>;
		photos = Object.fromEntries(
			detail.files.map((f) => [
				f.name,
				{ title: overrides[f.name]?.title ?? '', caption: overrides[f.name]?.caption ?? '' }
			])
		);
	}

	onMount(async () => {
		try {
			load(await engine.album(site.root, slug));
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	});

	async function save() {
		error = '';
		try {
			const patch: Record<string, unknown> = {
				...form,
				visibility: form.visibility === 'public' ? undefined : form.visibility,
				photos: Object.fromEntries(
					Object.entries(photos).map(([file, o]) => [
						file,
						{ title: o.title || undefined, caption: o.caption || undefined }
					])
				)
			};
			load(await engine.saveAlbum(site.root, slug, patch));
			saved = true;
			setTimeout(() => (saved = false), 1500);
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	}

	async function process() {
		await save();
		await run('Processing photos', () => engine.ingest(site.root));
		load(await engine.album(site.root, slug));
	}

	const thumb = (file: string) =>
		album?.built?.photos.find((p) => p.file === file)?.thumbUrl ??
		album?.files.find((f) => f.name === file)?.thumbUrl;
	const builtPhoto = (file: string) => album?.built?.photos.find((p) => p.file === file);
</script>

<section>
	<p><button type="button" class="link" onclick={onBack}>← Library</button></p>
	{#if error}<p class="error">{error}</p>{/if}
	{#if album}
		<header class="head">
			<div>
				<h1>{form.title || album.slug}</h1>
				<p class="muted small">photos/{album.folder} · {album.files.length} photos</p>
			</div>
			<div class="row">
				<button type="button" class:saved onclick={save}>{saved ? 'Saved' : 'Save'}</button>
				<button type="button" class="primary" onclick={process}>Save and process</button>
			</div>
		</header>

		<div class="layout">
			<div class="form">
				<div class="field">
					<label for="title">Title</label><input
						id="title"
						bind:value={form.title}
						placeholder={album.slug}
					/>
				</div>
				<div class="field">
					<label for="desc">Description (Markdown)</label><textarea
						id="desc"
						bind:value={form.description}></textarea>
				</div>
				<div class="field">
					<label for="date">Date</label><input
						id="date"
						bind:value={form.date}
						placeholder="YYYY-MM-DD (from the folder name or the photos if empty)"
					/>
				</div>
				<div class="field">
					<label for="vis">Visibility</label>
					<select id="vis" bind:value={form.visibility}>
						<option value="public">Public (listed)</option>
						<option value="unlisted">Unlisted (only with the link)</option>
					</select>
				</div>
				<div class="field">
					<label for="sort">Order</label>
					<select id="sort" bind:value={form.sort}>
						<option value="">Site default</option>
						<option value="date-asc">Oldest first</option>
						<option value="date-desc">Newest first</option>
						<option value="filename">File name</option>
					</select>
				</div>
				<div class="field">
					<label for="dl">Downloads</label>
					<select id="dl" bind:value={form.downloads}>
						<option value="">Site default</option>
						<option value="none">Off</option>
						<option value="large">Large JPEG</option>
						<option value="original">Original files</option>
					</select>
				</div>
				<div class="field">
					<label for="loc">Locations on the map</label>
					<select id="loc" bind:value={form.location}>
						<option value="">Site default</option>
						<option value="show">Exact</option>
						<option value="approximate">Approximate (about 1 km)</option>
						<option value="hide">Hidden</option>
					</select>
				</div>
				<p class="muted small hint">
					"Site default" follows the site settings (site menu, top right).
				</p>
			</div>

			<div class="photos">
				{#if !album.built}
					<p class="muted">
						Not processed yet: these are quick previews. Titles and captions can be edited now.
					</p>
				{/if}
				<div class="thumbs">
					{#each album.files as file (file.name)}
						{@const t = thumb(file.name)}
						<button
							type="button"
							class="thumb"
							class:selected={selected === file.name}
							class:cover={form.cover === file.name}
							onclick={() => (selected = file.name)}
							title={file.name}
						>
							{#if t}<img
									src={siteUrl(t)}
									alt=""
									loading="lazy"
									style:background={builtPhoto(file.name)?.color}
								/>{:else}<span class="ph">{file.name}</span>{/if}
							{#if form.cover === file.name}<span class="badge">cover</span>{/if}
						</button>
					{/each}
				</div>
				{#if selected}
					<div class="photo-form">
						<div class="row between">
							<strong>{selected}</strong>
							<button
								type="button"
								class="link"
								onclick={() => (form.cover = form.cover === selected ? '' : selected!)}
								>{form.cover === selected ? 'Unset cover' : 'Use as cover'}</button
							>
						</div>
						<div class="field">
							<label for="ptitle">Title</label><input
								id="ptitle"
								bind:value={photos[selected].title}
								placeholder={builtPhoto(selected)?.title ?? ''}
							/>
						</div>
						<div class="field">
							<label for="pcap">Caption</label><textarea
								id="pcap"
								bind:value={photos[selected].caption}
								placeholder={builtPhoto(selected)?.caption ?? ''}></textarea>
						</div>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</section>

<style>
	.head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin: 8px 0 20px;
	}
	.layout {
		display: grid;
		grid-template-columns: 320px 1fr;
		gap: 32px;
	}
	.thumbs {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
		gap: 8px;
	}
	.thumb {
		animation: rise 360ms var(--ease) both;
		transition: border-color 160ms var(--ease);
		position: relative;
		padding: 0;
		border: 2px solid transparent;
		background: var(--surface-2);
		aspect-ratio: 1;
		overflow: hidden;
	}
	.thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.thumb.selected {
		border-color: var(--accent);
	}
	.thumb .ph {
		font-size: 11px;
		color: var(--text-muted);
		word-break: break-all;
		padding: 6px;
	}
	.badge {
		position: absolute;
		left: 6px;
		bottom: 6px;
		font-size: 11px;
		padding: 1px 6px;
		border-radius: 999px;
		background: var(--accent);
		color: #1a1200;
	}
	.photo-form {
		margin-top: 16px;
		padding: 14px;
		background: var(--surface);
		border-radius: var(--radius);
	}
	.between {
		justify-content: space-between;
		margin-bottom: 10px;
	}
</style>
