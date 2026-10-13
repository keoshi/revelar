import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { RevelarConfigInput } from './src/lib/config.ts';

// The site config: revelar.config.ts unless REVELAR_CONFIG names another file (the e2e suite
// uses its own so the tests do not depend on the owner's settings).
const configPath = resolve(process.env.REVELAR_CONFIG ?? 'revelar.config.ts');
const revelar: RevelarConfigInput = (await import(pathToFileURL(configPath).href)).default;

// The e2e suite ingests fixtures into its own root (see tests/e2e/prepare.ts) so it never
// touches photos/ or the real generated output.
const siteRoot = process.env.REVELAR_SITE_ROOT ? resolve(process.env.REVELAR_SITE_ROOT) : undefined;
const buildDir = siteRoot ? resolve(siteRoot, 'build') : 'build';

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

/** Dev only: reload open pages when the ingest script rewrites the manifest. */
function manifestReload(): Plugin {
	const manifest = resolve(siteRoot ?? process.cwd(), 'src/lib/generated/manifest.json');
	return {
		name: 'revelar-manifest-reload',
		apply: 'serve',
		configureServer(server) {
			server.watcher.add(manifest);
			const reload = (file: string) => {
				if (file === manifest) server.ws.send({ type: 'full-reload' });
			};
			server.watcher.on('change', reload);
			server.watcher.on('add', reload);
		}
	};
}

export default defineConfig({
	plugins: [
		manifestReload(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter({ pages: buildDir, assets: buildDir, precompress: false, strict: true }),
			paths: { base: basePath() },
			...(siteRoot ? { files: { assets: resolve(siteRoot, 'static') } } : {}),
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
	// MapLibre spawns its worker from its own module URL; the dev pre-bundle breaks that.
	// `$config` (used by src/lib/server/site.ts) resolves to the active config file; its type is
	// declared in src/config.d.ts.
	resolve: { alias: { $config: configPath } },
	optimizeDeps: { exclude: ['maplibre-gl'] },
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
