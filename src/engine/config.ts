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
