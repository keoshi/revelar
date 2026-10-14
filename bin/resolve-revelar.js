// Node module-resolution hook (see bin/register.js): a site's revelar.config.ts imports
// 'revelar/config', which Node can only find if the package is installed next to the site.
// Sites created by the app or a global CLI have no node_modules, so the engine resolves those
// specifiers to its own source instead.
const PKG = new URL('../', import.meta.url);
const MAP = {
	'@index84/revelar': new URL('src/index.ts', PKG).href,
	'@index84/revelar/config': new URL('src/lib/config.ts', PKG).href,
	revelar: new URL('src/index.ts', PKG).href,
	'revelar/config': new URL('src/lib/config.ts', PKG).href
};

export async function resolve(specifier, context, next) {
	if (Object.hasOwn(MAP, specifier)) return { url: MAP[specifier], shortCircuit: true };
	return next(specifier, context);
}
