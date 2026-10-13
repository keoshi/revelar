<script lang="ts">
	import type { Photo } from '../types.ts';
	import { formatBytes } from '../utils/text.ts';
	import { formatCamera, formatDate, formatExposure, formatMegapixels } from '../utils/exif.ts';
	import Icon from './Icon.svelte';
	import MiniMap from './MiniMap.svelte';

	/** Map styles for the mini map, and the album map URL when that page exists. */
	export type InfoMapSettings = { styleLight: string; styleDark: string; href?: string };

	type Props = {
		photo: Photo;
		open: boolean;
		language: string;
		download?: { href?: string; name?: string; bytes?: number; onClick?: () => void };
		map?: InfoMapSettings;
		onClose: () => void;
	};

	let { photo, open, language, download, map, onClose }: Props = $props();

	// The mini map (and MapLibre) is only created once the panel has been opened.
	let shown = $state(false);
	$effect(() => {
		if (open) shown = true;
	});

	const camera = $derived(formatCamera(photo.exif?.make, photo.exif?.model));
	const exposure = $derived(formatExposure(photo.exif));
	const date = $derived(formatDate(photo.date, language));
	const mapHref = $derived(
		photo.gps
			? `https://www.openstreetmap.org/?mlat=${photo.gps.lat}&mlon=${photo.gps.lng}#map=${photo.gps.precision === 'exact' ? 16 : 12}/${photo.gps.lat}/${photo.gps.lng}`
			: undefined
	);
	let panel: HTMLElement | undefined = $state();

	$effect(() => {
		if (open) panel?.focus();
	});
</script>

<aside
	bind:this={panel}
	class="info"
	class:open
	tabindex="-1"
	aria-label="Photo information"
	aria-hidden={!open}
	inert={!open}
>
	<div class="info-head">
		<h2>Info</h2>
		<button
			type="button"
			class="icon-button"
			onclick={onClose}
			aria-label="Close info panel"
			title="Close (I)"
		>
			<Icon name="close" />
		</button>
	</div>
	<dl>
		{#if photo.title}
			<div class="row">
				<dt>Title</dt>
				<dd>{photo.title}</dd>
			</div>
		{/if}
		{#if photo.caption}
			<div class="row">
				<dt>Caption</dt>
				<dd>{photo.caption}</dd>
			</div>
		{/if}
		{#if date}
			<div class="row">
				<dt>Date</dt>
				<dd class="tabular">{date}</dd>
			</div>
		{/if}
		{#if camera}
			<div class="row">
				<dt>Camera</dt>
				<dd>{camera}</dd>
			</div>
		{/if}
		{#if photo.exif?.lens}
			<div class="row">
				<dt>Lens</dt>
				<dd>{photo.exif.lens}</dd>
			</div>
		{/if}
		{#if exposure}
			<div class="row">
				<dt>Exposure</dt>
				<dd class="tabular">{exposure}</dd>
			</div>
		{/if}
		<div class="row">
			<dt>Size</dt>
			<dd class="tabular">{formatMegapixels(photo.width, photo.height)}</dd>
		</div>
		{#if photo.keywords.length}
			<div class="row">
				<dt>Keywords</dt>
				<dd class="chips">
					{#each photo.keywords as k (k)}<span class="chip">{k}</span>{/each}
				</dd>
			</div>
		{/if}
		{#if photo.gps && mapHref}
			<div class="row">
				<dt>Location</dt>
				<dd>
					{#if map && shown}
						<MiniMap
							gps={photo.gps}
							styleLight={map.styleLight}
							styleDark={map.styleDark}
							href={map.href ? `${map.href}#photo=${photo.id}` : undefined}
						/>
					{/if}
					<a class="map-link" href={mapHref} target="_blank" rel="noopener noreferrer">
						<Icon name="map" size={16} />
						<span class="tabular">{photo.gps.lat}, {photo.gps.lng}</span>
						{#if photo.gps.precision === 'approximate'}<span class="muted">· approximate</span>{/if}
					</a>
				</dd>
			</div>
		{/if}
		{#if download}
			<div class="row">
				<dt>Download</dt>
				<dd>
					{#if download.href}
						<a class="map-link" href={download.href} download={download.name}>
							<Icon name="download" size={16} />
							<span
								>{download.name}
								{#if download.bytes}<span class="muted">· {formatBytes(download.bytes)}</span
									>{/if}</span
							>
						</a>
					{:else if download.onClick}
						<button type="button" class="map-link" onclick={download.onClick}>
							<Icon name="download" size={16} />
							<span
								>{download.name}
								{#if download.bytes}<span class="muted">· {formatBytes(download.bytes)}</span
									>{/if}</span
							>
						</button>
					{/if}
				</dd>
			</div>
		{/if}
	</dl>
</aside>

<style>
	.info {
		position: absolute;
		top: 0;
		right: 0;
		bottom: 0;
		width: var(--info-width, 320px);
		overflow-y: auto;
		background: var(--surface);
		color: var(--text);
		border-left: 1px solid var(--hairline);
		transform: translateX(100%);
		transition: transform var(--dur-ui) var(--ease-out);
		padding: 8px 20px 24px;
	}

	.info.open {
		transform: none;
	}

	.info:focus {
		outline: none;
	}

	.info-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 8px;
	}

	h2 {
		font-size: var(--text-sm);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--text-muted);
	}

	dl {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.row {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	dt {
		font-size: var(--text-xs);
		color: var(--text-muted);
	}

	dd {
		margin: 0;
		font-size: var(--text-sm);
		line-height: 1.5;
		overflow-wrap: anywhere;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	.chip {
		padding: 2px 8px;
		border-radius: var(--radius);
		background: var(--surface-2);
		font-size: var(--text-xs);
	}

	.map-link {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: var(--text);
	}

	.muted {
		color: var(--text-muted);
	}

	@media (max-width: 639px) {
		.info {
			top: auto;
			left: 0;
			width: auto;
			height: 50%;
			border-left: 0;
			border-top: 1px solid var(--hairline);
			border-radius: var(--radius) var(--radius) 0 0;
			transform: translateY(100%);
		}
	}
</style>
