<script lang="ts">
	import { withBase } from '../utils/href.ts';
	import { formatBytes } from '../utils/text.ts';
	import { formatDate, formatDateRange } from '../utils/exif.ts';
	import type { AlbumSummary } from '../types.ts';

	type Props = {
		title: string;
		date?: string;
		dateRange?: { from: string; to: string };
		descriptionHtml?: string;
		count: number;
		language?: string;
		albumDownload?: AlbumSummary['albumDownload'];
		mapHref?: string;
		onPlay?: () => void;
		onDownloadAlbum?: () => void;
	};

	let {
		title,
		date,
		dateRange,
		descriptionHtml,
		count,
		language = 'en',
		albumDownload,
		mapHref,
		onPlay,
		onDownloadAlbum
	}: Props = $props();

	const dateLabel = $derived(
		dateRange && dateRange.from.slice(0, 7) !== dateRange.to.slice(0, 7)
			? formatDateRange(dateRange, language)
			: formatDate(date ?? dateRange?.from, language, false)
	);
	const downloadLabel = $derived(
		albumDownload ? `Download album · ${formatBytes(albumDownload.bytes)}` : undefined
	);
</script>

<header class="album-header">
	<div class="album-heading">
		<h1>{title}</h1>
		<p class="meta tabular">
			{#if dateLabel}<span>{dateLabel}</span><span class="dot" aria-hidden="true">·</span>{/if}
			<span>{count} {count === 1 ? 'photo' : 'photos'}</span>
		</p>
		{#if descriptionHtml}
			<!-- eslint-disable-next-line svelte/no-at-html-tags -- Markdown from album.yaml, rendered at build -->
			<div class="prose description">{@html descriptionHtml}</div>
		{/if}
	</div>
	<div class="actions" role="group" aria-label="Album actions">
		{#if onPlay}
			<button type="button" class="icon-button" onclick={onPlay} title="Play slideshow (Space)">
				<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"
					><path d="M8 5v14l11-7z" /></svg
				>
				<span>Play</span>
			</button>
		{/if}
		{#if albumDownload && 'url' in albumDownload}
			<a class="icon-button" href={withBase(albumDownload.url)} download>
				<svg
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.6"
					aria-hidden="true"
				>
					<path d="M12 4v11m0 0 4-4m-4 4-4-4M5 19h14" />
				</svg>
				<span>{downloadLabel}</span>
			</a>
		{:else if albumDownload && onDownloadAlbum}
			<button type="button" class="icon-button" onclick={onDownloadAlbum}>
				<svg
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.6"
					aria-hidden="true"
				>
					<path d="M12 4v11m0 0 4-4m-4 4-4-4M5 19h14" />
				</svg>
				<span>{downloadLabel}</span>
			</button>
		{/if}
		{#if mapHref}
			<a class="icon-button" href={mapHref}>
				<svg
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.6"
					aria-hidden="true"
				>
					<path d="M12 21s-6-5.3-6-10a6 6 0 1 1 12 0c0 4.7-6 10-6 10Z" /><circle
						cx="12"
						cy="11"
						r="2.2"
					/>
				</svg>
				<span>Map</span>
			</a>
		{/if}
	</div>
</header>

<style>
	.album-header {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: 16px 24px;
		padding-block: 24px 20px;
	}

	h1 {
		font-family: var(--font-titles);
		font-size: var(--text-2xl);
		font-weight: 500;
		line-height: 1.1;
		letter-spacing: -0.015em;
	}

	@media (max-width: 639px) {
		h1 {
			font-size: var(--text-xl);
		}
	}

	.meta {
		margin-top: 8px;
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.dot {
		margin-inline: 8px;
	}

	.description {
		margin-top: 12px;
	}

	.actions {
		display: flex;
		gap: 4px;
		margin-left: auto;
	}

	.actions .icon-button {
		color: var(--text-muted);
	}

	.actions .icon-button:hover {
		color: var(--text);
	}
</style>
