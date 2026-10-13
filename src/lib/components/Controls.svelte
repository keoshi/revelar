<script lang="ts">
	import type { AlbumState } from '../state/album.svelte.ts';
	import { formatBytes } from '../utils/text.ts';
	import Icon from './Icon.svelte';

	type Props = {
		albumState: AlbumState;
		albumSlug: string;
		slideshowInterval: number;
		showFilmstripToggle: boolean;
		showInfo: boolean;
		canFullscreen: boolean;
		downloadHref?: string;
		downloadName?: string;
		downloadBytes?: number;
		onClose: () => void;
		onPrev: () => void;
		onNext: () => void;
		onTogglePlay: () => void;
		onToggleInfo: () => void;
		onToggleFilmstrip: () => void;
		onToggleFullscreen: () => void;
		onDownload?: () => void;
		onCounterTap: () => void;
		/** 0..1 autoplay progress key; increments restart the progress line */
		progressKey: number;
	};

	let {
		albumState,
		slideshowInterval,
		showFilmstripToggle,
		showInfo,
		canFullscreen,
		downloadHref,
		downloadName,
		downloadBytes,
		onClose,
		onPrev,
		onNext,
		onTogglePlay,
		onToggleInfo,
		onToggleFilmstrip,
		onToggleFullscreen,
		onDownload,
		onCounterTap,
		progressKey
	}: Props = $props();

	const downloadLabel = $derived(
		downloadBytes ? `Download · ${formatBytes(downloadBytes)}` : 'Download'
	);
</script>

<div class="controls" data-controls>
	{#if albumState.autoplay}
		{#key progressKey}
			<div class="progress" style:--interval="{slideshowInterval}ms" aria-hidden="true"></div>
		{/key}
	{/if}
	<div class="bar">
		<div class="group">
			<button
				type="button"
				class="icon-button"
				onclick={onClose}
				aria-label="Close viewer"
				title="Close (Esc)"
			>
				<Icon name="close" />
			</button>
			<button
				type="button"
				class="counter tabular"
				onclick={onCounterTap}
				aria-label={`Photo ${albumState.index + 1} of ${albumState.count}. Toggle filmstrip`}
				title="Filmstrip (T)"
			>
				{albumState.index + 1} / {albumState.count}
			</button>
		</div>
		<div class="group">
			<button
				type="button"
				class="icon-button"
				onclick={onPrev}
				aria-label="Previous photo"
				title="Previous (←)"
			>
				<Icon name="prev" />
			</button>
			<button
				type="button"
				class="icon-button"
				onclick={onNext}
				aria-label="Next photo"
				title="Next (→)"
			>
				<Icon name="next" />
			</button>
			<button
				type="button"
				class="icon-button"
				onclick={onTogglePlay}
				aria-pressed={albumState.autoplay}
				aria-label={albumState.autoplay ? 'Pause slideshow' : 'Play slideshow'}
				title={albumState.autoplay ? 'Pause (Space)' : 'Play (Space)'}
			>
				<Icon name={albumState.autoplay ? 'pause' : 'play'} />
			</button>
			{#if showInfo}
				<button
					type="button"
					class="icon-button"
					onclick={onToggleInfo}
					aria-pressed={albumState.infoOpen}
					aria-label="Photo information"
					title="Info (I)"
				>
					<Icon name="info" />
				</button>
			{/if}
			{#if downloadHref}
				<a
					class="icon-button"
					href={downloadHref}
					download={downloadName}
					aria-label={downloadLabel}
					title="Download (D)"
				>
					<Icon name="download" />
					<span class="label">{downloadLabel}</span>
				</a>
			{:else if onDownload}
				<button
					type="button"
					class="icon-button"
					onclick={onDownload}
					aria-label={downloadLabel}
					title="Download (D)"
				>
					<Icon name="download" />
					<span class="label">{downloadLabel}</span>
				</button>
			{/if}
			{#if showFilmstripToggle}
				<button
					type="button"
					class="icon-button filmstrip-toggle"
					onclick={onToggleFilmstrip}
					aria-pressed={albumState.filmstripOpen}
					aria-label="Toggle filmstrip"
					title="Filmstrip (T)"
				>
					<Icon name="filmstrip" />
				</button>
			{/if}
			{#if canFullscreen}
				<button
					type="button"
					class="icon-button"
					onclick={onToggleFullscreen}
					aria-pressed={albumState.fullscreen}
					aria-label={albumState.fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
					title="Fullscreen (F)"
				>
					<Icon name={albumState.fullscreen ? 'fullscreen-exit' : 'fullscreen'} />
				</button>
			{/if}
		</div>
	</div>
</div>

<style>
	.controls {
		position: absolute;
		inset: 0 0 auto 0;
		padding: 8px 8px 24px;
		background: linear-gradient(to bottom, rgb(0 0 0 / 0.5), rgb(0 0 0 / 0));
		pointer-events: none;
	}

	.progress {
		position: absolute;
		top: 0;
		left: 0;
		height: 2px;
		width: 0;
		background: var(--accent);
		animation: progress var(--interval) linear forwards;
	}

	@keyframes progress {
		to {
			width: 100%;
		}
	}

	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.group {
		display: flex;
		align-items: center;
		gap: 2px;
		pointer-events: auto;
	}

	.counter {
		height: 40px;
		padding-inline: 8px;
		border-radius: var(--radius);
		font-size: var(--text-sm);
		color: var(--text);
		letter-spacing: 0.02em;
	}

	.counter:hover {
		background: var(--hairline);
	}

	.label {
		font-size: var(--text-sm);
	}

	@media (max-width: 639px) {
		.label {
			display: none;
		}
		.filmstrip-toggle {
			display: none;
		}
	}
</style>
