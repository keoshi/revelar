<script lang="ts">
	import { albumHref } from '../utils/href.ts';
	import type { AlbumCard } from '../server/manifest.ts';
	import { formatDate, formatDateRange } from '../utils/exif.ts';
	import Picture from './Picture.svelte';

	let {
		album,
		language = 'en',
		priority = false
	}: { album: AlbumCard; language?: string; priority?: boolean } = $props();
	const dateLabel = $derived(
		album.dateRange && album.dateRange.from.slice(0, 7) !== album.dateRange.to.slice(0, 7)
			? formatDateRange(album.dateRange, language)
			: formatDate(album.date ?? album.dateRange?.from, language, false)
	);
</script>

<a class="cover" href={albumHref(album.slug)}>
	<span class="frame">
		<Picture
			sources={album.cover.sources}
			alt={album.cover.alt}
			width={album.cover.width}
			height={album.cover.height}
			thumbhash={album.cover.thumbhash}
			color={album.cover.color}
			sizes="(min-width: 1100px) 33vw, (min-width: 640px) 50vw, 100vw"
			loading={priority ? 'eager' : 'lazy'}
			{priority}
		/>
	</span>
	<span class="caption">
		<span class="title">{album.title}</span>
		{#if dateLabel}<span class="date tabular">{dateLabel}</span>{/if}
	</span>
</a>

<style>
	.cover {
		display: block;
	}

	.cover:hover {
		text-decoration: none;
	}

	.frame {
		display: block;
		aspect-ratio: 3 / 2;
		overflow: hidden;
		background: var(--surface);
		outline: 2px solid transparent;
		outline-offset: 0;
		transition: outline-color var(--dur-ui) var(--ease-out);
	}

	.cover:hover .frame,
	.cover:focus-visible .frame {
		outline-color: var(--accent);
	}

	.cover:focus-visible {
		outline: none;
	}

	.caption {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding-block: 12px 4px;
	}

	.title {
		font-size: var(--text-lg);
		font-weight: 600;
		letter-spacing: -0.01em;
		line-height: 1.25;
	}

	.date {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}
</style>
