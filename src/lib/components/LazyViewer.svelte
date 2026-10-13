<script lang="ts">
	/**
	 * Loads the Viewer component (and with it PhotoSwipe) only when the album
	 * state first switches to viewer mode, keeping the album page bundle small.
	 * The chunk is prefetched on the first pointer/keyboard intent or when idle.
	 */
	import type { ComponentProps } from 'svelte';
	import type Viewer from './Viewer.svelte';
	import { onMount } from 'svelte';

	type Props = ComponentProps<typeof Viewer>;
	let props: Props = $props();

	let Component = $state<typeof Viewer | undefined>(undefined);
	let loading: Promise<void> | undefined;

	function load(): Promise<void> {
		loading ??= import('./Viewer.svelte').then((m) => {
			Component = m.default;
		});
		return loading;
	}

	$effect(() => {
		if (props.albumState.mode === 'viewer' && !Component) void load();
	});

	onMount(() => {
		const prefetch = () => void load();
		const idle = 'requestIdleCallback' in window;
		const handle = idle
			? window.requestIdleCallback(prefetch, { timeout: 4000 })
			: window.setTimeout(prefetch, 2500);
		document.addEventListener('pointerover', prefetch, { once: true, passive: true });
		document.addEventListener('keydown', prefetch, { once: true });
		return () => {
			if (idle) window.cancelIdleCallback(handle);
			else clearTimeout(handle);
			document.removeEventListener('pointerover', prefetch);
			document.removeEventListener('keydown', prefetch);
		};
	});
</script>

{#if Component}
	<Component {...props} />
{/if}
