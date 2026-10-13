<script lang="ts">
	import { engine, type SiteState } from '../lib/engine.svelte.ts';

	type Props = {
		site: SiteState;
		onSaved: (config: SiteState['config']) => void;
		onBack: () => void;
	};
	let { site, onSaved, onBack }: Props = $props();

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
	let saved = $state(false);

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
			saved = true;
			setTimeout(() => (saved = false), 1600);
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	}
</script>

<section class="settings">
	<p><button type="button" class="link" onclick={onBack}>← Library</button></p>
	<header class="head">
		<div>
			<h1>Site settings</h1>
			<p class="muted small">{site.root}/revelar.config.ts</p>
		</div>
		<button type="button" class="primary" class:saved onclick={save}
			>{saved ? 'Saved' : 'Save'}</button
		>
	</header>
	{#if error}<p class="error">{error}</p>{/if}

	<div class="cols">
		<div>
			<h2>Site</h2>
			<div class="field">
				<label for="s-title">Title</label><input id="s-title" bind:value={form.title} />
			</div>
			<div class="field">
				<label for="s-desc">Description</label><input id="s-desc" bind:value={form.description} />
			</div>
			<div class="field">
				<label for="s-url">Address (base URL)</label>
				<input id="s-url" bind:value={form.baseUrl} placeholder="https://photos.example.com" />
				<p class="muted small hint">
					Where the site will live. Shared links, the sitemap and previews use it.
				</p>
			</div>
			<div class="field">
				<label for="s-lang">Language</label><input
					id="s-lang"
					bind:value={form.language}
					placeholder="en"
				/>
			</div>

			<h2>You</h2>
			<div class="field">
				<label for="s-author">Your name</label><input id="s-author" bind:value={form.author} />
			</div>
			<div class="field">
				<label for="s-aurl">Your website</label><input
					id="s-aurl"
					bind:value={form.authorUrl}
					placeholder="https://"
				/>
			</div>
			<div class="field">
				<label for="s-copy">Copyright line</label><input id="s-copy" bind:value={form.copyright} />
			</div>
		</div>
		<div>
			<h2>Defaults for every album</h2>
			<p class="muted small hint">Each album can override these in its own settings.</p>
			<div class="field">
				<label for="s-sort">Photo order</label>
				<select id="s-sort" bind:value={form.sort}>
					<option value="date-asc">Oldest first</option>
					<option value="date-desc">Newest first</option>
					<option value="filename">File name</option>
				</select>
			</div>
			<div class="field">
				<label for="s-dl">Downloads</label>
				<select id="s-dl" bind:value={form.downloads}>
					<option value="none">Off</option>
					<option value="large">Large JPEG</option>
					<option value="original">Original files</option>
				</select>
			</div>
			<div class="field">
				<label for="s-loc">Locations on the map</label>
				<select id="s-loc" bind:value={form.location}>
					<option value="show">Exact</option>
					<option value="approximate">Approximate (about 1 km)</option>
					<option value="hide">Hidden</option>
				</select>
			</div>
			<div class="field check">
				<label
					><input type="checkbox" bind:checked={form.exifPanel} /> Show the info panel (camera, exposure,
					location)</label
				>
			</div>
			<div class="field check">
				<label
					><input type="checkbox" bind:checked={form.mapEnabled} /> Maps of photo locations</label
				>
			</div>

			<h2>Look</h2>
			<div class="field">
				<label for="s-mode">Theme</label>
				<select id="s-mode" bind:value={form.mode}>
					<option value="system">Follow the system</option>
					<option value="dark">Dark</option>
					<option value="light">Light</option>
				</select>
			</div>
			<div class="field">
				<label for="s-accent">Accent colour</label>
				<div class="row">
					<input id="s-accent" type="color" bind:value={form.accent} /><input
						bind:value={form.accent}
					/>
				</div>
			</div>
		</div>
	</div>
</section>

<style>
	.settings {
		max-width: 900px;
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin: 8px 0 20px;
	}
	.cols {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 40px;
	}
	h2 {
		margin: 18px 0 12px;
	}
	h2:first-child {
		margin-top: 0;
	}
	.hint {
		margin-top: 4px;
	}
	.check label {
		display: flex;
		gap: 8px;
		align-items: center;
		color: var(--text);
		font-size: 14px;
	}
	.check input {
		width: auto;
	}
	input[type='color'] {
		width: 44px;
		padding: 2px;
		height: 34px;
	}
</style>
