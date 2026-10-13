<script lang="ts">
	/** Decrypted private album: grid + viewer fed by object URLs, hash-based photo state. */
	import { onMount, tick, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import type { Photo, PrivateAlbumPayload } from '../types.ts';
	import type { SiteSettings } from '../config.ts';
	import { createAlbumState } from '../state/album.svelte.ts';
	import { PrivateImageStore } from '../crypto/store.ts';
	import { formatBytes } from '../utils/text.ts';
	import AlbumHeader from './AlbumHeader.svelte';
	import Grid from './Grid.svelte';
	import LazyViewer from './LazyViewer.svelte';

	type Props = {
		album: PrivateAlbumPayload;
		site: SiteSettings;
		dek: Uint8Array;
		initialPhoto?: string;
	};
	let { album, site, dek, initialPhoto }: Props = $props();

	// svelte-ignore state_referenced_locally
	const albumState = createAlbumState(album, { filmstrip: site.viewer.filmstrip });
	// svelte-ignore state_referenced_locally
	const store = new PrivateImageStore(dek);
	let grid: Grid | undefined = $state();
	let hydrated = $state(false);
	let zipProgress = $state<{ done: number; total: number } | undefined>(undefined);

	const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
	const resolveSrc = (photo: Photo, cssWidth: number) => store.photoUrl(photo, cssWidth * dpr);
	const viewerSrc = (photo: Photo, width: number) => store.photoUrl(photo, width);
	const thumbSrc = (photo: Photo) => store.thumbUrl(photo);

	function indexOf(id: string | undefined): number {
		return id ? album.photos.findIndex((p) => p.id === id) : -1;
	}

	function hashFor(id?: string): string {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient, never rendered
		const params = new URLSearchParams(page.url.hash.replace(/^#/, ''));
		if (id) params.set('photo', id);
		else params.delete('photo');
		const s = params.toString();
		return s ? `#${s}` : page.url.pathname;
	}

	let pendingOpen: { autoplay: boolean; fromGrid: boolean } | undefined;
	function openFromGrid(i: number, autoplay = false) {
		pendingOpen = { autoplay, fromGrid: true };
		void goto(hashFor(album.photos[i].id), {
			shallow: true,
			state: { photo: album.photos[i].id, viewerPushed: true }
		});
	}
	function onIndexChange(i: number) {
		const id = album.photos[i]?.id;
		if (!id || page.state.photo === id) return;
		void goto(hashFor(id), {
			shallow: true,
			replace: true,
			state: { photo: id, viewerPushed: page.state.viewerPushed }
		});
	}
	function onRequestClose() {
		if (page.state.viewerPushed) history.back();
		else void goto(hashFor(undefined), { shallow: true, replace: true, state: {} });
		albumState.close();
	}
	function onClosed() {
		grid?.focusTile(albumState.index);
	}

	// URL state drives the album state (Back/Forward, deep links). Only page.state.photo is
	// tracked: while a shallow goto is still settling after a viewer move, the album state is
	// ahead of the URL and reacting to it here would bounce the viewer back and forth.
	$effect(() => {
		if (!hydrated) return;
		const id = page.state.photo;
		const idx = indexOf(id);
		untrack(() => {
			if (!id || idx < 0) {
				if (albumState.mode === 'viewer') albumState.close();
				return;
			}
			if (albumState.mode === 'grid') {
				const opts = pendingOpen ?? { autoplay: false, fromGrid: false };
				pendingOpen = undefined;
				albumState.open(idx, opts);
			} else if (idx !== albumState.index) albumState.goTo(idx);
		});
	});

	onMount(() => {
		(async () => {
			if (initialPhoto && indexOf(initialPhoto) >= 0)
				await goto(page.url.href, {
					shallow: true,
					replace: true,
					state: { photo: initialPhoto, viewerPushed: false }
				});
			await tick();
			hydrated = true;
		})();
		return () => store.dispose();
	});

	function getThumbEl(i: number): HTMLElement | null {
		return document.querySelector<HTMLElement>(`[data-tile][data-index="${i}"] img`);
	}

	function saveBlob(blob: Blob, name: string) {
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = name;
		a.click();
		setTimeout(() => URL.revokeObjectURL(url), 10_000);
	}

	function downloadFor(photo: Photo) {
		if (!photo.download) return undefined;
		const stem = photo.file.replace(/\.[^.]+$/, '');
		return {
			name: `${album.slug}-${stem}`,
			bytes: photo.download.bytes,
			onClick: () => {
				store.downloadBlob(photo).then(({ blob, name }) => saveBlob(blob, `${album.slug}-${name}`));
			}
		};
	}

	/** Album zip assembled in the browser after decryption, streamed with client-zip. */
	async function downloadAlbum() {
		const { downloadZip } = await import('client-zip');
		const files = album.photos.filter((p) => p.download);
		zipProgress = { done: 0, total: files.length };
		const entries = (async function* () {
			for (const photo of files) {
				const { blob, name } = await store.downloadBlob(photo);
				zipProgress = { done: (zipProgress?.done ?? 0) + 1, total: files.length };
				yield { name, input: blob, lastModified: photo.date ? new Date(photo.date) : new Date() };
			}
		})();
		const blob = await downloadZip(entries).blob();
		saveBlob(blob, `${album.slug}.zip`);
		zipProgress = undefined;
	}
</script>

<section class="container album">
	<AlbumHeader
		title={album.title}
		date={album.date}
		dateRange={album.dateRange}
		descriptionHtml={album.descriptionHtml}
		count={album.count}
		language={site.language}
		albumDownload={album.albumDownload}
		onPlay={() => openFromGrid(0, true)}
		onDownloadAlbum={album.albumDownload ? downloadAlbum : undefined}
	/>
	{#if zipProgress}
		<p class="zip-progress" role="status">
			Preparing zip · {zipProgress.done} / {zipProgress.total} files
			{#if album.albumDownload}· {formatBytes(album.albumDownload.bytes)}{/if}
		</p>
	{/if}
	<Grid
		bind:this={grid}
		photos={album.photos}
		albumSlug={album.slug}
		rowHeight={site.viewer.gridRowHeight}
		onOpen={(i) => openFromGrid(i)}
		hrefFor={(p) => `#photo=${p.id}`}
		{resolveSrc}
	/>
</section>

<LazyViewer
	{albumState}
	language={site.language}
	slideshowInterval={site.viewer.slideshowInterval}
	transition={site.viewer.transition}
	filmstripEnabled={site.viewer.filmstrip}
	exifPanel={album.exifPanel && site.defaults.exifPanel}
	{getThumbEl}
	{downloadFor}
	resolveSrc={viewerSrc}
	{thumbSrc}
	{onIndexChange}
	{onRequestClose}
	{onClosed}
/>

<style>
	.album {
		padding-bottom: 48px;
	}
	.zip-progress {
		margin-bottom: 12px;
		color: var(--text-muted);
		font-size: var(--text-sm);
	}
</style>
