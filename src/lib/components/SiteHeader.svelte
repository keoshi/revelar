<script lang="ts">
	import { resolve } from '$app/paths';
	import ThemeToggle from './ThemeToggle.svelte';

	let { title, themeMode }: { title: string; themeMode: 'system' | 'dark' | 'light' } = $props();
</script>

<header class="site-header container">
	<a class="site-title" href={resolve('/')}>{title}</a>
	<ThemeToggle mode={themeMode} />
</header>

<style>
	.site-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		height: 64px;
	}

	.site-title {
		font-size: var(--text-lg);
		font-weight: 600;
		letter-spacing: -0.015em;
	}

	.site-title:hover {
		text-decoration: none;
		color: var(--text-muted);
	}
</style>
