<script lang="ts">
	/** Segmented control: two or three mutually exclusive options, the chosen one raised. */
	type Option = { value: string; label: string; title?: string };
	type Props = {
		options: Option[];
		value: string;
		onchange?: (value: string) => void;
		label: string;
		id?: string;
	};
	let { options, value = $bindable(), onchange, label, id }: Props = $props();
	function pick(v: string) {
		if (v === value) return;
		value = v;
		onchange?.(v);
	}
</script>

<div class="seg" role="group" aria-label={label} {id} style:--n={options.length}>
	{#each options as o (o.value)}
		<button
			type="button"
			aria-pressed={value === o.value}
			title={o.title}
			onclick={() => pick(o.value)}>{o.label}</button
		>
	{/each}
</div>

<style>
	.seg {
		display: grid;
		grid-template-columns: repeat(var(--n), 1fr);
		background: var(--surface);
		border-radius: 10px;
		padding: 3px;
	}
	.seg button {
		border: 0;
		background: transparent;
		color: var(--muted);
		font: 500 12.5px var(--f-body);
		padding: 6px 4px;
		border-radius: 7px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		transition:
			color 150ms,
			background 150ms;
	}
	.seg button:hover {
		color: var(--ink);
	}
	.seg button[aria-pressed='true'] {
		background: var(--bg);
		color: var(--ink);
		box-shadow: 0 1px 3px rgb(0 0 0 / 0.1);
	}
	.seg button:active {
		transform: none;
	}
</style>
