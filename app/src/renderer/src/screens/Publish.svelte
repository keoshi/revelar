<script lang="ts">
	import { onMount } from 'svelte';
	import { siCloudflare, siGithub, siNetlify, siVercel } from 'simple-icons';
	import type { PublishPhase } from '@index84/revelar';
	import type { PublishChoice, PublishTarget, PublishedSite } from '../../../shared/api.ts';
	import { engine, run, type SiteState } from '../lib/engine.svelte.ts';
	import { isHostAddress } from '../lib/address.ts';

	type Props = { site: SiteState };
	let { site }: Props = $props();

	type Provider = {
		label: string;
		icon: { path: string; hex: string };
		/** brand colour; monochrome marks follow the text colour */
		color: string;
		nameLabel: string;
		namePlaceholder: string;
		tokenLabel: string;
		tokenHelp: string;
		tokenUrl: string;
		needsAccount?: boolean;
		address: (name: string) => string;
	};
	const PROVIDERS: Record<PublishTarget, Provider> = {
		netlify: {
			label: 'Netlify',
			icon: siNetlify,
			color: '#00C7B7',
			nameLabel: 'Site name',
			namePlaceholder: 'my-photos',
			tokenLabel: 'personal access token',
			tokenHelp: 'User settings → Applications → Personal access tokens',
			tokenUrl: 'https://app.netlify.com/user/applications#personal-access-tokens',
			address: (n) => `${n || 'something-random'}.netlify.app`
		},
		vercel: {
			label: 'Vercel',
			icon: siVercel,
			color: 'var(--ink)',
			nameLabel: 'Project name',
			namePlaceholder: 'my-photos',
			tokenLabel: 'access token',
			tokenHelp: 'Account settings → Tokens',
			tokenUrl: 'https://vercel.com/account/tokens',
			address: (n) => `${n || 'my-photos'}.vercel.app`
		},
		cloudflare: {
			label: 'Cloudflare Pages',
			icon: siCloudflare,
			color: '#F38020',
			nameLabel: 'Project name',
			namePlaceholder: 'my-photos',
			tokenLabel: 'API token',
			tokenHelp: 'Profile → API tokens, with the "Cloudflare Pages: Edit" permission',
			tokenUrl: 'https://dash.cloudflare.com/profile/api-tokens',
			needsAccount: true,
			address: (n) => `${n || 'my-photos'}.pages.dev`
		},
		github: {
			label: 'GitHub Pages',
			icon: siGithub,
			color: 'var(--ink)',
			nameLabel: 'Repository name',
			namePlaceholder: 'my-photos',
			tokenLabel: 'personal access token',
			tokenHelp:
				'Settings → Developer settings → Tokens, with the "repo" scope. A public repository is created if needed.',
			tokenUrl: 'https://github.com/settings/tokens/new?scopes=repo&description=Revelar',
			address: (n) => `you.github.io/${n || 'my-photos'}`
		},
		spacefast: {
			label: 'Spacefast',
			// No mark in simple-icons: a four-point spark, monochrome like Vercel and GitHub.
			icon: {
				path: 'M12 1.5l2.6 7.9 7.9 2.6-7.9 2.6-2.6 7.9-2.6-7.9L1.5 12l7.9-2.6z',
				hex: '000000'
			},
			color: 'var(--ink)',
			nameLabel: 'Space name',
			namePlaceholder: 'my-photos',
			tokenLabel: 'API key',
			tokenHelp: 'Dashboard → API keys, with the "Space publisher" preset',
			tokenUrl: 'https://spacefast.com',
			address: (n) => `${n || 'my-photos'}.space.fast`
		}
	};
	/** Hosts that remember the site by id, so the name only counts when creating it. */
	const BY_ID: PublishChoice[] = ['netlify', 'spacefast'];
	const TARGETS: PublishTarget[] = ['spacefast', 'netlify', 'vercel', 'cloudflare', 'github'];
	/** The checklist the progress card shows, the same for every host. */
	const PHASES: { key: PublishPhase; label: string }[] = [
		{ key: 'process', label: 'Processing photos' },
		{ key: 'build', label: 'Building the site' },
		{ key: 'upload', label: 'Uploading' },
		{ key: 'live', label: 'Going live' }
	];

	let target = $state<PublishChoice>('spacefast');
	let token = $state('');
	let name = $state('');
	let account = $state('');
	let siteId = $state<string | undefined>();
	let liveUrl = $state('');
	// Set by a publish in this visit, so the box can say so rather than just "Live".
	let justPublished = $state(false);
	let error = $state('');
	let busy = $state(false);
	let sites = $state<Partial<Record<PublishChoice, PublishedSite>>>({});
	// Your own server: the address it will live at, and the last build made for it.
	let ownUrl = $state('');
	let built = $state<{ files: number; bytes: number } | undefined>();
	let zipped = $state('');
	let zipping = $state(false);

	const provider = $derived(target === 'own' ? PROVIDERS.netlify : PROVIDERS[target]);
	// A custom domain in the config is the owner's; a host-given one follows the publish target.
	const managed = $derived(isHostAddress(site.config.site.baseUrl));
	// Where this host serves the site: the last live address, else the one its name gives.
	const address = $derived(liveUrl || `https://${provider.address(name.trim())}`);
	const ownDomain = $derived(managed ? '' : site.config.site.baseUrl.replace(/^https?:\/\//, ''));

	async function select(t: PublishChoice) {
		target = t;
		error = '';
		justPublished = false;
		if (t === 'own') {
			const base = site.config.site.baseUrl;
			ownUrl = sites.own?.url ?? (isHostAddress(base) ? '' : base);
			return;
		}
		token = (await window.revelar.secrets.get(`${t}-token`)) ?? '';
		const saved = sites[t];
		name = saved?.name ?? '';
		account = saved?.account ?? '';
		siteId = saved?.siteId;
		liveUrl = saved?.url ?? '';
	}

	onMount(async () => {
		const settings = await window.revelar.settings.get();
		sites = settings.publish?.sites ?? {};
		if (!sites.netlify && settings.netlify)
			sites.netlify = {
				name: settings.netlify.siteName,
				siteId: settings.netlify.siteId,
				url: settings.netlify.url
			};
		await select(settings.publish?.target ?? 'spacefast');
	});

	async function makeFolder() {
		error = '';
		zipped = '';
		busy = true;
		try {
			const result = await run(
				'Making the site folder',
				() => engine.export(site.root, ownUrl.trim()),
				{ phases: PHASES.slice(0, 2) }
			);
			built = { files: result.files, bytes: result.bytes };
			ownUrl = result.baseUrl;
			sites = { ...sites, own: { url: result.baseUrl } };
			await window.revelar.settings.set({
				publish: { target, sites: $state.snapshot(sites) }
			});
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	async function saveZip() {
		error = '';
		zipping = true;
		try {
			zipped = (await window.revelar.saveZip()) ?? '';
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			zipping = false;
		}
	}

	const size = (bytes: number) =>
		bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1e6))} MB`;

	async function publish() {
		const host = target;
		if (host === 'own') return;
		error = '';
		busy = true;
		try {
			await window.revelar.secrets.set(`${target}-token`, token);
			const result = await run(
				`Publishing to ${provider.label}`,
				() =>
					engine.publish(site.root, {
						target: host,
						token,
						name: name.trim() || undefined,
						account: account.trim() || undefined,
						siteId
					}),
				{
					phases: PHASES.map((p) =>
						p.key === 'upload' ? { ...p, label: `Uploading to ${provider.label}` } : p
					)
				}
			);
			siteId = result.siteId;
			name = result.name;
			liveUrl = result.url;
			justPublished = true;
			sites = { ...sites, [target]: { name, siteId, url: liveUrl, account: account || undefined } };
			await window.revelar.settings.set({
				publish: { target, sites: $state.snapshot(sites) }
			});
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}
</script>

<section class="publish">
	<div>
		<h1>Publish</h1>
		<p class="hint">
			Pick a host. Each one serves static sites for free; all the app needs is a token from your
			account, kept encrypted on this computer. Or make the site as a folder to upload to a server
			of your own.
		</p>
	</div>

	<div class="tiles" role="radiogroup" aria-label="Host">
		{#each TARGETS as t (t)}
			{@const p = PROVIDERS[t]}
			<button
				type="button"
				class="tile"
				class:active={target === t}
				role="radio"
				aria-checked={target === t}
				disabled={busy}
				style:--brand={p.color}
				onclick={() => select(t)}
			>
				<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"
					><path d={p.icon.path} fill="currentColor" /></svg
				>
				<span>{p.label}</span>
				{#if sites[t]?.url}<span class="dot" title="Published before"></span>{/if}
			</button>
		{/each}
		<button
			type="button"
			class="tile"
			class:active={target === 'own'}
			role="radio"
			aria-checked={target === 'own'}
			disabled={busy}
			style:--brand="var(--accent)"
			onclick={() => select('own')}
		>
			<svg
				viewBox="0 0 24 24"
				width="28"
				height="28"
				fill="none"
				stroke="currentColor"
				stroke-width="1.6"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
				><rect x="3" y="5" width="18" height="6" rx="1.5" /><rect
					x="3"
					y="13"
					width="18"
					height="6"
					rx="1.5"
				/><path d="M7 8h.01M7 16h.01" /></svg
			>
			<span>Your own server</span>
			{#if sites.own?.url}<span class="dot" title="Made before"></span>{/if}
		</button>
	</div>

	{#key target}
		{#if target === 'own'}
			<div class="form rise">
				<div class="field">
					<label for="own-url">Site address</label>
					<input
						id="own-url"
						type="url"
						bind:value={ownUrl}
						placeholder="https://photos.example.com"
						autocomplete="off"
					/>
					<p class="hint">
						Where you will upload it. A folder on a site works too, like https://example.com/photos.
						Shared links, the sitemap and feeds point at it.
					</p>
				</div>

				{#if built}
					<p class="address">
						<span class="hint">Ready to upload</span>
						<strong>{built.files.toLocaleString()} files, {size(built.bytes)}</strong>
						<span class="hint">
							Upload everything inside the build folder to your server, at the address above. Make
							it again after changing photos or settings.
						</span>
					</p>
				{/if}

				<div class="row">
					<button
						type="button"
						class="primary"
						disabled={!ownUrl.trim() || busy}
						onclick={makeFolder}>{built ? 'Make it again' : 'Make the site folder'}</button
					>
					{#if built}
						<button type="button" onclick={() => window.revelar.showBuild()}>Show in Finder</button>
						<button type="button" disabled={zipping} onclick={saveZip}
							>{zipping ? 'Saving…' : 'Save as zip…'}</button
						>
					{/if}
				</div>
				{#if zipped}<p class="hint">Saved {zipped}</p>{/if}
				{#if error}<p class="error">{error}</p>{/if}
			</div>
		{:else}
			<div class="form rise">
				<div class="field">
					<label for="token">{provider.label} {provider.tokenLabel}</label>
					<input id="token" type="password" bind:value={token} autocomplete="off" />
					<p class="hint">
						{provider.tokenHelp}.
						<button
							type="button"
							class="link inline ext"
							onclick={() => window.revelar.openExternal(provider.tokenUrl)}>Get one</button
						>
					</p>
				</div>
				{#if provider.needsAccount}
					<div class="field">
						<label for="account">Account ID</label>
						<input
							id="account"
							bind:value={account}
							placeholder="32 hex characters, on the dashboard's overview page"
						/>
					</div>
				{/if}
				<div class="field">
					<label for="name">{provider.nameLabel}</label>
					<input
						id="name"
						bind:value={name}
						placeholder={provider.namePlaceholder}
						disabled={BY_ID.includes(target) && Boolean(siteId)}
					/>
					{#if BY_ID.includes(target) && siteId}
						<p class="hint">
							Publishing updates the existing site.
							<button type="button" class="link inline" onclick={() => (siteId = undefined)}
								>Create a new one instead</button
							>
						</p>
					{/if}
				</div>

				<div class="address" class:live={liveUrl}>
					<span class="status">
						{#if liveUrl}
							<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"
								><circle cx="8" cy="8" r="8" fill="currentColor" /><path
									d="M4.8 8.3l2.1 2.1 4.3-4.6"
									fill="none"
									stroke="var(--surface)"
									stroke-width="1.8"
									stroke-linecap="round"
									stroke-linejoin="round"
								/></svg
							>
							{justPublished ? 'Your site is live' : 'Live at'}
						{:else}
							<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"
								><circle
									cx="8"
									cy="8"
									r="6.5"
									fill="none"
									stroke="currentColor"
									stroke-width="1.5"
									stroke-dasharray="2.5 2.6"
								/></svg
							>
							Will be live at
						{/if}
					</span>
					{#if liveUrl}
						<a
							class="url"
							href={liveUrl}
							title="Open in your browser"
							onclick={(e) => {
								e.preventDefault();
								window.revelar.openExternal(liveUrl);
							}}
							>{address.replace(/^https?:\/\//, '')}<svg
								viewBox="0 0 12 12"
								width="11"
								height="11"
								aria-hidden="true"
								><path
									d="M4 2.5h5.5V8M9.5 2.5 2.5 9.5"
									fill="none"
									stroke="currentColor"
									stroke-width="1.5"
									stroke-linecap="round"
									stroke-linejoin="round"
								/></svg
							></a
						>
					{:else}
						<span class="url">{address.replace(/^https?:\/\//, '')}</span>
					{/if}
					<span class="hint">
						{#if managed}
							This copy's shared links, sitemap and feed point here. Each host you publish to gets
							links of its own.
						{:else}
							Shared links, the sitemap and the feed use your own domain, {ownDomain}, so every copy
							sends people and search engines there. Point it at {provider.label}, or clear it in
							Site settings to give each copy its own links.
						{/if}
					</span>
				</div>

				<div class="row">
					<button
						type="button"
						class="primary"
						disabled={!token || busy || (provider.needsAccount && !account)}
						onclick={publish}>{liveUrl ? 'Publish update' : 'Publish'}</button
					>
				</div>
				{#if error}<p class="error">{error}</p>{/if}
			</div>
		{/if}
	{/key}
</section>

<style>
	.publish {
		max-width: 620px;
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	.publish h1 {
		margin-bottom: 4px;
	}
	.tiles {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 10px;
	}
	.tile {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		padding: 16px 8px 12px;
		border-radius: 12px;
		color: var(--muted);
		font-size: 13px;
		transition:
			color 150ms,
			background 150ms,
			box-shadow 150ms,
			transform 200ms var(--ease);
	}
	.tile svg {
		transition: color 150ms;
	}
	.tile:hover {
		color: var(--ink);
		transform: translateY(-1px);
	}
	.tile.active {
		color: var(--ink);
		background: var(--surface);
		box-shadow: 0 0 0 2px var(--accent);
	}
	.tile.active svg {
		color: var(--brand);
	}
	.dot {
		position: absolute;
		top: 9px;
		right: 9px;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--ok);
	}
	.form {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.field .hint {
		margin-top: 5px;
	}
	.link.inline {
		padding: 0;
		font-size: inherit;
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.address {
		display: flex;
		flex-direction: column;
		gap: 3px;
		padding: 12px 14px;
		margin: 4px 0 16px;
		background: var(--surface);
		border-radius: 12px;
	}
	.address .url {
		align-self: flex-start;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		max-width: 100%;
		margin: 1px 0 2px;
		overflow-wrap: anywhere;
		user-select: text;
		color: var(--ink);
		font: 500 13px var(--f-mono);
		letter-spacing: -0.01em;
	}
	a.url {
		text-decoration: none;
		border-radius: 4px;
		transition: color 150ms;
	}
	a.url svg {
		flex: none;
		color: var(--ok);
		transition: transform 200ms var(--ease);
	}
	a.url:hover {
		color: var(--ok);
	}
	a.url:hover svg {
		transform: translate(1px, -1px);
	}
	a.url:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 3px;
	}
	.address.live {
		background: color-mix(in srgb, var(--ok) 10%, var(--surface));
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ok) 35%, transparent);
	}
	.status {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--muted);
		font-size: 12.5px;
		font-weight: 500;
	}
	.live .status {
		color: var(--ok);
		font-weight: 600;
	}
</style>
