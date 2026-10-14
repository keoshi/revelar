<script lang="ts">
	import { engine, type SiteState } from '../lib/engine.svelte.ts';

	type Props = {
		site: SiteState;
		onSaved: (config: SiteState['config']) => void;
		onBack: () => void;
	};
	let { site, onSaved, onBack }: Props = $props();

	// The form starts from the config as it is when the screen opens; Save writes it back.
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
	<header class="head">
		<div>
			<button type="button" class="link back" onclick={onBack}>← Library</button>
			<h1>Site settings</h1>
			<p class="muted small">{site.root}/revelar.config.ts</p>
		</div>
		<button type="button" class="primary" class:saved onclick={save}
			>{saved ? 'Saved' : 'Save'}</button
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
					<p class="muted small hint">
						Filled in when you publish. Set it yourself only for your own domain.
					</p>
				</div>
			</div>
			<div class="r">
				<label for="s-lang">Language</label><input
					id="s-lang"
					bind:value={form.language}
					placeholder="en"
				/>
			</div>

			<h2>You</h2>
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
				<label for="s-copy">Copyright</label><input id="s-copy" bind:value={form.copyright} />
			</div>
		</div>

		<div class="col">
			<h2>
				Defaults for every album <span class="muted small">each album can override these</span>
			</h2>
			<div class="r">
				<label for="s-sort">Photo order</label>
				<select id="s-sort" bind:value={form.sort}>
					<option value="date-asc">Oldest first</option>
					<option value="date-desc">Newest first</option>
					<option value="filename">File name</option>
				</select>
			</div>
			<div class="r">
				<label for="s-dl">Downloads</label>
				<select id="s-dl" bind:value={form.downloads}>
					<option value="none">Off</option>
					<option value="large">Large JPEG</option>
					<option value="original">Original files</option>
				</select>
			</div>
			<div class="r">
				<label for="s-loc">Locations</label>
				<select id="s-loc" bind:value={form.location}>
					<option value="show">Exact</option>
					<option value="approximate">Approximate (about 1 km)</option>
					<option value="hide">Hidden</option>
				</select>
			</div>
			<div class="r">
				<span></span>
				<label class="check"
					><input type="checkbox" bind:checked={form.exifPanel} /> Info panel (camera, exposure, place)</label
				>
			</div>
			<div class="r">
				<span></span>
				<label class="check"
					><input type="checkbox" bind:checked={form.mapEnabled} /> Maps of photo locations</label
				>
			</div>

			<h2>Look</h2>
			<div class="r">
				<label for="s-mode">Theme</label>
				<select id="s-mode" bind:value={form.mode}>
					<option value="system">Follow the system</option>
					<option value="dark">Dark</option>
					<option value="light">Light</option>
				</select>
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
		margin: 0 0 18px;
	}
	.back {
		padding-left: 0;
		margin-bottom: 2px;
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
		margin: 14px 0 10px;
		display: flex;
		align-items: baseline;
		gap: 10px;
	}
	h2 .small {
		font-weight: 400;
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
	.r > span {
		margin: 0;
		font-size: 13px;
		text-align: right;
	}
	.hint {
		margin-top: 4px;
	}
	.check {
		display: flex;
		gap: 8px;
		align-items: center;
		color: var(--text);
		font-size: 13px;
		text-align: left;
	}
	.check input {
		width: auto;
		margin: 0;
	}
	input[type='color'] {
		width: 44px;
		padding: 2px;
		height: 34px;
	}
	.hex {
		width: 120px;
	}
</style>
