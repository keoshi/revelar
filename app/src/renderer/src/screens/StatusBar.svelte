<script lang="ts">
	import { activity } from '../lib/engine.svelte.ts';
	let open = $state(false);
	const warnings = $derived(activity.log.filter((e) => e.level === 'warn').length);
	const errors = $derived(activity.log.filter((e) => e.level === 'error').length);
	const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
</script>

<!-- Shown only when the last run left warnings or errors; progress itself lives in the overlay. -->
<footer class="status" class:errors={errors > 0}>
	<div class="line">
		<span class="mark" aria-hidden="true">!</span>
		<span>
			{#if errors}{plural(errors, 'error')}{/if}
			{#if errors && warnings},
			{/if}
			{#if warnings}{plural(warnings, 'warning')}{/if}
			from the last run
		</span>
		<button type="button" class="link small" onclick={() => (open = !open)}
			>{open ? 'Hide log' : 'Show log'}</button
		>
		<button type="button" class="link small" onclick={() => (activity.log = [])}>Dismiss</button>
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
		border-top: 1px solid var(--line);
		padding: 8px 20px;
		font-size: 12.5px;
	}
	.line {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.line button:first-of-type {
		margin-left: auto;
	}
	.mark {
		width: 16px;
		height: 16px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		font-weight: 600;
		font-size: 11px;
		background: var(--accent);
		color: var(--on-accent);
	}
	.errors .mark {
		background: var(--danger);
		color: #fff;
	}
	.log {
		max-height: 160px;
		overflow: auto;
		margin: 8px 0 0;
		font: 11.5px/1.55 var(--f-mono);
		white-space: pre-wrap;
		user-select: text;
	}
	.warn {
		color: var(--ink);
	}
	.error {
		color: var(--danger);
	}
</style>
