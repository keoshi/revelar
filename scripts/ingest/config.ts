import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { validateConfig, type RevelarConfig } from '../../src/lib/config.ts';

export const ROOT = resolve(import.meta.dirname, '../..');

export async function loadConfig(): Promise<RevelarConfig> {
	const url = pathToFileURL(resolve(ROOT, 'revelar.config.ts')).href;
	const mod = await import(url);
	return validateConfig(mod.default);
}
