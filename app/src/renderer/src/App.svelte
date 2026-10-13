<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import {
		engine,
		activity,
		watchEvents,
		onSiteChanged,
		type Screen,
		type SiteState
	} from './lib/engine.svelte.ts';
	import Welcome from './screens/Welcome.svelte';
	import Library from './screens/Library.svelte';
	import Album from './screens/Album.svelte';
	import Preview from './screens/Preview.svelte';
	import Publish from './screens/Publish.svelte';
	import Settings from './screens/Settings.svelte';
	import SiteMenu from './screens/SiteMenu.svelte';
	import StatusBar from './screens/StatusBar.svelte';

	let site = $state<SiteState | undefined>();
	let screen = $state<Screen>('welcome');
	let albumSlug = $state<string | undefined>();
	let recent = $state<string[]>([]);
	let error = $state<string | undefined>();

	async function openSite(root: string) {
		error = undefined;
		const result = await engine.open(root);
		if (!result.isSite) return false;
		await window.revelar.setRoot(root);
		site = { root, config: result.config!, albums: result.albums! };
		recent = [root, ...recent.filter((r) => r !== root)].slice(0, 6);
		// Reactive state is a proxy; IPC needs a plain, cloneable value.
		await window.revelar.settings.set({ lastRoot: root, recentRoots: $state.snapshot(recent) });
		screen = 'library';
		return true;
	}

	async function createSite(root: string) {
		await engine.init(root);
		return openSite(root);
	}

	async function browse() {
		const root = await window.revelar.pickFolder('Open a site folder');
		if (!root) return;
		if (!(await openSite(root)))
			error = `${root} is not a Revelar site: it has no revelar.config.ts.`;
	}
	async function create() {
		const root = await window.revelar.pickFolder('Choose an empty folder for your site');
		if (root) await createSite(root);
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
		const stopSite = onSiteChanged(() => void refreshAlbums());
		void (async () => {
			const settings = await window.revelar.settings.get();
			recent = settings.recentRoots ?? (settings.lastRoot ? [settings.lastRoot] : []);
			if (settings.lastRoot) {
				try {
					await openSite(settings.lastRoot);
				} catch (e) {
					// The folder may be gone; stay on the welcome screen.
					console.error('Could not reopen the last site', e);
				}
			}
		})();
		return () => {
			stop();
			stopSite();
		};
	});
</script>

<div class="shell">
	<header class="top drag">
		<div class="brand">Revelar</div>
		{#if site}
			<nav class="no-drag">
				<button
					type="button"
					class="tab"
					class:active={screen === 'library' || screen === 'album'}
					onclick={() => go('library')}>Library</button
				>
				<button
					type="button"
					class="tab"
					class:active={screen === 'preview'}
					onclick={() => go('preview')}>Preview</button
				>
				<button
					type="button"
					class="tab"
					class:active={screen === 'publish'}
					onclick={() => go('publish')}>Publish</button
				>
			</nav>
			<div class="right">
				<SiteMenu
					title={site.config.site.title}
					root={site.root}
					{recent}
					onSettings={() => go('settings')}
					onOpen={(r) => void openSite(r)}
					onBrowse={browse}
					onCreate={create}
				/>
			</div>
		{/if}
	</header>

	<main>
		{#if error}<p class="error banner">{error}</p>{/if}
		{#key site ? screen + (albumSlug ?? '') : 'welcome'}
			<div class="screen" in:fade={{ duration: 180, delay: 40 }}>
				{#if !site || screen === 'welcome'}
					<Welcome {recent} onOpen={openSite} onCreate={createSite} />
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
				{:else if screen === 'settings'}
					<Settings
						{site}
						onSaved={(config) => (site!.config = config)}
						onBack={() => go('library')}
					/>
				{/if}
			</div>
		{/key}
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
		gap: 20px;
		padding: 0 14px 0 92px;
		height: 46px;
		border-bottom: 1px solid var(--hairline);
		background: var(--surface);
	}
	.brand {
		font-weight: 600;
		letter-spacing: -0.01em;
	}
	nav {
		display: flex;
		gap: 2px;
	}
	.tab {
		background: none;
		border-color: transparent;
		color: var(--text-muted);
		padding: 5px 10px;
		transition:
			color 160ms var(--ease),
			background 160ms var(--ease);
	}
	.tab:hover {
		color: var(--text);
		background: var(--surface-2);
	}
	.tab.active {
		color: var(--text);
		background: var(--surface-2);
	}
	.right {
		margin-left: auto;
	}
	main {
		flex: 1;
		overflow: auto;
		padding: 24px;
	}
	.screen {
		height: 100%;
	}
	.banner {
		margin-bottom: 12px;
	}
</style>
