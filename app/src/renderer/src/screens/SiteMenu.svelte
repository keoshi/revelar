<script lang="ts">
	import { fly } from 'svelte/transition';
	import { KEYS } from '../lib/commands.ts';

	type Props = {
		title: string;
		root: string;
		recent: string[];
		onSettings: () => void;
		onOpen: (root: string) => void;
		onBrowse: () => void;
		onCreate: () => void;
	};
	let { title, root, recent, onSettings, onOpen, onBrowse, onCreate }: Props = $props();
	let open = $state(false);
	let wrap: HTMLElement | undefined = $state();

	const short = (r: string) => r.replace(/^\/Users\/[^/]+/, '~');
	const others = $derived(recent.filter((r) => r !== root));

	function onWindowClick(e: MouseEvent) {
		if (open && wrap && !wrap.contains(e.target as Node)) open = false;
	}
	function pick(fn: () => void) {
		open = false;
		fn();
	}
</script>

<svelte:window onclick={onWindowClick} onkeydown={(e) => e.key === 'Escape' && (open = false)} />

<div class="wrap no-drag" bind:this={wrap}>
	<button
		type="button"
		class="trigger"
		class:open
		aria-haspopup="menu"
		aria-expanded={open}
		onclick={() => (open = !open)}
	>
		<span class="dot"></span>
		<span class="title">{title}</span>
		<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"
			><path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5" /></svg
		>
	</button>
	{#if open}
		<div class="menu" role="menu" transition:fly={{ y: -6, duration: 140 }}>
			<div class="head">
				<strong>{title}</strong>
				<span class="path">{short(root)}</span>
			</div>
			<button type="button" role="menuitem" onclick={() => pick(onSettings)}
				>Site settings…<kbd>{KEYS.settings}</kbd></button
			>
			{#if others.length}
				<div class="sep"></div>
				<span class="label hint">Recent sites</span>
				{#each others as r (r)}
					<button type="button" role="menuitem" onclick={() => pick(() => onOpen(r))} title={r}
						>{r.split('/').pop()}<span class="path">{short(r)}</span></button
					>
				{/each}
			{/if}
			<div class="sep"></div>
			<button type="button" role="menuitem" onclick={() => pick(onBrowse)}
				>Open another folder…<kbd>{KEYS.open}</kbd></button
			>
			<button type="button" role="menuitem" onclick={() => pick(onCreate)}
				>Create a new site…<kbd>{KEYS.new}</kbd></button
			>
		</div>
	{/if}
</div>

<style>
	.wrap {
		position: relative;
	}
	.trigger {
		display: flex;
		align-items: center;
		gap: 8px;
		background: none;
		padding: 6px 10px;
		color: var(--ink);
	}
	.trigger:hover,
	.trigger.open {
		background: var(--surface);
	}
	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--ok);
	}
	.title {
		font-weight: 500;
		max-width: 220px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.trigger svg {
		color: var(--muted);
	}
	.menu {
		position: absolute;
		right: 0;
		top: calc(100% + 6px);
		min-width: 280px;
		padding: 6px;
		background: var(--float);
		border-radius: 12px;
		box-shadow:
			0 0 0 1px var(--float-ring),
			0 12px 32px var(--float-shadow);
		display: flex;
		flex-direction: column;
		z-index: 10;
	}
	.head {
		display: flex;
		flex-direction: column;
		padding: 8px 10px 10px;
	}
	.head strong {
		font-weight: 500;
	}
	.menu [role='menuitem'] {
		display: grid;
		grid-template-columns: 1fr auto;
		align-items: center;
		gap: 0 16px;
		background: none;
		border-radius: 7px;
		padding: 7px 10px;
		text-align: left;
		font-weight: 400;
	}
	.menu [role='menuitem']:hover {
		background: var(--surface);
	}
	.menu [role='menuitem']:active {
		transform: none;
	}
	.menu [role='menuitem'] .path {
		grid-column: 1;
	}
	.path {
		display: block;
		max-width: 260px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font: 11.5px var(--f-mono);
		color: var(--muted);
	}
	.sep {
		margin: 6px 4px;
	}
	.label {
		padding: 2px 10px 4px;
	}
</style>
