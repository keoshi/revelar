import { existsSync, readdirSync, rmSync, rmdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** Delete every file under `dir` whose absolute path is not in `keep`; remove empty directories. */
export function pruneDir(dir: string, keep: Set<string>): string[] {
	const removed: string[] = [];
	dir = resolve(dir);
	if (!existsSync(dir)) return removed;
	const walk = (d: string) => {
		for (const entry of readdirSync(d, { withFileTypes: true })) {
			const p = join(d, entry.name);
			if (entry.isDirectory()) {
				walk(p);
				if (readdirSync(p).length === 0) rmdirSync(p);
			} else if (!keep.has(p)) {
				rmSync(p);
				removed.push(p);
			}
		}
	};
	walk(dir);
	return removed;
}

export function dirBytes(dir: string): number {
	if (!existsSync(dir)) return 0;
	let total = 0;
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const p = join(dir, entry.name);
		total += entry.isDirectory() ? dirBytes(p) : statSync(p).size;
	}
	return total;
}
