<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import type { AlbumMeta, Photo } from '../types.ts';
	import type { SiteSettings } from '../config.ts';
	import { createAlbumState, type AlbumState } from '../state/album.svelte.ts';
	import { expandSources } from '../utils/sources.ts';
	import { albumHref, photoHref, withBase } from '../utils/href.ts';
	import AlbumHeader from './AlbumHeader.svelte';
	import Grid from './Grid.svelte';
	import Picture from './Picture.svelte';
	import LazyViewer from './LazyViewer.svelte';

	type Props = {
		album: AlbumMeta;
		/** the photo list; the album page has it inline, a photo page passes it once album.json loads */
		photos?: Photo[];
		/** deep link: the one photo the server rendered inline, shown until the viewer opens over it */
		deepLink?: { photo: Photo; index: number; failed?: boolean };
		site: SiteSettings;
		hasMap: boolean;
		/** photo id to open in the viewer on load (deep link) */
		initialPhoto?: string;
		inlineScript?: string;
	};

	let {
		album: albumProp,
		photos,
		deepLink,
		site,
		hasMap,
		initialPhoto,
		inlineScript
	}: Props = $props();
	// The page re-keys this component per album, so the album is fixed for its lifetime. Reading
	// the prop once also keeps teardown safe: navigating to a route without album data updates
	// the props before the component unmounts.
	// svelte-ignore state_referenced_locally
	const album = albumProp;

	// One store per album page (the page component is keyed by slug), created as soon as the
	// photo list is available: inline on the album page, after the album.json fetch on a photo page.
	// svelte-ignore state_referenced_locally
	let albumState = $state.raw<AlbumState | undefined>(
		photos ? createAlbumState({ photos }, { filmstrip: site.viewer.filmstrip }) : undefined
	);
	$effect(() => {
		if (photos && !albumState)
			albumState = createAlbumState({ photos }, { filmstrip: site.viewer.filmstrip });
	});
	let grid: Grid | undefined = $state();
	let hydrated = $state(false);
	/** deep links: show the photo as a plain figure until the viewer has opened over it */
	// svelte-ignore state_referenced_locally
	let showDeepLink = $state(Boolean(deepLink));

	const current = $derived(deepLink?.photo);
	const currentIndex = $derived(deepLink?.index ?? -1);
	const description = $derived(
		current?.caption ??
			album.description ??
			photos?.find((p) => p.caption)?.caption ??
			site.description
	);
	const canonical = $derived(
		current ? `${site.baseUrl}/${album.slug}/${current.id}/` : `${site.baseUrl}/${album.slug}/`
	);
	const pageTitle = $derived(
		current ? `${current.title ?? `Photo ${currentIndex + 1}`} · ${album.title}` : album.title
	);
	const ogImage = $derived(expandSources((current ?? album.cover).sources).jpeg);
	const jsonLd = $derived.by(() => {
		const abs = (u: string) => site.baseUrl + u;
		if (current) {
			return {
				'@context': 'https://schema.org',
				'@type': 'ImageObject',
				contentUrl: abs(expandSources(current.sources).jpeg),
				url: canonical,
				name: current.title ?? `Photo ${currentIndex + 1} of ${album.count}`,
				description: current.caption,
				caption: current.caption,
				dateCreated: current.date,
				keywords: current.keywords.length ? current.keywords.join(', ') : undefined,
				width: current.width,
				height: current.height,
				creator: site.author
					? { '@type': 'Person', name: site.author, url: site.authorUrl || undefined }
					: undefined,
				copyrightNotice: site.copyright || undefined,
				isPartOf: {
					'@type': 'ImageGallery',
					name: album.title,
					url: `${site.baseUrl}/${album.slug}/`
				}
			};
		}
		return {
			'@context': 'https://schema.org',
			'@type': 'ImageGallery',
			name: album.title,
			url: canonical,
			description: album.description,
			dateCreated: album.date,
			numberOfItems: album.count,
			image: (photos ?? []).slice(0, 12).map((p) => abs(expandSources(p.sources).jpeg)),
			creator: site.author
				? { '@type': 'Person', name: site.author, url: site.authorUrl || undefined }
				: undefined,
			copyrightNotice: site.copyright || undefined
		};
	});
	const jsonLdTag = $derived(
		'<script type="application/ld+json">' +
			JSON.stringify(jsonLd).replace(/</g, '\\u003c') +
			'</' +
			'script>'
	);

	function indexOf(id: string | undefined): number {
		if (!id || !photos) return -1;
		return photos.findIndex((p) => p.id === id);
	}

	// ---- shallow routing ------------------------------------------------------
	// page.state.photo is the single source of truth once hydrated: opening from the
	// grid pushes state, the viewer replaces state as it moves, Back/Forward pop it,
	// and the effect below keeps the album store in sync (shallow goto is async in Kit 3).
	let pendingOpen: { autoplay: boolean; fromGrid: boolean } | undefined;

	function openFromGrid(i: number, autoplay = false) {
		const id = photos?.[i]?.id;
		if (!id) return;
		pendingOpen = { autoplay, fromGrid: true };
		void goto(photoHref(album.slug, id), {
			shallow: true,
			state: { photo: id, viewerPushed: true }
		});
	}

	function onIndexChange(i: number) {
		const id = photos?.[i]?.id;
		if (!id || page.state.photo === id) return;
		void goto(photoHref(album.slug, id), {
			shallow: true,
			replace: true,
			state: { photo: id, viewerPushed: page.state.viewerPushed }
		});
	}

	function onRequestClose() {
		if (page.state.viewerPushed) history.back();
		else void goto(albumHref(album.slug), { shallow: true, replace: true, state: {} });
		albumState?.close();
	}

	function onClosed() {
		showDeepLink = false;
		if (albumState) grid?.focusTile(albumState.index);
	}

	function onOpened() {
		showDeepLink = false;
	}

	// URL state drives the album state (Back/Forward, deep links). Only page.state.photo is
	// tracked: while a shallow goto is still settling after a viewer move, the album state is
	// ahead of the URL and reacting to it here would bounce the viewer back and forth.
	$effect(() => {
		const state = albumState;
		if (!hydrated || !state) return;
		const id = page.state.photo;
		const idx = indexOf(id);
		untrack(() => {
			if (!id || idx < 0) {
				if (state.mode === 'viewer') state.close();
				return;
			}
			if (state.mode === 'grid') {
				const opts = pendingOpen ?? { autoplay: false, fromGrid: false };
				pendingOpen = undefined;
				state.open(idx, opts);
			} else if (idx !== state.index) state.goTo(idx);
		});
	});

	onMount(async () => {
		if (initialPhoto) {
			await goto(page.url.href, {
				shallow: true,
				replace: true,
				state: { photo: initialPhoto, viewerPushed: false }
			});
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
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- JSON-LD built from build-time data with < escaped -->
	{@html jsonLdTag}
</svelte:head>

<section class="container album">
	{#if current && showDeepLink}
		<!-- Deep link: the photo is painted first (and is the LCP); the viewer opens over it once hydrated. -->
		<figure class="deep-link">
			<div class="deep-link-stage" style:aspect-ratio="{current.width} / {current.height}">
				<Picture
					sources={current.sources}
					alt={current.alt}
					width={current.width}
					height={current.height}
					thumbhash={current.thumbhash}
					color={current.color}
					sizes="100vw"
					loading="eager"
					priority
					fit="contain"
				/>
			</div>
			<figcaption>
				{#if current.title}<strong>{current.title}</strong>{/if}
				{#if current.caption}<span>{current.caption}</span>{/if}
				<a class="deep-link-album" href={albumHref(album.slug)}
					>Photo {currentIndex + 1} of {album.count} · all photos</a
				>
				{#if deepLink?.failed}
					<span class="deep-link-error">The rest of the album could not be loaded.</span>
				{/if}
			</figcaption>
		</figure>
	{/if}
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
	{#if photos}
		<Grid
			bind:this={grid}
			{photos}
			albumSlug={album.slug}
			rowHeight={site.viewer.gridRowHeight}
			onOpen={(i) => openFromGrid(i)}
			{inlineScript}
		/>
	{/if}
</section>

{#if albumState}
	<LazyViewer
		{albumState}
		language={site.language}
		slideshowInterval={site.viewer.slideshowInterval}
		transition={site.viewer.transition}
		filmstripEnabled={site.viewer.filmstrip}
		exifPanel={album.exifPanel && site.defaults.exifPanel}
		map={site.map.enabled
			? {
					styleLight: site.map.styleLight,
					styleDark: site.map.styleDark,
					href: hasMap ? `${albumHref(album.slug)}map/` : undefined
				}
			: undefined}
		{getThumbEl}
		{downloadFor}
		{onIndexChange}
		{onRequestClose}
		{onClosed}
		{onOpened}
	/>
{/if}

<style>
	.album {
		padding-bottom: 48px;
	}

	.deep-link {
		margin: 0 0 24px;
	}

	.deep-link-album,
	.deep-link-error {
		display: block;
		margin-top: 6px;
		font-size: var(--text-xs);
		color: var(--text-muted);
	}

	.deep-link-stage {
		max-height: 80vh;
		margin-inline: auto;
		background: var(--bg-stage);
	}

	.deep-link-stage :global(.picture) {
		height: 100%;
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
