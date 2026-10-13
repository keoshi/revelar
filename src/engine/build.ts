/**
 * Builds the static site for a site root: SvelteKit's `vite build` with the package as Vite's
 * project root and the site root supplying config, manifest, static files and the output dir
 * (see vite.config.ts), then trims the output.
 */
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync
} from 'node:fs';
import { join, resolve } from 'node:path';
import { loadConfig, PACKAGE_ROOT, siteRoot } from './config.ts';

/**
 * Kit's working directory lives in the site root (vite.config.ts sets outDir). Its server
 * output is ES modules, and Node decides the module type from the nearest package.json, which
 * in a standalone site folder may not say "type": "module"; a package.json inside the
 * directory settles it regardless of the user's own.
 */
function prepareKitDir(): void {
	const root = siteRoot();
	const dir = join(root, '.svelte-kit');
	mkdirSync(dir, { recursive: true });
	const pkg = join(dir, 'package.json');
	// Only when needed: a package.json inside .svelte-kit also hides the enclosing package's
	// `imports` map (#lib/*) from the generated route types, which matters in this checkout.
	if (nearestPackageType(root) === 'module') {
		if (existsSync(pkg)) rmSync(pkg);
	} else if (!existsSync(pkg)) writeFileSync(pkg, '{ "type": "module" }\n');
}

function nearestPackageType(from: string): string | undefined {
	let dir = from;
	for (;;) {
		const pkg = join(dir, 'package.json');
		if (existsSync(pkg)) {
			try {
				return (JSON.parse(readFileSync(pkg, 'utf8')) as { type?: string }).type;
			} catch {
				return undefined;
			}
		}
		const parent = join(dir, '..');
		if (parent === dir) return undefined;
		dir = parent;
	}
}

/**
 * SvelteKit resolves its own paths (outDir, generated entries, files.*) against the working
 * directory, not Vite's root, so Vite runs with the package as the working directory. The
 * previous directory is restored afterwards; REVELAR_SITE_ROOT (set by the callers) keeps the
 * site root known to vite.config.ts and the server loads.
 */
export async function inPackageDir<T>(fn: () => Promise<T>): Promise<T> {
	prepareKitDir();
	const previous = process.cwd();
	process.chdir(PACKAGE_ROOT);
	try {
		return await fn();
	} finally {
		process.chdir(previous);
	}
}

export type BuildOptions = {
	/** site root; defaults to REVELAR_SITE_ROOT or the current directory */
	root?: string;
	/** config file; defaults to REVELAR_CONFIG or <root>/revelar.config.ts */
	config?: string;
	/** Vite log level */
	logLevel?: 'info' | 'warn' | 'error' | 'silent';
};

export type BuildReport = { outDir: string; removedDataFiles: number };

/**
 * Resolves the site root and config for a Vite call and publishes them through the environment,
 * which is how vite.config.ts (evaluated by Vite, and again by Kit in a child process) learns
 * about them: REVELAR_SITE_ROOT, REVELAR_CONFIG and BASE_PATH (the path of site.baseUrl, unless
 * the user set BASE_PATH themselves).
 */
export async function prepareSite(opts: { root?: string; config?: string }): Promise<string> {
	const root = resolve(opts.root ?? process.env.REVELAR_SITE_ROOT ?? process.cwd());
	process.env.REVELAR_SITE_ROOT = root;
	if (opts.config) process.env.REVELAR_CONFIG = resolve(opts.config);
	if (process.env.BASE_PATH === undefined) {
		const config = await loadConfig();
		process.env.BASE_PATH = new URL(config.site.baseUrl).pathname.replace(/\/+$/, '');
	}
	return root;
}

export async function buildSite(opts: BuildOptions = {}): Promise<BuildReport> {
	const root = await prepareSite(opts);
	// What `vite build` does: the builder runs every environment (SvelteKit's server build, which
	// writes the optimised client entries, then the client). A plain `build()` would only build
	// the client environment.
	const { createBuilder } = await import('vite');
	await inPackageDir(async () => {
		const builder = await createBuilder({
			root: PACKAGE_ROOT,
			configFile: join(PACKAGE_ROOT, 'vite.config.ts'),
			logLevel: opts.logLevel
		});
		await builder.buildApp();
	});
	const outDir = join(root, 'build');
	return { outDir, removedDataFiles: pruneDataFiles(outDir) };
}

/**
 * SvelteKit writes a `__data.json` next to every prerendered page for client-side navigation
 * between pages. Revelar's links are plain page loads (`data-sveltekit-reload` in app.html) and
 * the viewer moves between photos with shallow routing, so none of those files are ever
 * requested; dropping them halves the file count of an album folder.
 */
export function pruneDataFiles(outDir: string): number {
	if (!existsSync(outDir)) return 0;
	let removed = 0;
	for (const entry of readdirSync(outDir, { recursive: true, withFileTypes: true })) {
		if (!entry.isFile() || entry.name !== '__data.json') continue;
		const path = join(entry.parentPath, entry.name);
		statSync(path);
		rmSync(path);
		removed++;
	}
	return removed;
}

export type PreviewOptions = {
	root?: string;
	config?: string;
	port?: number;
	strictPort?: boolean;
};

/** Serves the last build locally (SvelteKit's preview server). Resolves once listening. */
export async function previewSite(
	opts: PreviewOptions = {}
): Promise<{ url: string; close: () => Promise<void> }> {
	await prepareSite(opts);
	const { preview } = await import('vite');
	const server = await inPackageDir(() =>
		preview({
			root: PACKAGE_ROOT,
			configFile: join(PACKAGE_ROOT, 'vite.config.ts'),
			preview: { port: opts.port, strictPort: opts.strictPort }
		})
	);
	const url = server.resolvedUrls?.local[0] ?? `http://localhost:${opts.port ?? 4173}/`;
	return { url, close: () => server.close() };
}
