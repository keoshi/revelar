<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { activity } from '../lib/engine.svelte.ts';
	const pct = $derived(activity.total ? Math.round((activity.done / activity.total) * 100) : 0);
</script>

<!-- A transient overlay while the engine works: progress stays in view and nothing underneath
     can be edited half-way through a processing run. -->
<div class="veil" transition:fade={{ duration: 160 }} role="status" aria-live="polite">
	<div class="card" transition:fly={{ y: 10, duration: 220 }}>
		<span class="spinner"></span>
		<div class="text">
			<strong>{activity.label || 'Working'}</strong>
			<span class="muted small">
				{#if activity.slug}{activity.slug}{/if}
				{#if activity.total}{activity.slug ? ' · ' : ''}{activity.done} of {activity.total}{/if}
			</span>
		</div>
		{#if activity.total}
			<div class="bar"><div class="fill" style:width="{pct}%"></div></div>
		{/if}
	</div>
</div>

<style>
	.veil {
		position: fixed;
		inset: 0;
		z-index: 30;
		display: grid;
		place-items: center;
		background: rgb(14 14 14 / 0.55);
		backdrop-filter: blur(6px);
	}
	.card {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 6px 14px;
		align-items: center;
		min-width: 320px;
		max-width: 440px;
		padding: 16px 18px;
		background: var(--surface);
		border: 1px solid var(--hairline);
		border-radius: 10px;
		box-shadow: 0 20px 50px rgb(0 0 0 / 0.5);
	}
	.text {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.text span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.spinner {
		width: 16px;
		height: 16px;
		border: 2px solid var(--hairline);
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
		background: var(--surface-2);
		border-radius: 2px;
		overflow: hidden;
	}
	.fill {
		height: 100%;
		background: var(--accent);
		transition: width 120ms linear;
	}
</style>
