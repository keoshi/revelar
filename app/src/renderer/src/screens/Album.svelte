<script lang="ts">
	import { onMount } from 'svelte';
	import { flip } from 'svelte/animate';
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
	let photos = $state<Record<string, { title: string; caption: string; hidden: boolean }>>({});
	// File names in display order; dragging rewrites it and switches the album to a custom order.
	let order = $state<string[]>([]);
	let savedOrder = '';
	let dragging = $state<string | undefined>();

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
		const overrides = (s.photos ?? {}) as Record<
			string,
			{ title?: string; caption?: string; hidden?: boolean }
		>;
		photos = Object.fromEntries(
			detail.files.map((f) => [
				f.name,
				{
					title: overrides[f.name]?.title ?? '',
					caption: overrides[f.name]?.caption ?? '',
					hidden: overrides[f.name]?.hidden ?? false
				}
			])
		);
		const names = detail.files.map((f) => f.name);
		const listed =
			(s.sort === 'manual' ? ((s.order as string[] | undefined) ?? []) : undefined) ??
			detail.built?.photos.map((p) => p.file) ??
			[];
		const known = listed.filter((n) => names.includes(n));
		order = [...known, ...names.filter((n) => !known.includes(n))];
		savedOrder = order.join('\n');
		if (selected && !names.includes(selected)) selected = undefined;
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
				order: form.sort === 'manual' ? $state.snapshot(order) : undefined,
				photos: Object.fromEntries(
					Object.entries(photos).map(([file, o]) => [
						file,
						{
							title: o.title || undefined,
							caption: o.caption || undefined,
							hidden: o.hidden || undefined
						}
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

	// ---- drag to reorder: the list reorders live under the pointer, flip animates the rest ----
	function dragStart(e: DragEvent, name: string) {
		dragging = name;
		selected = name;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', name);
		}
	}
	function dragOver(e: DragEvent, name: string) {
		e.preventDefault();
		if (!dragging || dragging === name) return;
		const from = order.indexOf(dragging);
		const to = order.indexOf(name);
		if (from < 0 || to < 0) return;
		const next = [...order];
		next.splice(from, 1);
		next.splice(to, 0, dragging);
		order = next;
	}
	function dragEnd() {
		if (dragging && order.join('\n') !== savedOrder) form.sort = 'manual';
		dragging = undefined;
	}

	const files = $derived(new Map((album?.files ?? []).map((f) => [f.name, f])));
	const ordered = $derived(order.map((n) => files.get(n)).filter((f) => f !== undefined));
	const thumb = (file: string) =>
		album?.built?.photos.find((p) => p.file === file)?.thumbUrl ?? files.get(file)?.thumbUrl;
	const builtPhoto = (file: string) => album?.built?.photos.find((p) => p.file === file);
	const position = $derived(selected ? order.indexOf(selected) + 1 : 0);
</script>

<section class="album">
	{#if error}<p class="error">{error}</p>{/if}
	{#if album}
		<header class="head">
			<div>
				<button type="button" class="link back" onclick={onBack}>← Library</button>
				<h1>{form.title || album.title}</h1>
				<p class="muted small">photos/{album.folder} · {album.files.length} photos</p>
			</div>
			<div class="row">
				<button type="button" class:saved onclick={save}>{saved ? 'Saved' : 'Save'}</button>
				<button type="button" class="primary" onclick={process}>Save and process</button>
			</div>
		</header>

		<div class="panes">
			<aside class="pane form">
				<div class="field">
					<label for="title">Title</label><input
						id="title"
						bind:value={form.title}
						placeholder={album.title}
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
						placeholder="YYYY-MM-DD (from the folder or the photos)"
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
						<option value="manual">Custom (drag photos to arrange)</option>
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
			</aside>

			<div class="pane photos">
				<p class="muted small lead">
					{#if !album.built}
						Not processed yet: quick previews for now.
					{/if}
					{#if ordered.length > 1}
						Drag photos to arrange them{form.sort === 'manual' ? ' (custom order)' : ''}.
					{/if}
				</p>
				<div class="thumbs">
					{#each ordered as file, i (file.name)}
						{@const t = thumb(file.name)}
						<button
							type="button"
							class="thumb"
							class:selected={selected === file.name}
							class:dragging={dragging === file.name}
							class:hidden={photos[file.name]?.hidden}
							style:animation-delay="{Math.min(i, 24) * 14}ms"
							draggable="true"
							ondragstart={(e) => dragStart(e, file.name)}
							ondragover={(e) => dragOver(e, file.name)}
							ondrop={(e) => e.preventDefault()}
							ondragend={dragEnd}
							onclick={() => (selected = file.name)}
							title={file.name}
							animate:flip={{ duration: 220 }}
						>
							{#if t}<img
									src={siteUrl(t)}
									alt=""
									loading="lazy"
									draggable="false"
									style:background={builtPhoto(file.name)?.color}
								/>{:else}<span class="ph">{file.name}</span>{/if}
							{#if form.cover === file.name}<span class="badge">cover</span>{/if}
							{#if photos[file.name]?.hidden}<span class="badge off">hidden</span>{/if}
						</button>
					{/each}
				</div>
			</div>

			<aside class="pane detail">
				{#if selected && photos[selected]}
					{#key selected}
						<div class="detail-inner rise">
							{#if thumb(selected)}
								<img
									class="big"
									src={siteUrl(thumb(selected)!)}
									alt=""
									style:background={builtPhoto(selected)?.color}
								/>
							{/if}
							<p class="muted small file">
								{position} of {ordered.length} · <span class="name">{selected}</span>
							</p>
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
							<button
								type="button"
								class:primary={form.cover !== selected}
								onclick={() => (form.cover = form.cover === selected ? '' : selected!)}
								>{form.cover === selected ? 'Cover photo · unset' : 'Use as cover'}</button
							>
							<label class="check"
								><input type="checkbox" bind:checked={photos[selected].hidden} /> Hide from the album</label
							>
						</div>
					{/key}
				{:else}
					<p class="muted empty">
						Select a photo to give it a title and caption, or make it the cover.
					</p>
				{/if}
			</aside>
		</div>
	{/if}
</section>

<style>
	.album {
		height: 100%;
		display: flex;
		flex-direction: column;
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		margin: 0 0 16px;
	}
	.back {
		padding-left: 0;
		margin-bottom: 2px;
	}
	.panes {
		flex: 1;
		min-height: 0;
		display: grid;
		grid-template-columns: 250px minmax(0, 1fr) 250px;
		gap: 24px;
	}
	.pane {
		min-height: 0;
		overflow: auto;
		scrollbar-width: thin;
	}
	.form {
		padding-right: 4px;
	}
	.lead {
		margin-bottom: 10px;
		min-height: 18px;
	}
	.thumbs {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
		gap: 8px;
		padding-bottom: 8px;
	}
	.thumb {
		animation: rise 360ms var(--ease) both;
		transition:
			border-color 160ms var(--ease),
			opacity 160ms var(--ease);
		position: relative;
		padding: 0;
		border: 2px solid transparent;
		background: var(--surface-2);
		aspect-ratio: 1;
		overflow: hidden;
		cursor: grab;
	}
	.thumb:active {
		cursor: grabbing;
		transform: none;
	}
	.thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
		pointer-events: none;
	}
	.thumb.selected {
		border-color: var(--accent);
	}
	.thumb.dragging {
		opacity: 0.35;
	}
	.thumb.hidden img {
		opacity: 0.4;
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
	.badge.off {
		left: auto;
		right: 6px;
		background: rgb(0 0 0 / 0.6);
		color: #fff;
	}
	.detail {
		padding: 14px;
		background: var(--surface);
		border-radius: var(--radius);
		align-self: start;
		max-height: 100%;
	}
	.detail-inner {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.detail .field {
		margin: 0;
	}
	.big {
		width: 100%;
		max-height: 180px;
		object-fit: contain;
		border-radius: 4px;
		background: var(--surface-2);
	}
	.file {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.name {
		user-select: text;
	}
	.check {
		display: flex;
		gap: 8px;
		align-items: center;
		color: var(--text);
		font-size: 13px;
	}
	.check input {
		width: auto;
		margin: 0;
	}
	.empty {
		font-size: 13px;
	}
	@media (max-width: 1100px) {
		.panes {
			grid-template-columns: 220px minmax(0, 1fr) 220px;
			gap: 16px;
		}
	}
</style>
