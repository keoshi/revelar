import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
	main: { plugins: [externalizeDepsPlugin()] },
	// The preload is CommonJS so the renderer can be sandboxed (ESM preloads need sandbox: false).
	preload: {
		plugins: [externalizeDepsPlugin()],
		build: { rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } } }
	},
	renderer: { plugins: [svelte({ compilerOptions: { runes: true } })] }
});
