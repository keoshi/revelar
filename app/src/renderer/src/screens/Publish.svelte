<script lang="ts">
	import { onMount } from 'svelte';
	import { engine, run, type SiteState } from '../lib/engine.svelte.ts';

	type Props = { site: SiteState };
	let { site }: Props = $props();

	let token = $state('');
	let siteName = $state('');
	let siteId = $state<string | undefined>();
	let liveUrl = $state('');
	let error = $state('');
	let busy = $state(false);

	onMount(async () => {
		token = (await window.revelar.secrets.get('netlify-token')) ?? '';
		const settings = await window.revelar.settings.get();
		siteId = settings.netlify?.siteId;
		siteName = settings.netlify?.siteName ?? '';
		liveUrl = settings.netlify?.url ?? '';
	});

	async function publish() {
		error = '';
		busy = true;
		try {
			await window.revelar.secrets.set('netlify-token', token);
			await run('Processing photos', () => engine.ingest(site.root));
			await run('Building the site', () => engine.build(site.root));
			const result = await run('Publishing to Netlify', () =>
				engine.publishNetlify(site.root, token, siteId, siteName || undefined)
			);
			siteId = result.siteId;
			siteName = result.siteName;
			liveUrl = result.url;
			await window.revelar.settings.set({ netlify: { siteId, siteName, url: liveUrl } });
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}
</script>

<section class="publish">
	<h1>Publish</h1>
	<p class="muted">
		Netlify hosts static sites for free. Create a personal access token under <em
			>User settings → Applications</em
		>
		on app.netlify.com and paste it here; it is stored encrypted on this computer only.
	</p>
	<div class="field">
		<label for="token">Netlify personal access token</label><input
			id="token"
			type="password"
			bind:value={token}
		/>
	</div>
	<div class="field">
		<label for="name">Site name</label>
		<input
			id="name"
			bind:value={siteName}
			placeholder="my-photos (becomes my-photos.netlify.app)"
			disabled={Boolean(siteId)}
		/>
		{#if siteId}<p class="muted small">
				Publishing updates the existing site. <button
					type="button"
					class="link"
					onclick={() => (siteId = undefined)}>Create a new one instead</button
				>
			</p>{/if}
	</div>
	<div class="row">
		<button type="button" class="primary" disabled={!token || busy} onclick={publish}
			>{siteId ? 'Publish update' : 'Publish'}</button
		>
		{#if liveUrl}<button type="button" onclick={() => window.revelar.openExternal(liveUrl)}
				>Open {liveUrl.replace(/^https?:\/\//, '')}</button
			>{/if}
	</div>
	{#if error}<p class="error">{error}</p>{/if}
	<p class="muted small note">
		After publishing, set <code>site.baseUrl</code> in revelar.config.ts to the live address so shared
		links and the sitemap point at it, then publish again.
	</p>
</section>

<style>
	.publish {
		max-width: 560px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.note {
		margin-top: 12px;
	}
	code {
		user-select: text;
	}
</style>
