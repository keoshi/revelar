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
			text: 'An empty folder becomes your site and gives it its name. Keep it anywhere, Dropbox included.'
		},
		{
			title: 'Add albums',
			text: 'Drop folders of photos into it. Each folder is an album; titles and captions come along.'
		},
		{
			title: 'Preview, then publish',
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
			<li in:fly={{ y: 16, duration: 400, delay: 140 + i * 110 }}>
				<div class="art" aria-hidden="true">
					{#if i === 0}
						<!-- a folder, with a plus: the site to be -->
						<svg viewBox="0 0 160 100">
							<path
								d="M28 26h34l10 10h60a6 6 0 0 1 6 6v36a6 6 0 0 1-6 6H28a6 6 0 0 1-6-6V32a6 6 0 0 1 6-6z"
								class="fill"
							/>
							<path d="M22 44h116" class="line" />
							<circle cx="80" cy="64" r="11" class="accent" />
							<path d="M80 58.5v11M74.5 64h11" class="ink" />
						</svg>
					{:else if i === 1}
						<!-- three photos sliding into the folder -->
						<svg viewBox="0 0 160 100">
							<path
								d="M64 40h26l8 8h40a5 5 0 0 1 5 5v31a5 5 0 0 1-5 5H64a5 5 0 0 1-5-5V45a5 5 0 0 1 5-5z"
								class="fill"
							/>
							<g transform="rotate(-10 44 46)">
								<rect x="22" y="26" width="44" height="34" rx="3" class="card" />
								<circle cx="34" cy="37" r="3.5" class="accent" />
								<path d="M26 56l12-13 8 8 7-6 11 11H26z" class="hill" />
							</g>
							<g transform="rotate(-4 58 50)">
								<rect x="36" y="22" width="44" height="34" rx="3" class="card" />
								<circle cx="48" cy="33" r="3.5" class="accent" />
								<path d="M40 52l12-13 8 8 7-6 11 11H40z" class="hill" />
							</g>
							<g>
								<rect x="50" y="18" width="44" height="34" rx="3" class="card" />
								<circle cx="62" cy="29" r="3.5" class="accent" />
								<path d="M54 48l12-13 8 8 7-6 11 11H54z" class="hill" />
							</g>
							<path d="M108 68l10 8-10 8" class="line" />
						</svg>
					{:else}
						<!-- a browser window with a photo grid, going live -->
						<svg viewBox="0 0 160 100">
							<rect x="24" y="16" width="112" height="70" rx="6" class="fill" />
							<path d="M24 30h112" class="line" />
							<circle cx="33" cy="23" r="2" class="dot" />
							<circle cx="40" cy="23" r="2" class="dot" />
							<circle cx="47" cy="23" r="2" class="dot" />
							<rect x="32" y="38" width="30" height="20" rx="2" class="tile" />
							<rect x="66" y="38" width="20" height="20" rx="2" class="tile" />
							<rect x="90" y="38" width="38" height="20" rx="2" class="tile" />
							<rect x="32" y="62" width="22" height="16" rx="2" class="tile" />
							<rect x="58" y="62" width="34" height="16" rx="2" class="tile" />
							<rect x="96" y="62" width="32" height="16" rx="2" class="tile" />
							<circle cx="130" cy="78" r="12" class="accent" />
							<path d="M130 84V72m-5 5l5-5 5 5" class="ink" />
						</svg>
					{/if}
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
	.art svg {
		display: block;
		width: 100%;
		height: auto;
	}
	.art .fill {
		fill: var(--surface);
		stroke: var(--text-muted);
		stroke-width: 2;
		stroke-linejoin: round;
	}
	.art .card {
		fill: var(--surface);
		stroke: var(--text-muted);
		stroke-width: 2;
	}
	.art .line {
		fill: none;
		stroke: var(--text-muted);
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.art .hill {
		fill: var(--text-muted);
		opacity: 0.55;
	}
	.art .tile {
		fill: var(--text-muted);
		opacity: 0.35;
	}
	.art .dot {
		fill: var(--text-muted);
	}
	.art .accent {
		fill: var(--accent);
	}
	.art .ink {
		fill: none;
		stroke: #1a1200;
		stroke-width: 2.2;
		stroke-linecap: round;
		stroke-linejoin: round;
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
