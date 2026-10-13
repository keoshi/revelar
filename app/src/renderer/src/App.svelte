<script lang="ts">
	import { onMount } from 'svelte';
	import {
		engine,
		activity,
		watchEvents,
		type Screen,
		type SiteState
	} from './lib/engine.svelte.ts';
	import Welcome from './screens/Welcome.svelte';
	import Library from './screens/Library.svelte';
	import Album from './screens/Album.svelte';
	import Preview from './screens/Preview.svelte';
	import Publish from './screens/Publish.svelte';
	import StatusBar from './screens/StatusBar.svelte';

	let site = $state<SiteState | undefined>();
	let screen = $state<Screen>('welcome');
	let albumSlug = $state<string | undefined>();
	let error = $state<string | undefined>();

	async function openSite(root: string) {
		error = undefined;
		const result = await engine.open(root);
		if (!result.isSite) {
			error = `${root} is not a Revelar site yet.`;
			return false;
		}
		await window.revelar.setRoot(root);
		site = { root, config: result.config!, albums: result.albums! };
		await window.revelar.settings.set({ lastRoot: root });
		screen = 'library';
		return true;
	}

	async function createSite(root: string) {
		await engine.init(root);
		return openSite(root);
	}

	async function refreshAlbums() {
		if (!site) return;
		site.albums = await engine.albums(site.root);
	}

	function go(to: Screen, slug?: string) {
		albumSlug = slug;
		screen = to;
	}

	onMount(() => {
		const stop = watchEvents();
		void (async () => {
			const settings = await window.revelar.settings.get();
			if (settings.lastRoot) {
				try {
					await openSite(settings.lastRoot);
				} catch {
					/* the folder may be gone; stay on the welcome screen */
				}
			}
		})();
		return stop;
	});
</script>

<div class="shell">
	<header class="top drag">
		<div class="brand">Revelar</div>
		{#if site}
			<nav class="no-drag">
				<button
					type="button"
					class="link"
					class:active={screen === 'library'}
					onclick={() => go('library')}>Library</button
				>
				<button
					type="button"
					class="link"
					class:active={screen === 'preview'}
					onclick={() => go('preview')}>Preview</button
				>
				<button
					type="button"
					class="link"
					class:active={screen === 'publish'}
					onclick={() => go('publish')}>Publish</button
				>
			</nav>
			<div class="site-name no-drag">
				<span class="muted small">{site.config.site.title}</span>
				<button
					type="button"
					class="link small"
					onclick={() => ((site = undefined), (screen = 'welcome'))}>Switch site</button
				>
			</div>
		{/if}
	</header>

	<main>
		{#if error}<p class="error banner">{error}</p>{/if}
		{#if !site || screen === 'welcome'}
			<Welcome onOpen={openSite} onCreate={createSite} />
		{:else if screen === 'library'}
			<Library
				{site}
				onOpenAlbum={(slug) => go('album', slug)}
				onChanged={refreshAlbums}
				onPreview={() => go('preview')}
			/>
		{:else if screen === 'album' && albumSlug}
			<Album {site} slug={albumSlug} onBack={() => (refreshAlbums(), go('library'))} />
		{:else if screen === 'preview'}
			<Preview {site} />
		{:else if screen === 'publish'}
			<Publish {site} />
		{/if}
	</main>

	{#if activity.busy || activity.log.length}
		<StatusBar />
	{/if}
</div>

<style>
	.shell {
		display: flex;
		flex-direction: column;
		height: 100%;
	}
	.top {
		display: flex;
		align-items: center;
		gap: 24px;
		padding: 0 16px 0 84px;
		height: 46px;
		border-bottom: 1px solid var(--hairline);
		background: var(--surface);
	}
	.brand {
		font-weight: 600;
	}
	nav {
		display: flex;
		gap: 4px;
	}
	nav .active {
		color: var(--text);
		background: var(--surface-2);
		border-radius: var(--radius);
	}
	.site-name {
		margin-left: auto;
		display: flex;
		gap: 8px;
		align-items: center;
	}
	main {
		flex: 1;
		overflow: auto;
		padding: 24px;
	}
	.banner {
		margin-bottom: 12px;
	}
</style>
