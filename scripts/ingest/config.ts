import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { validateConfig, type RevelarConfig } from '../../src/lib/config.ts';

export const ROOT = resolve(import.meta.dirname, '../..');

/** The config file: revelar.config.ts at the repo root unless REVELAR_CONFIG points elsewhere. */
export function configPath(): string {
	return resolve(ROOT, process.env.REVELAR_CONFIG ?? 'revelar.config.ts');
}

export async function loadConfig(): Promise<RevelarConfig> {
	const url = pathToFileURL(configPath()).href;
	const mod = await import(url);
	return validateConfig(mod.default);
}
