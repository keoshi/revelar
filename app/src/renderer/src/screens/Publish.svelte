<script lang="ts">
	import { onMount } from 'svelte';
	import { siCloudflare, siGithub, siNetlify, siVercel } from 'simple-icons';
	import type { PublishTarget, PublishedSite } from '../../../shared/api.ts';
	import { engine, run, type SiteState } from '../lib/engine.svelte.ts';

	type Props = { site: SiteState; onPublished: (baseUrl: string) => void };
	let { site, onPublished }: Props = $props();

	type Provider = {
		label: string;
		icon: { path: string; hex: string };
		/** brand colour on dark; black marks stay white */
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
			tokenLabel: 'Personal access token',
			tokenHelp: 'User settings → Applications → Personal access tokens',
			tokenUrl: 'https://app.netlify.com/user/applications#personal-access-tokens',
			address: (n) => `${n || 'something-random'}.netlify.app`
		},
		vercel: {
			label: 'Vercel',
			icon: siVercel,
			color: '#ffffff',
			nameLabel: 'Project name',
			namePlaceholder: 'my-photos',
			tokenLabel: 'Access token',
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
			color: '#ffffff',
			nameLabel: 'Repository name',
			namePlaceholder: 'my-photos',
			tokenLabel: 'Personal access token',
			tokenHelp:
				'Settings → Developer settings → Tokens, with the "repo" scope. A public repository is created if needed.',
			tokenUrl: 'https://github.com/settings/tokens/new?scopes=repo&description=Revelar',
			address: (n) => `you.github.io/${n || 'my-photos'}`
		}
	};
	const TARGETS = Object.keys(PROVIDERS) as PublishTarget[];

	let target = $state<PublishTarget>('netlify');
	let token = $state('');
	let name = $state('');
	let account = $state('');
	let siteId = $state<string | undefined>();
	let liveUrl = $state('');
	let error = $state('');
	let busy = $state(false);
	let sites = $state<Partial<Record<PublishTarget, PublishedSite>>>({});

	const provider = $derived(PROVIDERS[target]);
	// A custom domain in the config is the owner's; a host-given one follows the publish target.
	const managed = $derived(isManaged(site.config.site.baseUrl));
	const address = $derived(
		managed ? `https://${provider.address(name.trim())}` : site.config.site.baseUrl
	);

	function isManaged(url: string): boolean {
		if (!url) return true;
		try {
			const host = new URL(url).hostname;
			return (
				host === 'photos.example.com' ||
				/\.(netlify\.app|vercel\.app|pages\.dev|github\.io)$/.test(host)
			);
		} catch {
			return true;
		}
	}

	async function select(t: PublishTarget) {
		target = t;
		error = '';
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
		await select(settings.publish?.target ?? 'netlify');
	});

	async function publish() {
		error = '';
		busy = true;
		try {
			await window.revelar.secrets.set(`${target}-token`, token);
			const result = await run(`Publishing to ${provider.label}`, () =>
				engine.publish(site.root, {
					target,
					token,
					name: name.trim() || undefined,
					account: account.trim() || undefined,
					siteId
				})
			);
			siteId = result.siteId;
			name = result.name;
			liveUrl = result.url;
			sites = { ...sites, [target]: { name, siteId, url: liveUrl, account: account || undefined } };
			await window.revelar.settings.set({
				publish: { target, sites: $state.snapshot(sites) }
			});
			onPublished(result.baseUrl);
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
		Pick a host. Each one serves static sites for free; all the app needs is a token from your
		account, kept encrypted on this computer.
	</p>

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
	</div>

	{#key target}
		<div class="form rise">
			<div class="field">
				<label for="token">{provider.label} {provider.tokenLabel.toLowerCase()}</label>
				<input id="token" type="password" bind:value={token} autocomplete="off" />
				<p class="muted small hint">
					{provider.tokenHelp}.
					<button
						type="button"
						class="link inline"
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
					disabled={target === 'netlify' && Boolean(siteId)}
				/>
				{#if target === 'netlify' && siteId}
					<p class="muted small hint">
						Publishing updates the existing site.
						<button type="button" class="link inline" onclick={() => (siteId = undefined)}
							>Create a new one instead</button
						>
					</p>
				{/if}
			</div>

			<p class="address">
				<span class="muted small">Site address</span>
				<strong>{address}</strong>
				<span class="muted small">
					{#if managed}
						Set in the site's config for you when you publish, so shared links and the sitemap point
						at it.
					{:else}
						Your own domain, from Site settings. Point it at the host after publishing.
					{/if}
				</span>
			</p>

			<div class="row">
				<button
					type="button"
					class="primary"
					disabled={!token || busy || (provider.needsAccount && !account)}
					onclick={publish}>{liveUrl ? 'Publish update' : 'Publish'}</button
				>
				{#if liveUrl}<button type="button" onclick={() => window.revelar.openExternal(liveUrl)}
						>Open {liveUrl.replace(/^https?:\/\//, '')}</button
					>{/if}
			</div>
			{#if error}<p class="error">{error}</p>{/if}
		</div>
	{/key}
</section>

<style>
	.publish {
		max-width: 620px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.tiles {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 10px;
		margin: 4px 0 6px;
	}
	.tile {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		padding: 16px 8px 12px;
		background: var(--surface);
		border: 1px solid var(--hairline);
		color: var(--text-muted);
		font-size: 13px;
		transition:
			color 160ms var(--ease),
			border-color 160ms var(--ease),
			background 160ms var(--ease),
			transform 160ms var(--ease);
	}
	.tile svg {
		transition: color 160ms var(--ease);
	}
	.tile:hover {
		color: var(--text);
		background: var(--surface-2);
		transform: translateY(-1px);
	}
	.tile.active {
		color: var(--text);
		border-color: var(--accent);
		background: var(--surface-2);
	}
	.tile.active svg {
		color: var(--brand);
	}
	.dot {
		position: absolute;
		top: 8px;
		right: 8px;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--accent);
	}
	.form {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.hint {
		margin-top: 4px;
	}
	.link.inline {
		padding: 0;
		font-size: inherit;
		color: var(--accent);
	}
	.address {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 12px 14px;
		margin: 4px 0 14px;
		background: var(--surface);
		border-radius: var(--radius);
	}
	.address strong {
		user-select: text;
		font-weight: 500;
	}
</style>
