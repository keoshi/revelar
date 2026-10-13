import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { validateConfig, type RevelarConfig } from '../lib/config.ts';

/** The revelar package itself (where src/routes, vite.config.ts and the default static files live). */
export const PACKAGE_ROOT = resolve(import.meta.dirname, '../..');

/**
 * The site root: the folder holding `revelar.config.ts`, `photos/`, `.cache/`, `static/` and
 * `build/`. `REVELAR_SITE_ROOT` overrides it; otherwise it is the current directory, so the
 * CLI works in any folder and the package's own checkout is a site root too.
 */
export function siteRoot(): string {
	return resolve(process.env.REVELAR_SITE_ROOT ?? process.cwd());
}

/** @deprecated use siteRoot(); kept for the ingest options' default */
export const ROOT = siteRoot();

/**
 * SvelteKit's working directory for a site (generated files, server and client output). It
 * stays inside the package rather than the site folder: the server output imports externals
 * such as @sveltejs/kit, which Node resolves by walking up from the file, and a plain photo
 * folder has no node_modules. The package's own checkout keeps `.svelte-kit/`; other sites get
 * a subfolder keyed on their path so builds do not clobber each other.
 */
export function kitOutDir(root = siteRoot()): string {
	const base = resolve(PACKAGE_ROOT, '.svelte-kit');
	if (resolve(root) === PACKAGE_ROOT) return base;
	const key = createHash('sha1').update(resolve(root)).digest('hex').slice(0, 10);
	return resolve(base, 'sites', key);
}

/** The config file: `revelar.config.ts` in the site root unless `REVELAR_CONFIG` points elsewhere. */
export function configPath(): string {
	return process.env.REVELAR_CONFIG
		? resolve(process.env.REVELAR_CONFIG)
		: resolve(siteRoot(), 'revelar.config.ts');
}

export async function loadConfig(path = configPath()): Promise<RevelarConfig> {
	const mod = await import(pathToFileURL(path).href);
	return validateConfig(mod.default);
}
