<script lang="ts">
	import type { AlbumState } from '../state/album.svelte.ts';
	import type { Photo } from '../types.ts';
	import Controls from './Controls.svelte';
	import Caption from './Caption.svelte';
	import Filmstrip from './Filmstrip.svelte';
	import InfoPanel from './InfoPanel.svelte';

	type Props = {
		albumState: AlbumState;
		language: string;
		slideshowInterval: number;
		filmstripEnabled: boolean;
		exifPanel: boolean;
		canFullscreen: boolean;
		progressKey: number;
		downloadFor: (
			photo: Photo
		) => { href?: string; name?: string; bytes?: number; onClick?: () => void } | undefined;
		thumbSrc?: (photo: Photo) => Promise<string> | string;
		onClose: () => void;
		onPrev: () => void;
		onNext: () => void;
		onGoTo: (index: number) => void;
		onTogglePlay: () => void;
		onToggleInfo: () => void;
		onToggleFilmstrip: () => void;
		onToggleFullscreen: () => void;
	};

	let {
		albumState,
		language,
		slideshowInterval,
		filmstripEnabled,
		exifPanel,
		canFullscreen,
		progressKey,
		downloadFor,
		thumbSrc,
		onClose,
		onPrev,
		onNext,
		onGoTo,
		onTogglePlay,
		onToggleInfo,
		onToggleFilmstrip,
		onToggleFullscreen
	}: Props = $props();

	const photo = $derived(albumState.current);
	const download = $derived(photo ? downloadFor(photo) : undefined);
	const announcement = $derived(
		photo && !albumState.autoplay
			? `Photo ${albumState.index + 1} of ${albumState.count}${photo.title ? `: ${photo.title}` : ''}`
			: ''
	);
</script>

<div
	class="chrome stage-dark"
	class:hidden={!albumState.chromeVisible}
	class:info-open={albumState.infoOpen}
>
	<Controls
		{albumState}
		{slideshowInterval}
		showFilmstripToggle={filmstripEnabled}
		showInfo={exifPanel}
		{canFullscreen}
		downloadHref={download?.href}
		downloadName={download?.name}
		downloadBytes={download?.bytes}
		onDownload={download?.onClick}
		{progressKey}
		{onClose}
		{onPrev}
		{onNext}
		{onTogglePlay}
		{onToggleInfo}
		{onToggleFilmstrip}
		{onToggleFullscreen}
		onCounterTap={onToggleFilmstrip}
	/>

	<div class="bottom">
		{#if photo}
			<div class="caption-row">
				<Caption title={photo.title} caption={photo.caption} />
			</div>
		{/if}
		{#if filmstripEnabled && albumState.filmstripOpen}
			<Filmstrip photos={albumState.photos} index={albumState.index} onSelect={onGoTo} {thumbSrc} />
		{/if}
	</div>

	{#if exifPanel && photo}
		<InfoPanel {photo} open={albumState.infoOpen} {language} {download} onClose={onToggleInfo} />
	{/if}

	<div class="visually-hidden" aria-live="polite" aria-atomic="true">{announcement}</div>
</div>

<style>
	.chrome {
		position: absolute;
		inset: 0;
		pointer-events: none;
		transition: opacity var(--dur-ui) var(--ease-out);
	}

	.chrome > :global(*) {
		pointer-events: auto;
	}

	.chrome.hidden {
		opacity: 0;
	}

	.chrome.hidden > :global(*) {
		pointer-events: none;
	}

	.bottom {
		position: absolute;
		inset: auto 0 0 0;
		background: linear-gradient(to top, rgb(0 0 0 / 0.6), rgb(0 0 0 / 0));
		padding-bottom: env(safe-area-inset-bottom);
	}

	.caption-row {
		padding: 24px 16px 8px;
	}

	.info-open .bottom {
		right: var(--info-width, 0);
	}

	.info-open :global([data-controls]) {
		right: var(--info-width, 0);
	}
</style>
