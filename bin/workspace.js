// A writable mirror of the package for the desktop app (see bin/revelar-host.js).
//
// SvelteKit and Vite write next to the project they build: `.svelte-kit/`, and a tsconfig into
// `node_modules/$app/`. Inside a signed, installed app the package is read-only, so the engine
// builds from a mirror instead: a folder of symlinks to the package's source files and to every
// installed dependency, with real directories where the tools write. The mirror is rebuilt
// whenever the package it points at changes (a different path or version).
import {
	existsSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** Files and folders of the package the build reads. */
const LINKED = ['bin', 'src', 'static', 'package.json', 'tsconfig.json', 'vite.config.ts'];
/** node_modules entries the tools write into, which must be real directories. */
const WRITABLE = ['$app', '.vite'];

/** The node_modules folders dependencies resolve from: the package's own, then the hoisted one above it. */
function dependencyDirs() {
	const dirs = [];
	const own = join(PKG, 'node_modules');
	if (existsSync(own)) dirs.push(own);
	// `<something>/node_modules/revelar` → `<something>/node_modules`
	const parent = dirname(PKG);
	if (parent.endsWith('node_modules') && parent !== own && existsSync(parent)) dirs.push(parent);
	return dirs;
}

/**
 * Creates (or refreshes) the mirror under `workDir` and returns its path, to be used as the
 * package root for builds.
 */
export function prepareWorkspace(workDir) {
	const root = join(resolve(workDir), 'package');
	const stampFile = join(root, '.mirror.json');
	const version = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8')).version;
	const stamp = JSON.stringify({ pkg: PKG, version, deps: dependencyDirs() });
	if (existsSync(stampFile) && readFileSync(stampFile, 'utf8') === stamp) return root;

	rmSync(root, { recursive: true, force: true });
	mkdirSync(root, { recursive: true });
	for (const name of LINKED) {
		const target = join(PKG, name);
		if (existsSync(target)) symlinkSync(target, join(root, name));
	}
	const modules = join(root, 'node_modules');
	mkdirSync(modules);
	for (const name of WRITABLE) mkdirSync(join(modules, name));
	for (const dir of dependencyDirs()) {
		for (const entry of readdirSync(dir)) {
			if (WRITABLE.includes(entry)) continue;
			const link = join(modules, entry);
			if (existsSync(link) || isLink(link)) continue;
			symlinkSync(join(dir, entry), link);
		}
	}
	writeFileSync(stampFile, stamp);
	return root;
}

function isLink(path) {
	try {
		return lstatSync(path).isSymbolicLink();
	} catch {
		return false;
	}
}
