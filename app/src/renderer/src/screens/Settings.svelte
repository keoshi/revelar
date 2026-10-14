<script lang="ts">
	import { engine, type SiteState } from '../lib/engine.svelte.ts';
	import Seg from '../lib/Seg.svelte';
	import { autosave } from '../lib/autosave.svelte.ts';
	import { onCommand } from '../lib/commands.ts';
	import { onMount } from 'svelte';

	const SORTS = [
		{ value: 'date-asc', label: 'Oldest first' },
		{ value: 'date-desc', label: 'Newest first' },
		{ value: 'filename', label: 'File name' }
	];
	const DOWNLOADS = [
		{ value: 'none', label: 'Off' },
		{ value: 'large', label: 'Large JPEG' },
		{ value: 'original', label: 'Originals' }
	];
	const LOCATIONS = [
		{ value: 'show', label: 'Exact' },
		{ value: 'approximate', label: 'About 1 km' },
		{ value: 'hide', label: 'Hidden' }
	];
	const MODES = [
		{ value: 'system', label: 'System' },
		{ value: 'dark', label: 'Dark' },
		{ value: 'light', label: 'Light' }
	];

	type Props = {
		site: SiteState;
		onSaved: (config: SiteState['config']) => void;
		onBack: () => void;
	};
	let { site, onSaved, onBack }: Props = $props();

	// The form starts from the config as it is when the screen opens and writes itself back a
	// moment after each change (see autosave), so leaving the screen never loses anything.
	// svelte-ignore state_referenced_locally
	const c = site.config;
	let form = $state({
		title: c.site.title,
		description: c.site.description,
		baseUrl: c.site.baseUrl,
		author: c.site.author,
		authorUrl: c.site.authorUrl ?? '',
		copyright: c.site.copyright,
		language: c.site.language,
		sort: c.defaults.sort,
		downloads: c.defaults.downloads,
		location: c.defaults.location,
		exifPanel: c.defaults.exifPanel,
		mode: c.theme.mode,
		accent: c.theme.accent,
		mapEnabled: c.map.enabled
	});
	let error = $state('');
	const saver = autosave(save);
	let lastSaved = JSON.stringify($state.snapshot(form));
	$effect(() => {
		const now = JSON.stringify($state.snapshot(form));
		if (now !== lastSaved) {
			lastSaved = now;
			saver.touch();
		}
	});
	onMount(() => {
		const stop = onCommand('save', () => void saver.flush());
		return () => {
			stop();
			if (saver.pending) void saver.flush();
		};
	});

	async function save() {
		error = '';
		try {
			const input = {
				site: {
					title: form.title,
					description: form.description,
					baseUrl: form.baseUrl,
					author: form.author,
					authorUrl: form.authorUrl,
					copyright: form.copyright,
					language: form.language,
					intro: c.site.intro
				},
				photosDir: c.photosDir,
				albumOrder: c.albumOrder,
				albumManualOrder: c.albumManualOrder,
				defaults: {
					sort: form.sort,
					downloads: form.downloads,
					location: form.location,
					exifPanel: form.exifPanel,
					maxZipBytes: c.defaults.maxZipBytes
				},
				images: c.images,
				viewer: c.viewer,
				theme: { ...c.theme, mode: form.mode, accent: form.accent },
				map: { ...c.map, enabled: form.mapEnabled },
				privacy: c.privacy,
				feeds: c.feeds
			};
			const config = await engine.saveConfig(site.root, input);
			onSaved(config);
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	}
</script>

<section class="settings">
	<header class="head">
		<div>
			<button type="button" class="link back" onclick={onBack}>← Library</button>
			<h1>Site settings</h1>
			<p class="path">{site.root.replace(/^\/Users\/[^/]+/, '~')}/revelar.config.ts</p>
		</div>
		<span class="autosave" class:idle={!saver.status} aria-live="polite"
			>{saver.status === 'saving' ? 'Saving…' : 'Saved'}</span
		>
	</header>
	{#if error}<p class="error">{error}</p>{/if}

	<div class="cols">
		<div class="col">
			<h2>Site</h2>
			<div class="r">
				<label for="s-title">Title</label><input id="s-title" bind:value={form.title} />
			</div>
			<div class="r">
				<label for="s-desc">Description</label><input id="s-desc" bind:value={form.description} />
			</div>
			<div class="r">
				<label for="s-url">Address</label>
				<div>
					<input id="s-url" bind:value={form.baseUrl} placeholder="https://photos.example.com" />
					<p class="hint">Filled in when you publish. Set it yourself only for your own domain.</p>
				</div>
			</div>
			<div class="r">
				<label for="s-lang">Language</label><input
					id="s-lang"
					bind:value={form.language}
					placeholder="en"
				/>
			</div>

			<h2>
				You <span class="hint"
					>website and copyright go in the footer; the name into photo metadata</span
				>
			</h2>
			<div class="r">
				<label for="s-author">Your name</label><input id="s-author" bind:value={form.author} />
			</div>
			<div class="r">
				<label for="s-aurl">Your website</label><input
					id="s-aurl"
					bind:value={form.authorUrl}
					placeholder="https://"
				/>
			</div>
			<div class="r">
				<label for="s-copy">Copyright</label><input
					id="s-copy"
					bind:value={form.copyright}
					placeholder="© Your Name"
				/>
			</div>
		</div>

		<div class="col">
			<h2>Defaults for every album <span class="hint">each album can override these</span></h2>
			<div class="r">
				<span class="lbl">Photo order</span>
				<Seg options={SORTS} bind:value={form.sort} label="Photo order" />
			</div>
			<div class="r">
				<span class="lbl">Downloads</span>
				<Seg options={DOWNLOADS} bind:value={form.downloads} label="Downloads" />
			</div>
			<div class="r">
				<span class="lbl">Locations</span>
				<Seg options={LOCATIONS} bind:value={form.location} label="Locations" />
			</div>
			<div class="r">
				<span class="lbl">Info panel</span>
				<label class="switch"
					><span class="hint">Camera, exposure and place for each photo</span><input
						type="checkbox"
						bind:checked={form.exifPanel}
					/></label
				>
			</div>
			<div class="r">
				<span class="lbl">Maps</span>
				<label class="switch"
					><span class="hint">Where the photos were taken</span><input
						type="checkbox"
						bind:checked={form.mapEnabled}
					/></label
				>
			</div>

			<h2>Look</h2>
			<div class="r">
				<span class="lbl">Theme</span>
				<Seg options={MODES} bind:value={form.mode} label="Theme" />
			</div>
			<div class="r">
				<label for="s-accent">Accent colour</label>
				<div class="row">
					<input id="s-accent" type="color" bind:value={form.accent} /><input
						class="hex"
						bind:value={form.accent}
					/>
				</div>
			</div>
		</div>
	</div>
</section>

<style>
	.settings {
		max-width: 1040px;
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		gap: 24px;
		margin: 0 0 20px;
	}
	.head > div {
		min-width: 0;
	}
	.back {
		padding-left: 0;
		margin-bottom: 2px;
	}
	.path {
		font: 12px var(--f-mono);
		color: var(--muted);
		user-select: text;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.cols {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0 48px;
	}
	@media (max-width: 900px) {
		.cols {
			grid-template-columns: 1fr;
		}
	}
	h2 {
		margin: 18px 0 10px;
		display: flex;
		align-items: baseline;
		gap: 10px;
	}
	.col h2:first-child {
		margin-top: 0;
	}
	/* Label on the left, control on the right: short rows that fit the window without scrolling. */
	.r {
		display: grid;
		grid-template-columns: 112px 1fr;
		gap: 12px;
		align-items: center;
		margin-bottom: 8px;
	}
	.r > label,
	.r > .lbl {
		margin: 0;
		font-size: 13px;
		font-weight: 500;
		text-align: right;
	}
	.r .hint {
		margin-top: 5px;
	}
	.r .switch .hint {
		margin: 0;
	}
	.r .switch {
		padding: 4px 0;
	}
	input[type='color'] {
		width: 44px;
		padding: 3px;
		height: 36px;
	}
	.hex {
		width: 120px;
		font-family: var(--f-mono);
		font-size: 13px;
	}
</style>
