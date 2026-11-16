<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { activity } from '../lib/engine.svelte.ts';
	const pct = $derived(activity.total ? Math.round((activity.done / activity.total) * 100) : 0);
	// The host's own wording for what it is doing, under the current stage, unless it only repeats it.
	const detail = $derived(
		activity.phases.some((p) => p.label === activity.label) ? '' : activity.label
	);
</script>

<!-- A transient overlay while the engine works: progress stays in view and nothing underneath
     can be edited half-way through a processing run. -->
<div class="veil" transition:fade={{ duration: 160 }} role="status" aria-live="polite">
	{#if activity.phases.length}
		<div class="card checklist" transition:fly={{ y: 10, duration: 220 }}>
			<ol>
				{#each activity.phases as p, i (p.key)}
					{@const state = i < activity.phase ? 'done' : i === activity.phase ? 'active' : 'todo'}
					<li class={state}>
						<span class="mark" aria-hidden="true">
							{#if state === 'done'}
								<svg viewBox="0 0 16 16" width="16" height="16"
									><path
										d="M3.5 8.5l3 3 6-7"
										fill="none"
										stroke="currentColor"
										stroke-width="1.8"
										stroke-linecap="round"
										stroke-linejoin="round"
									/></svg
								>
							{:else if state === 'active'}
								<span class="spinner"></span>
							{:else}
								<span class="pending"></span>
							{/if}
						</span>
						<span class="step">
							<span class="name">{p.label}</span>
							<span class="sr"
								>{state === 'done' ? 'done' : state === 'active' ? 'in progress' : 'to do'}</span
							>
							{#if state === 'active' && (detail || activity.slug || activity.total)}
								<span class="detail">
									{[detail, activity.slug].filter(Boolean).join(' · ')}
									{#if activity.total}{detail || activity.slug ? ' · ' : ''}{activity.done} of {activity.total}{/if}
								</span>
							{/if}
							{#if state === 'active' && activity.total}
								<span class="bar"><span class="fill" style:width="{pct}%"></span></span>
							{/if}
						</span>
					</li>
				{/each}
			</ol>
		</div>
	{:else}
		<div class="card" class:progress={activity.total > 0} transition:fly={{ y: 10, duration: 220 }}>
			<span class="spinner"></span>
			<div class="text">
				<strong>{activity.label || 'Working'}</strong>
				{#if activity.slug || activity.total}
					<span class="detail">
						{#if activity.slug}{activity.slug}{/if}
						{#if activity.total}{activity.slug ? ' · ' : ''}{activity.done} of {activity.total}{/if}
					</span>
				{/if}
			</div>
			{#if activity.total}
				<div class="bar"><div class="fill" style:width="{pct}%"></div></div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.veil {
		position: fixed;
		inset: 0;
		z-index: 30;
		display: grid;
		place-items: center;
		background: color-mix(in srgb, var(--bg) 55%, transparent);
		backdrop-filter: blur(6px);
	}
	.card {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 8px 14px;
		align-items: center;
		/* hugs a bare label ("Building the site"); widens for a progress bar */
		width: fit-content;
		max-width: 440px;
		padding: 18px 22px;
		background: var(--float);
		border-radius: 14px;
		box-shadow:
			0 0 0 1px var(--float-ring),
			0 20px 50px var(--float-shadow);
	}
	.card.progress {
		min-width: 320px;
	}
	.text {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.text strong {
		font-weight: 500;
	}
	.detail {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font: 12px var(--f-mono);
		color: var(--muted);
		font-variant-numeric: tabular-nums;
	}
	.spinner {
		width: 16px;
		height: 16px;
		border: 2px solid var(--track);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	.bar {
		grid-column: 1 / -1;
		height: 4px;
		background: var(--track);
		border-radius: 2px;
		overflow: hidden;
	}
	.checklist {
		display: block;
		width: 360px;
		max-width: calc(100vw - 48px);
		padding: 20px 22px;
	}
	.checklist ol {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.checklist li {
		display: grid;
		grid-template-columns: 16px 1fr;
		gap: 12px;
		align-items: start;
		color: var(--faint);
		transition: color 200ms var(--ease);
	}
	.checklist li.active {
		color: var(--ink);
	}
	.checklist li.done {
		color: var(--muted);
	}
	.mark {
		display: grid;
		place-items: center;
		height: 20px;
	}
	.done .mark {
		color: var(--ok);
		animation: pop 260ms var(--ease);
	}
	.pending {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--track);
	}
	.step {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
		position: relative;
		line-height: 20px;
	}
	.active .name {
		font-weight: 500;
	}
	/* the host's wording can be long: wrap it rather than cut it */
	.step .detail {
		line-height: 1.4;
		white-space: normal;
		overflow: visible;
		overflow-wrap: anywhere;
	}
	.step .bar {
		display: block;
		margin-top: 4px;
	}
	.step .fill {
		display: block;
	}
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}
	@keyframes pop {
		from {
			transform: scale(0.5);
			opacity: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.done .mark {
			animation: none;
		}
	}
	.fill {
		height: 100%;
		background: var(--accent);
		border-radius: 2px;
		transition: width 120ms linear;
	}
</style>
