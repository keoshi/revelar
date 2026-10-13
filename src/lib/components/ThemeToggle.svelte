<script lang="ts">
	import { onMount } from 'svelte';

	let { mode }: { mode: 'system' | 'dark' | 'light' } = $props();

	type Theme = 'light' | 'dark';
	let theme = $state<Theme | null>(null);

	function systemTheme(): Theme {
		return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
	}

	onMount(() => {
		const stored = localStorage.getItem('revelar-theme');
		if (stored === 'light' || stored === 'dark') theme = stored;
		else if (mode !== 'system') {
			theme = mode;
			document.documentElement.dataset.theme = mode;
		} else theme = systemTheme();
	});

	function toggle() {
		const next: Theme = theme === 'dark' ? 'light' : 'dark';
		theme = next;
		document.documentElement.dataset.theme = next;
		localStorage.setItem('revelar-theme', next);
	}
</script>

<button
	type="button"
	class="icon-button"
	onclick={toggle}
	aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
	title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
>
	{#if theme === 'dark'}
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.5"
			aria-hidden="true"
		>
			<circle cx="12" cy="12" r="4" />
			<path
				d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
			/>
		</svg>
	{:else}
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.5"
			aria-hidden="true"
		>
			<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
		</svg>
	{/if}
</button>
