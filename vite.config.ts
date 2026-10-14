import { defineConfig, type Plugin } from 'vite';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { RevelarConfigInput } from './src/lib/config.ts';
import { kitOutDir, PACKAGE_ROOT } from './src/engine/config.ts';

/**
 * Two roots. The package root (this folder) is Vite's project root: src/routes, src/lib and
 * app.html live here. The site root holds the owner's content and output: revelar.config.ts,
 * photos/, .cache/ (manifest), static/ (derivatives) and build/. It is REVELAR_SITE_ROOT, else
 * the working directory, so `revelar build` works in any folder and this checkout is a site
 * root too (the e2e suite uses tests/e2e/.site).
 */
// The package, or the desktop app's writable mirror of it (REVELAR_PACKAGE_ROOT): Kit writes
// next to this root, so it must not be the real, read-only package inside an installed app.
const packageRoot = PACKAGE_ROOT;
const siteRoot = resolve(process.env.REVELAR_SITE_ROOT ?? process.cwd());

// The site config: <siteRoot>/revelar.config.ts unless REVELAR_CONFIG names another file (the
// e2e suite uses its own so the tests do not depend on the owner's settings).
const configPath = process.env.REVELAR_CONFIG
	? resolve(process.env.REVELAR_CONFIG)
	: join(siteRoot, 'revelar.config.ts');

// paths.base is derived from site.baseUrl so the site works from a subpath
// (e.g. https://user.github.io/photos → /photos). The engine (src/engine/build.ts) loads the
// config and passes the path as BASE_PATH, which also lets users override it; importing the
// config here is only a fallback for running `vite build` directly in this checkout. (Kit
// re-evaluates this file in a child process that cannot load TypeScript configs from a
// folder without "type": "module", so that path must not be needed in normal use.)
let configuredBase = process.env.BASE_PATH;
if (configuredBase === undefined) {
	try {
		const revelar: RevelarConfigInput = (await import(pathToFileURL(configPath).href)).default;
		configuredBase = new URL(revelar.site.baseUrl).pathname;
	} catch {
		configuredBase = '';
	}
}
function basePath(): '' | `/${string}` {
	const path = (configuredBase ?? '').replace(/\/+$/, '');
	return path === '' ? '' : (`/${path.replace(/^\/+/, '')}` as `/${string}`);
}

/**
 * Whether the global map page exists: the engine says so from the site config
 * (REVELAR_GLOBAL_MAP; a plain `vite build` without it keeps the page listed), and some public
 * photo must carry a location, read from the manifest the ingest wrote.
 */
function wantsGlobalMap(): boolean {
	if (process.env.REVELAR_GLOBAL_MAP === '0') return false;
	try {
		const m = JSON.parse(readFileSync(join(siteRoot, '.cache', 'manifest.json'), 'utf8')) as {
			albums?: { photos?: { gps?: unknown }[] }[];
		};
		return (m.albums ?? []).some((a) => (a.photos ?? []).some((p) => p.gps));
	} catch {
		return true;
	}
}

/** Dev only: reload open pages when the ingest script rewrites the manifest. */
function manifestReload(): Plugin {
	const manifest = join(siteRoot, '.cache', 'manifest.json');
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
	root: packageRoot,
	plugins: [
		manifestReload(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter({
				pages: join(siteRoot, 'build'),
				assets: join(siteRoot, 'build'),
				precompress: false,
				strict: true
			}),
			// Absolute paths: the viewer changes the URL with shallow routing, and relative hrefs
			// rendered for /album/photo/ would then resolve against /album/ (header and map links
			// broke after closing a deep-linked viewer on a subpath deployment).
			paths: { base: basePath(), relative: false },
			// Kit's working directory stays inside the package (see kitOutDir): its server output
			// imports externals that must resolve from the package's node_modules.
			outDir: kitOutDir(siteRoot),
			files: { assets: join(siteRoot, 'static') },
			// CSS stays in hashed, immutable files shared by every page rather than being inlined:
			// with one shell per photo, inlining would repeat ~15 KB of styles in each.
			inlineStyleThreshold: 0,
			prerender: {
				// Endpoints are not discovered by crawling; list them (and the optional global map) explicitly.
				entries: wantsGlobalMap()
					? ['*', '/robots.txt', '/sitemap.xml', '/rss.xml', '/map/']
					: ['*', '/robots.txt', '/sitemap.xml', '/rss.xml'],
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
	// `$config` (used by src/lib/server/site.ts) is the active config file. Configs import
	// `defineConfig` from '@index84/revelar/config' (or the older 'revelar/config'); the aliases
	// resolve that to this package's source
	// whether the config lives in this checkout or in a folder that installed revelar.
	resolve: {
		alias: {
			$config: configPath,
			'@index84/revelar/config': join(packageRoot, 'src/lib/config.ts'),
			'revelar/config': join(packageRoot, 'src/lib/config.ts'),
			revelar: join(packageRoot, 'src/index.ts')
		}
	},
	ssr: { noExternal: ['@index84/revelar', 'revelar'] },
	// MapLibre is large and self-contained; keeping it out of the dev pre-bundle avoids a slow
	// re-optimisation when the map page is first opened.
	optimizeDeps: { exclude: ['maplibre-gl'] },
	build: { target: 'es2022' }
});
