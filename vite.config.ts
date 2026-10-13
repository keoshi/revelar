import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import revelar from './revelar.config.ts';

// paths.base is derived from site.baseUrl so the site works from a subpath
// (e.g. https://user.github.io/photos → /photos). BASE_PATH overrides it.
function basePath(): '' | `/${string}` {
	let path: string;
	if (process.env.BASE_PATH !== undefined) path = process.env.BASE_PATH;
	else {
		try {
			path = new URL(revelar.site.baseUrl).pathname;
		} catch {
			path = '';
		}
	}
	path = path.replace(/\/+$/, '');
	return path === '' ? '' : (`/${path.replace(/^\/+/, '')}` as `/${string}`);
}

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter({ pages: 'build', assets: 'build', precompress: false, strict: true }),
			paths: { base: basePath() },
			// Page CSS files are small; inlining them removes render-blocking round trips.
			inlineStyleThreshold: 8192,
			prerender: {
				// Endpoints are not discovered by crawling; list them (and the optional global map) explicitly.
				entries: ['*', '/robots.txt', '/sitemap.xml', '/rss.xml', '/map/'],
				handleUnseenRoutes: ({ routes }) => {
					// Routes whose entries() returned nothing (e.g. no private albums) are fine.
					const unexpected = routes.filter(
						(r) => !['/p/[token]', '/[album]/map', '/map'].includes(r)
					);
					if (unexpected.length)
						throw new Error(`Routes not prerendered: ${unexpected.join(', ')}`);
				},
				handleHttpError: ({ path, status, message }) => {
					// Optional outputs: /map/ (global map), sitemap.xml and rss.xml can be disabled in config.
					const optional = [
						`${basePath()}/map`,
						`${basePath()}/sitemap.xml`,
						`${basePath()}/rss.xml`
					];
					if (status === 404 && optional.includes(path.replace(/\/$/, ''))) return;
					throw new Error(message);
				},
				handleMissingId: 'warn'
			}
		})
	],
	build: { target: 'es2022' },
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'unit',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}', 'tests/unit/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					testTimeout: 60_000
				}
			}
		]
	}
});
