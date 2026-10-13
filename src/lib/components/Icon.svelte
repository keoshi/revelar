<script lang="ts">
	export type IconName =
		| 'close'
		| 'prev'
		| 'next'
		| 'play'
		| 'pause'
		| 'info'
		| 'download'
		| 'filmstrip'
		| 'fullscreen'
		| 'fullscreen-exit'
		| 'map'
		| 'lock'
		| 'chevron-down';

	let { name, size = 20 }: { name: IconName; size?: number } = $props();
</script>

<svg
	viewBox="0 0 24 24"
	width={size}
	height={size}
	fill="none"
	stroke="currentColor"
	stroke-width="1.6"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
	focusable="false"
>
	{#if name === 'close'}
		<path d="M6 6l12 12M18 6 6 18" />
	{:else if name === 'prev'}
		<path d="M15 5l-7 7 7 7" />
	{:else if name === 'next'}
		<path d="M9 5l7 7-7 7" />
	{:else if name === 'play'}
		<path d="M8 5v14l11-7z" fill="currentColor" stroke="none" />
	{:else if name === 'pause'}
		<path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor" stroke="none" />
	{:else if name === 'info'}
		<circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8h.01" />
	{:else if name === 'download'}
		<path d="M12 4v11m0 0 4-4m-4 4-4-4M5 19h14" />
	{:else if name === 'filmstrip'}
		<rect x="3" y="7" width="18" height="10" rx="1" /><path d="M7 7v10M12 7v10M17 7v10" />
	{:else if name === 'fullscreen'}
		<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
	{:else if name === 'fullscreen-exit'}
		<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
	{:else if name === 'map'}
		<path d="M12 21s-6-5.3-6-10a6 6 0 1 1 12 0c0 4.7-6 10-6 10Z" /><circle
			cx="12"
			cy="11"
			r="2.2"
		/>
	{:else if name === 'lock'}
		<rect x="5" y="11" width="14" height="10" rx="1.5" /><path d="M8 11V8a4 4 0 1 1 8 0v3" />
	{:else if name === 'chevron-down'}
		<path d="M6 9l6 6 6-6" />
	{/if}
</svg>
