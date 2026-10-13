<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { pushState, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import type { AlbumSummary, Photo } from '../types.ts';
	import type { SiteSettings } from '../config.ts';
	import { createAlbumState } from '../state/album.svelte.ts';
	import { expandSources } from '../utils/sources.ts';
	import { albumHref, photoHref, withBase } from '../utils/href.ts';
	import AlbumHeader from './AlbumHeader.svelte';
	import Grid from './Grid.svelte';
	import Viewer from './Viewer.svelte';

	type Props = {
		album: AlbumSummary;
		site: SiteSettings;
		hasMap: boolean;
		/** photo id to open in the viewer on load (deep link) */
		initialPhoto?: string;
	};

	let { album, site, hasMap, initialPhoto }: Props = $props();

	// One store per album page; the page component is keyed by slug.
	// svelte-ignore state_referenced_locally
	const albumState = createAlbumState(album, { filmstrip: site.viewer.filmstrip });
	let grid: Grid | undefined = $state();
	let viewer: Viewer | undefined = $state();
	let hydrated = $state(false);

	const current = $derived(
		initialPhoto ? album.photos.find((p) => p.id === initialPhoto) : undefined
	);
	const currentIndex = $derived(current ? album.photos.indexOf(current) : -1);
	const description = $derived(
		current?.caption ??
			album.description ??
			album.photos.find((p) => p.caption)?.caption ??
			site.description
	);
	const canonical = $derived(
		current ? `${site.baseUrl}/${album.slug}/${current.id}/` : `${site.baseUrl}/${album.slug}/`
	);
	const pageTitle = $derived(
		current ? `${current.title ?? `Photo ${currentIndex + 1}`} · ${album.title}` : album.title
	);
	const ogImage = $derived(expandSources((current ?? album.cover).sources).jpeg);

	function indexOf(id: string | undefined): number {
		if (!id) return -1;
		return album.photos.findIndex((p) => p.id === id);
	}

	// ---- shallow routing ------------------------------------------------------
	// page.state.photo is the single source of truth once hydrated: opening from the
	// grid pushes state, the viewer replaces state as it moves, Back/Forward pop it,
	// and the effect below keeps the album store in sync (pushState is async in Kit 3).
	let pendingOpen: { autoplay: boolean; fromGrid: boolean } | undefined;

	function openFromGrid(i: number, autoplay = false) {
		pendingOpen = { autoplay, fromGrid: true };
		void pushState(photoHref(album.slug, album.photos[i].id), {
			photo: album.photos[i].id,
			viewerPushed: true
		});
	}

	function onIndexChange(i: number) {
		const id = album.photos[i]?.id;
		if (!id || page.state.photo === id) return;
		void replaceState(photoHref(album.slug, id), {
			photo: id,
			viewerPushed: page.state.viewerPushed
		});
	}

	function onRequestClose() {
		if (page.state.viewerPushed) history.back();
		else void replaceState(albumHref(album.slug), {});
		albumState.close();
	}

	function onClosed() {
		grid?.focusTile(albumState.index);
	}

	$effect(() => {
		if (!hydrated) return;
		const id = page.state.photo;
		const idx = indexOf(id);
		if (!id || idx < 0) {
			if (albumState.mode === 'viewer') albumState.close();
			return;
		}
		if (albumState.mode === 'grid') {
			const opts = pendingOpen ?? { autoplay: false, fromGrid: false };
			pendingOpen = undefined;
			albumState.open(idx, opts);
		} else if (idx !== albumState.index) {
			albumState.goTo(idx);
		}
	});

	onMount(async () => {
		if (initialPhoto && indexOf(initialPhoto) >= 0) {
			await replaceState('', { photo: initialPhoto, viewerPushed: false });
		}
		await tick();
		hydrated = true;
	});

	function getThumbEl(i: number): HTMLElement | null {
		return document.querySelector<HTMLElement>(`[data-tile][data-index="${i}"] img`);
	}

	function downloadFor(photo: Photo) {
		if (!photo.download) return undefined;
		const stem = photo.file.replace(/\.[^.]+$/, '');
		const ext =
			photo.download.kind === 'large' || photo.download.url.endsWith('.jpg')
				? 'jpg'
				: photo.file.split('.').pop();
		return {
			href: withBase(photo.download.url),
			name: `${album.slug}-${stem}.${ext}`,
			bytes: photo.download.bytes
		};
	}
</script>

<svelte:head>
	<title>{pageTitle} · {site.title}</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={canonical} />
	{#if album.visibility === 'unlisted'}
		<meta name="robots" content="noindex" />
	{/if}
	<meta property="og:type" content="website" />
	<meta property="og:title" content={current ? pageTitle : album.title} />
	<meta property="og:description" content={description} />
	<meta property="og:url" content={canonical} />
	<meta property="og:image" content={site.baseUrl + ogImage} />
	<meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<section class="container album">
	<AlbumHeader
		title={album.title}
		date={album.date}
		dateRange={album.dateRange}
		descriptionHtml={album.descriptionHtml}
		count={album.count}
		language={site.language}
		albumDownload={album.albumDownload}
		mapHref={hasMap ? `${albumHref(album.slug)}map/` : undefined}
		onPlay={() => openFromGrid(0, true)}
	/>
	<Grid
		bind:this={grid}
		photos={album.photos}
		albumSlug={album.slug}
		rowHeight={site.viewer.gridRowHeight}
		onOpen={(i) => openFromGrid(i)}
	/>
	{#if current && !hydrated}
		<!-- Plain markup for crawlers and no-JS visitors; the viewer takes over once hydrated. -->
		<figure class="deep-link">
			<img
				src={withBase(ogImage)}
				alt={current.alt}
				width={current.width}
				height={current.height}
				loading="lazy"
			/>
			<figcaption>
				{#if current.title}<strong>{current.title}</strong>{/if}
				{#if current.caption}<span>{current.caption}</span>{/if}
			</figcaption>
		</figure>
	{/if}
</section>

<Viewer
	bind:this={viewer}
	{albumState}
	language={site.language}
	slideshowInterval={site.viewer.slideshowInterval}
	transition={site.viewer.transition}
	filmstripEnabled={site.viewer.filmstrip}
	exifPanel={album.exifPanel && site.defaults.exifPanel}
	{getThumbEl}
	{downloadFor}
	{onIndexChange}
	{onRequestClose}
	{onClosed}
/>

<style>
	.album {
		padding-bottom: 48px;
	}

	.deep-link {
		margin: 32px 0 0;
	}

	.deep-link img {
		width: 100%;
		max-height: 80vh;
		object-fit: contain;
		background: var(--bg-stage);
	}

	.deep-link figcaption {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding-top: 12px;
		font-size: var(--text-sm);
		color: var(--text-muted);
	}
</style>
