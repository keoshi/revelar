<script lang="ts">
	import { activity } from '../lib/engine.svelte.ts';
	let open = $state(false);
	const pct = $derived(activity.total ? Math.round((activity.done / activity.total) * 100) : 0);
</script>

<footer class="status">
	<div class="line">
		{#if activity.busy}
			<span class="spinner"></span>
			<span>{activity.label}{activity.slug ? ` · ${activity.slug}` : ''}</span>
			{#if activity.total}<span class="muted">{activity.done} / {activity.total}</span>{/if}
			<div class="bar"><div class="fill" style:width="{pct}%"></div></div>
		{:else}
			<span class="muted">Idle</span>
		{/if}
		<button type="button" class="link small" onclick={() => (open = !open)}
			>{open ? 'Hide log' : `Log (${activity.log.length})`}</button
		>
	</div>
	{#if open}
		<div class="log">
			{#each activity.log as entry, i (i)}
				<div class={entry.level}>{entry.message}</div>
			{/each}
		</div>
	{/if}
</footer>

<style>
	.status {
		border-top: 1px solid var(--hairline);
		background: var(--surface);
		padding: 6px 16px;
		font-size: 12px;
	}
	.line {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.line button {
		margin-left: auto;
	}
	.bar {
		width: 160px;
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
	.spinner {
		width: 10px;
		height: 10px;
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
	.log {
		max-height: 160px;
		overflow: auto;
		margin: 8px 0 0;
		font:
			11px/1.5 ui-monospace,
			monospace;
		white-space: pre-wrap;
		user-select: text;
	}
	.warn {
		color: var(--accent);
	}
	.error {
		color: var(--danger);
	}
</style>
