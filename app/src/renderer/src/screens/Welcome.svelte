<script lang="ts">
	import { fly } from 'svelte/transition';
	// The illustrations are plain SVG files in ../art, easy to redraw; they use the app's CSS
	// variables (--surface, --text-muted, --accent) for colour.
	import artFolder from '../art/step-folder.svg?raw';
	import artAlbums from '../art/step-albums.svg?raw';
	import artPublish from '../art/step-publish.svg?raw';

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
		<h1>Turn a folder of photos into a website.</h1>
		<p class="lead muted">
			Everything stays on your computer until you publish. No account needed.
		</p>
	</div>

	<ol class="steps">
		{#each STEPS as step, i (step.title)}
			<li in:fly={{ y: 16, duration: 400, delay: 140 + i * 110 }}>
				<div class="art" aria-hidden="true">
					<!-- eslint-disable-next-line svelte/no-at-html-tags -- bundled SVG files, not user content -->
					{@html step.art}
				</div>
				<div class="copy">
					<span class="num">{i + 1}</span>
					<strong>{step.title}</strong>
					<p class="muted small">{step.text}</p>
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
				<span class="muted small">Or continue with</span>
				{#each recent as root (root)}
					<button
						type="button"
						class="recent"
						disabled={busy}
						onclick={() => go(() => onOpen(root))}
						title={root}
					>
						<span class="name">{root.split('/').pop()}</span>
						<span class="path muted small">{short(root)}</span>
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
		margin: 6vh auto 0;
		display: flex;
		flex-direction: column;
		gap: 28px;
	}
	h1 {
		font-size: 32px;
		letter-spacing: -0.02em;
	}
	.lead {
		font-size: 15px;
		margin-top: 6px;
	}
	.steps {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 14px;
	}
	.steps li {
		display: flex;
		flex-direction: column;
		background: var(--surface);
		border-radius: 10px;
		overflow: hidden;
		transition: transform 220ms var(--ease);
	}
	.steps li:hover {
		transform: translateY(-2px);
	}
	.art {
		background: var(--surface-2);
		padding: 8px 0 0;
	}
	.art :global(svg) {
		display: block;
		width: 100%;
		height: auto;
	}
	.copy {
		padding: 14px 16px 16px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.num {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		background: var(--surface-2);
		color: var(--accent);
		font-size: 11px;
		font-weight: 600;
		margin-bottom: 4px;
	}
	.actions {
		display: flex;
		flex-direction: column;
		gap: 14px;
		align-items: flex-start;
	}
	.big {
		padding: 11px 20px;
		font-size: 15px;
	}
	.secondary {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
	}
	.secondary .small {
		margin-right: 4px;
	}
	.recent {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0;
		padding: 6px 12px;
		text-align: left;
		background: var(--surface);
	}
	.recent:hover {
		background: var(--surface-2);
	}
	.recent .name {
		font-weight: 500;
	}
</style>
