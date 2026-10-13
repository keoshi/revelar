<script lang="ts">
	import { fly } from 'svelte/transition';

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
			title: 'Pick a folder',
			text: 'An empty folder becomes your site. Keep it anywhere, Dropbox included.'
		},
		{
			title: 'Add albums',
			text: 'Drop folders of photos into it. Each folder is an album; titles and captions come along.'
		},
		{
			title: 'Preview and publish',
			text: 'See the site as visitors will, then put it online with one click.'
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
		<h1>Your photos, as a website.</h1>
		<p class="lead muted">No account, no server. A folder of photos in, a fast gallery out.</p>
	</div>

	<ol class="steps">
		{#each STEPS as step, i (step.title)}
			<li in:fly={{ y: 14, duration: 360, delay: 120 + i * 90 }}>
				<span class="num">{i + 1}</span>
				<div>
					<strong>{step.title}</strong>
					<p class="muted">{step.text}</p>
				</div>
			</li>
		{/each}
	</ol>

	<div class="actions" in:fly={{ y: 14, duration: 360, delay: 420 }}>
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
		max-width: 560px;
		margin: 9vh auto 0;
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
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.steps li {
		display: flex;
		gap: 14px;
		align-items: flex-start;
	}
	.num {
		flex: none;
		width: 26px;
		height: 26px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		background: var(--surface-2);
		color: var(--accent);
		font-size: 12px;
		font-weight: 600;
		margin-top: 1px;
	}
	.steps p {
		margin-top: 2px;
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
		flex-direction: column;
		gap: 6px;
		align-items: flex-start;
	}
	.recent {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0;
		padding: 8px 12px;
		text-align: left;
		min-width: 260px;
		background: var(--surface);
	}
	.recent:hover {
		background: var(--surface-2);
	}
	.recent .name {
		font-weight: 500;
	}
</style>
