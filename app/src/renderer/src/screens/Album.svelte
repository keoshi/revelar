<script lang="ts">
	import { onMount } from 'svelte';
	import { flip } from 'svelte/animate';
	import type { AlbumDetail } from 'revelar';
	import { engine, run, siteUrl, type SiteState } from '../lib/engine.svelte.ts';
	import Seg from '../lib/Seg.svelte';
	import { toast } from '../lib/toast.svelte.ts';

	const VISIBILITIES = [
		{ value: 'public', label: 'Public' },
		{ value: 'unlisted', label: 'Unlisted' }
	];

	type Props = { site: SiteState; slug: string; onBack: () => void };
	let { site, slug, onBack }: Props = $props();

	let album = $state<AlbumDetail | undefined>();
	let error = $state('');
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
		if (s.sort === 'manual') {
			const listed = ((s.order as string[] | undefined) ?? []).filter((n) => names.includes(n));
			order = [...listed, ...names.filter((n) => !listed.includes(n))];
		} else order = arranged(form.sort, names, detail);
		savedOrder = order.join('\n');
		if (selected && !names.includes(selected)) selected = undefined;
	}

	/**
	 * The grid's order for a non-manual sort, worked out here so the editor reflects the choice
	 * at once rather than after the next processing. Dates are known for processed photos; before
	 * that, date orders fall back to file names.
	 */
	function arranged(sort: string, names: string[], detail: AlbumDetail): string[] {
		const effective = sort || site.config.defaults.sort;
		const byName = (a: string, b: string) =>
			a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
		const dates = new Map(detail.built?.photos.map((p) => [p.file, p.date ?? '']) ?? []);
		const byDate = (a: string, b: string) =>
			(dates.get(a) ?? '').localeCompare(dates.get(b) ?? '') || byName(a, b);
		const sorted = [...names];
		if (effective === 'date-desc') return sorted.sort((a, b) => byDate(b, a) || byName(a, b));
		if (effective === 'date-asc') return sorted.sort(byDate);
		return sorted.sort(byName);
	}

	/** Changing the order setting rearranges the grid; "custom" keeps whatever is showing. */
	function sortChanged() {
		if (!album || form.sort === 'manual') return;
		order = arranged(
			form.sort,
			album.files.map((f) => f.name),
			album
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
			toast('Saved');
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	}

	async function process() {
		await save();
		await run('Processing photos', () => engine.ingest(site.root));
		load(await engine.album(site.root, slug));
	}

	// ---- drag to arrange ---------------------------------------------------------------------
	// Pointer-based rather than HTML5 drag and drop: the pressed thumbnail lifts and follows the
	// pointer as a ghost, its cell stays behind as a placeholder, and the target is the grid slot
	// under the pointer. Slots are measured once when the drag starts (the grid is uniform, so
	// slot i keeps its rectangle whatever the order), which makes the live reordering settle
	// instead of flickering, with `flip` sliding the others out of the way.
	type Drag = { name: string; x: number; y: number; w: number; h: number; ox: number; oy: number };
	let drag = $state<Drag | undefined>();
	let pressed: { name: string; x: number; y: number; el: HTMLElement } | undefined;
	let slots: { x: number; y: number; w: number; h: number }[] = [];
	let grid: HTMLElement | undefined = $state();
	let pane: HTMLElement | undefined = $state();
	let startScroll = 0;
	let pointer = { x: 0, y: 0 };
	let scrollLoop: number | undefined;
	const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
	const flipMs = reduceMotion ? 0 : 200;

	function pointerDown(e: PointerEvent, name: string) {
		if (e.button !== 0) return;
		const el = e.currentTarget as HTMLElement;
		pressed = { name, x: e.clientX, y: e.clientY, el };
		el.setPointerCapture(e.pointerId);
	}
	function pointerMove(e: PointerEvent) {
		if (!pressed) return;
		pointer = { x: e.clientX, y: e.clientY };
		if (!drag) {
			if (Math.hypot(e.clientX - pressed.x, e.clientY - pressed.y) < 5 || !grid || !pane) return;
			const r = pressed.el.getBoundingClientRect();
			slots = [...grid.children].map((c) => {
				const b = c.getBoundingClientRect();
				return { x: b.left, y: b.top, w: b.width, h: b.height };
			});
			startScroll = pane.scrollTop;
			selected = pressed.name;
			drag = {
				name: pressed.name,
				x: r.left,
				y: r.top,
				w: r.width,
				h: r.height,
				ox: e.clientX - r.left,
				oy: e.clientY - r.top
			};
			scrollLoop = requestAnimationFrame(autoScroll);
		}
		drag.x = e.clientX - drag.ox;
		drag.y = e.clientY - drag.oy;
		settle();
	}
	function pointerUp() {
		if (drag && order.join('\n') !== savedOrder) form.sort = 'manual';
		if (!drag && pressed) selected = pressed.name;
		if (scrollLoop) cancelAnimationFrame(scrollLoop);
		scrollLoop = undefined;
		drag = undefined;
		pressed = undefined;
	}
	/** Moves the dragged photo into the slot under the pointer, if that is a different one. */
	function settle() {
		if (!drag || !pane) return;
		const y = pointer.y + (pane.scrollTop - startScroll);
		let best = -1;
		let bestDist = Infinity;
		slots.forEach((s, i) => {
			const dx = Math.max(s.x - pointer.x, 0, pointer.x - (s.x + s.w));
			const dy = Math.max(s.y - y, 0, y - (s.y + s.h));
			const d = Math.hypot(dx, dy);
			if (d < bestDist && d < s.w * 0.6) {
				bestDist = d;
				best = i;
			}
		});
		const from = order.indexOf(drag.name);
		if (best < 0 || best === from) return;
		const next = [...order];
		next.splice(from, 1);
		next.splice(best, 0, drag.name);
		order = next;
	}
	/** Scrolls the grid while the pointer rests near its top or bottom edge. */
	function autoScroll() {
		if (!drag || !pane) return;
		const r = pane.getBoundingClientRect();
		const edge = 48;
		let v = 0;
		if (pointer.y < r.top + edge) v = -Math.ceil((r.top + edge - pointer.y) / 6);
		else if (pointer.y > r.bottom - edge) v = Math.ceil((pointer.y - (r.bottom - edge)) / 6);
		if (v) {
			pane.scrollTop += v;
			settle();
		}
		scrollLoop = requestAnimationFrame(autoScroll);
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
				<p class="path">photos/{album.folder} · {album.files.length} photos</p>
			</div>
			<div class="row">
				<button type="button" onclick={save}>Save</button>
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
					<span class="lbl">Visibility</span>
					<Seg options={VISIBILITIES} bind:value={form.visibility} label="Visibility" />
					<p class="hint">
						{form.visibility === 'unlisted' ? 'Only people with the link.' : 'Listed on the site.'}
					</p>
				</div>
				<div class="field">
					<label for="sort">Order</label>
					<select id="sort" bind:value={form.sort} onchange={sortChanged}>
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
				<p class="hint">"Site default" follows the site settings (site menu, top right).</p>
			</aside>

			<div class="pane photos" bind:this={pane}>
				<p class="hint lead">
					{#if !album.built}
						Not processed yet: quick previews for now.
					{/if}
					{#if ordered.length > 1}
						Drag photos to arrange them{form.sort === 'manual' ? ' (custom order)' : ''}.
					{/if}
				</p>
				<div class="thumbs" bind:this={grid}>
					{#each ordered as file, i (file.name)}
						{@const t = thumb(file.name)}
						<button
							type="button"
							class="thumb"
							class:selected={selected === file.name}
							class:placeholder={drag?.name === file.name}
							class:hidden={photos[file.name]?.hidden}
							style:animation-delay="{Math.min(i, 24) * 14}ms"
							draggable="false"
							onpointerdown={(e) => pointerDown(e, file.name)}
							onpointermove={pointerMove}
							onpointerup={pointerUp}
							onpointercancel={pointerUp}
							title={file.name}
							animate:flip={{ duration: flipMs }}
						>
							{#if t}<img
									src={siteUrl(t)}
									alt=""
									loading="lazy"
									draggable="false"
									style:background={builtPhoto(file.name)?.color}
								/>{:else}<span class="ph">{file.name}</span>{/if}
							{#if form.cover === file.name}<span class="badge cover">Cover</span>{/if}
							{#if photos[file.name]?.hidden}<span class="badge off">Hidden</span>{/if}
						</button>
					{/each}
				</div>
				{#if drag}
					{@const t = thumb(drag.name)}
					<div
						class="ghost"
						style:left="{drag.x}px"
						style:top="{drag.y}px"
						style:width="{drag.w}px"
						style:height="{drag.h}px"
					>
						{#if t}<img src={siteUrl(t)} alt="" />{/if}
					</div>
				{/if}
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
							<p class="file">
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
							<label class="switch"
								>Hide from the album<input
									type="checkbox"
									bind:checked={photos[selected].hidden}
								/></label
							>
						</div>
					{/key}
				{:else}
					<p class="hint empty">
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
	.path {
		font: 12px var(--f-mono);
		color: var(--muted);
		font-variant-numeric: tabular-nums;
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
		/* room for focus rings, which the scroll box would otherwise clip */
		padding: 6px;
		margin: -6px;
	}
	.lbl {
		display: block;
		font-size: 13px;
		font-weight: 500;
		margin-bottom: 5px;
	}
	.field .hint {
		margin-top: 5px;
	}
	.lead {
		margin-bottom: 10px;
		min-height: 18px;
	}
	.thumbs {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
		gap: 10px;
		padding: 2px 2px 8px;
	}
	.thumb {
		animation: rise 360ms var(--ease) both;
		position: relative;
		padding: 0;
		background: var(--surface);
		border-radius: 10px;
		aspect-ratio: 1;
		overflow: hidden;
		cursor: grab;
		touch-action: none;
		transition: outline-color 150ms;
		outline: 2px solid transparent;
		outline-offset: 2px;
	}
	.thumb:hover {
		background: var(--surface);
	}
	.thumb:active {
		transform: none;
	}
	.thumb.selected,
	.thumb:focus-visible {
		outline-color: var(--accent);
	}
	.thumb.placeholder {
		outline: 1.5px dashed var(--muted);
		outline-offset: -1.5px;
		background: transparent;
	}
	.thumb.placeholder img,
	.thumb.placeholder .badge {
		opacity: 0.12;
	}
	.ghost {
		position: fixed;
		z-index: 20;
		pointer-events: none;
		border-radius: 10px;
		overflow: hidden;
		box-shadow: 0 16px 40px rgb(17 17 26 / 0.35);
		animation: lift 160ms var(--ease) both;
	}
	.ghost img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	@keyframes lift {
		from {
			transform: scale(1);
		}
		to {
			transform: scale(1.06);
		}
	}
	.thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
		pointer-events: none;
	}
	.thumb.hidden img {
		opacity: 0.4;
	}
	.thumb .ph {
		font: 11px var(--f-mono);
		color: var(--muted);
		word-break: break-all;
		padding: 6px;
	}
	.badge {
		left: 6px;
		bottom: 6px;
	}
	.badge.cover::before {
		content: '';
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--accent);
	}
	.badge.off {
		left: auto;
		right: 6px;
	}
	.detail {
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
		border-radius: 10px;
		background: var(--surface);
	}
	.file {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font: 12px var(--f-mono);
		color: var(--muted);
		font-variant-numeric: tabular-nums;
	}
	.name {
		user-select: text;
	}
	.detail .switch {
		padding: 2px 0;
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
