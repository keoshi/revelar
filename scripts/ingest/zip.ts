import { createWriteStream, mkdirSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import yazl from 'yazl';

/** Write a store-only (uncompressed) zip; returns its byte size. */
export function writeStoreZip(
	outPath: string,
	entries: { path: string; name: string }[]
): Promise<number> {
	mkdirSync(dirname(outPath), { recursive: true });
	return new Promise((resolve, reject) => {
		const zip = new yazl.ZipFile();
		const used = new Set<string>();
		for (const entry of entries) {
			let name = entry.name;
			let i = 2;
			while (used.has(name)) {
				const dot = entry.name.lastIndexOf('.');
				name =
					dot > 0
						? `${entry.name.slice(0, dot)}-${i}${entry.name.slice(dot)}`
						: `${entry.name}-${i}`;
				i++;
			}
			used.add(name);
			zip.addFile(entry.path, name, { compress: false, mtime: statSync(entry.path).mtime });
		}
		const out = createWriteStream(outPath);
		out.on('error', reject);
		zip.outputStream.on('error', reject);
		out.on('close', () => resolve(statSync(outPath).size));
		zip.outputStream.pipe(out);
		zip.end();
	});
}
