<script lang="ts">
	import { fly } from 'svelte/transition';
	// The illustrations are plain SVG files in ../art, easy to redraw; they use the app's CSS
	// variables (--bg, --muted, --accent) for colour.
	import artFolder from '../art/step-folder.svg?raw';
	import artAlbums from '../art/step-albums.svg?raw';
	import artPublish from '../art/step-publish.svg?raw';
	import Mark from '../lib/Mark.svelte';

	type Props = {
		recent: string[];
		onOpen: (root: string) => Promise<boolean>;
		onCreate: (root: string) => Promise<boolean>;
	};
	let { recent, onOpen, onCreate }: Props = $props();
	let busy = $state(false);
	let message = $state('');

	const STEPS = [
		{
			art: artFolder,
			title: 'Pick a folder',
			text: 'Choose an empty folder. Its name becomes the name of the site.'
		},
		{
			art: artAlbums,
			title: 'Add albums',
			text: 'Put folders of photos inside it. Each folder becomes an album.'
		},
		{
			art: artPublish,
			title: 'Preview, then publish',
			text: 'Check how it looks, then put it online. Netlify, Vercel, Cloudflare and GitHub host it for free.'
		}
	];

	async function go(fn: () => Promise<boolean>) {
		busy = true;
		message = '';
		try {
			const ok = await fn();
			if (!ok)
				message =
					'That folder has no revelar.config.ts yet. Try "Create a new site" there instead.';
		} catch (e) {
			message = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}
	async function create() {
		const root = await window.revelar.pickFolder('Choose an empty folder for your site');
		if (root) await go(() => onCreate(root));
	}
	async function browse() {
		const root = await window.revelar.pickFolder('Open a site folder');
		if (root) await go(() => onOpen(root));
	}
	const short = (root: string) => root.replace(/^\/Users\/[^/]+/, '~');
</script>

<section class="welcome">
	<div class="hero" in:fly={{ y: 12, duration: 360 }}>
		<Mark height={34} label="Revelar" />
		<p class="lead">
			Turn a folder of photos into a website.
			<span>Everything stays on your computer until you publish. No account needed.</span>
		</p>
	</div>

	<ol class="steps">
		{#each STEPS as step, i (step.title)}
			<li in:fly={{ y: 16, duration: 400, delay: 140 + i * 110 }}>
				<div class="art board" aria-hidden="true">
					<!-- eslint-disable-next-line svelte/no-at-html-tags -- bundled SVG files, not user content -->
					{@html step.art}
				</div>
				<div class="copy">
					<strong><span class="num">{i + 1}</span>{step.title}</strong>
					<p class="hint">{step.text}</p>
				</div>
			</li>
		{/each}
	</ol>

	<div class="actions" in:fly={{ y: 14, duration: 360, delay: 520 }}>
		<button type="button" class="primary big" disabled={busy} onclick={create}
			>Create a new site</button
		>
		<div class="secondary">
			{#if recent.length}
				<span class="hint">Or continue with</span>
				{#each recent as root (root)}
					<button
						type="button"
						class="recent"
						disabled={busy}
						onclick={() => go(() => onOpen(root))}
						title={root}
					>
						<span class="name">{root.split('/').pop()}</span>
						<span class="path">{short(root)}</span>
					</button>
				{/each}
			{/if}
			<button type="button" class="link" disabled={busy} onclick={browse}
				>Open another folder…</button
			>
		</div>
	</div>
	{#if message}<p class="error">{message}</p>{/if}
</section>

<style>
	.welcome {
		max-width: 760px;
		margin: 5vh auto 0;
		display: flex;
		flex-direction: column;
		gap: 32px;
	}
	.hero {
		display: flex;
		flex-direction: column;
		gap: 22px;
		color: var(--accent);
	}
	.lead {
		font: 500 24px/1.3 var(--f-body);
		letter-spacing: -0.02em;
		text-wrap: balance;
		color: var(--ink);
	}
	.lead span {
		display: block;
		color: var(--muted);
	}
	.steps {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 20px;
	}
	.steps li {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.art {
		padding: 10px 6px 4px;
		transition: transform 250ms var(--ease);
	}
	.steps li:hover .art {
		transform: translateY(-2px);
	}
	.art :global(svg) {
		display: block;
		width: 100%;
		height: auto;
	}
	.copy {
		display: flex;
		flex-direction: column;
		gap: 3px;
		padding: 0 2px;
	}
	.copy strong {
		font-weight: 500;
		font-size: 13px;
	}
	.num {
		font: 500 12px var(--f-mono);
		color: var(--muted);
		margin-right: 8px;
	}
	.actions {
		display: flex;
		flex-direction: column;
		gap: 14px;
		align-items: flex-start;
	}
	.big {
		padding: 12px 18px;
		font-size: 14px;
	}
	.secondary {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
	}
	.secondary .hint {
		margin-right: 4px;
	}
	.recent {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		padding: 7px 12px;
		text-align: left;
	}
	.recent .path {
		font: 11.5px var(--f-mono);
		color: var(--muted);
	}
</style>
