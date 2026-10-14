// Shared by bin/revelar.js and bin/revelar-host.js: load the TypeScript source through tsx and
// make '@index84/revelar' / '@index84/revelar/config' (and the short 'revelar' / 'revelar/config'
// that older configs use) resolvable from any site folder.
//
// A site's revelar.config.ts imports 'revelar/config', which Node can only find if the package
// is installed next to the site; sites created by the app or a global CLI have no node_modules.
// Two hooks cover both module systems: ESM resolution (bin/resolve-revelar.js, when the site
// folder declares "type": "module") and CommonJS resolution (tsx loads a .ts file as CommonJS
// when there is no such declaration, the common case for a plain photo folder).
import Module, { register as registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { register as registerTsx } from 'tsx/esm/api';

const PKG = new URL('../', import.meta.url);
const MAP = {
	'@index84/revelar': fileURLToPath(new URL('src/index.ts', PKG)),
	'@index84/revelar/config': fileURLToPath(new URL('src/lib/config.ts', PKG)),
	revelar: fileURLToPath(new URL('src/index.ts', PKG)),
	'revelar/config': fileURLToPath(new URL('src/lib/config.ts', PKG))
};

registerTsx();
registerHooks('./resolve-revelar.js', import.meta.url);

const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
	if (Object.hasOwn(MAP, request)) return MAP[request];
	return resolveFilename.call(this, request, ...rest);
};
