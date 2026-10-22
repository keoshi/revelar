// Packages the desktop app for macOS: a signed (and optionally notarized) Revelar.app plus the
// zip and update feed (RELEASES-darwin-<arch>.json) that GitHub releases and the updater use.
//
//   node app/scripts/package.mjs [--arch arm64|x64] [--no-sign] [--notarize <keychain profile>]
//
// Steps: build the app (electron-vite), stage a production install (the engine from `npm pack`
// plus the app's runtime dependencies, nothing from the dev tree), wrap it with Electron
// (@electron/packager, no asar: the engine runs Vite and sharp from real files), sign with the
// Developer ID (hardened runtime), notarize and staple when asked, then zip.
//
// Signing picks the first "Developer ID Application" identity in the keychain, else an "Apple
// Development" one; --no-sign skips it (the app then only runs on this Mac). Notarization uses a
// notarytool keychain profile (`xcrun notarytool store-credentials <name>`), or in CI the
// APPLE_ID, APPLE_APP_PASSWORD and APPLE_TEAM_ID variables when the profile is "env".
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packager } from '@electron/packager';

const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(app, '..');
const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const run = (cmd, argv, opts = {}) => execFileSync(cmd, argv, { stdio: 'inherit', ...opts });
const output = (cmd, argv) => execFileSync(cmd, argv, { encoding: 'utf8' });

if (process.platform !== 'darwin') throw new Error('Packaging is macOS-only for now');
const pkg = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'));
const engine = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8'));
const arch = option('--arch') ?? process.arch;
if (!['arm64', 'x64'].includes(arch)) throw new Error(`Unknown --arch ${arch}`);
const sign = !args.includes('--no-sign');
const notarize = option('--notarize');
const identity = sign ? pickIdentity() : undefined;
if (notarize && !identity?.startsWith('Developer ID Application'))
	throw new Error('Notarization needs a "Developer ID Application" identity');

function pickIdentity() {
	const ids = output('security', ['find-identity', '-v', '-p', 'codesigning']);
	const names = [...ids.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
	const found =
		names.find((n) => n.startsWith('Developer ID Application')) ??
		names.find((n) => n.startsWith('Apple Development'));
	if (!found) throw new Error('No code-signing identity in the keychain; use --no-sign');
	return found;
}

// A published version is never rebuilt: installed copies only update to a higher one, so every
// build that goes out needs a new number in app/package.json (--force overrides, for local tests).
if (!args.includes('--force')) {
	try {
		execFileSync('gh', ['release', 'view', `v${pkg.version}`, '-R', 'keoshi/revelar'], {
			stdio: 'pipe'
		});
		throw new Error(
			`v${pkg.version} is already released; bump the version in app/package.json (or pass --force)`
		);
	} catch (e) {
		if (!String(e.message).includes('already released')) {
			/* no such release, or gh unavailable: carry on */
		} else throw e;
	}
}

// ---------- 1. build ----------
run('npm', ['run', 'build'], { cwd: app });
run('node', [join(app, 'scripts/icon.mjs')]);

// ---------- 2. stage a production install ----------
const dist = join(app, 'dist');
const stage = join(dist, `stage-${arch}`);
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
run('npm', ['pack', '--pack-destination', stage, '--silent'], { cwd: repo });
const tgz = `index84-revelar-${engine.version}.tgz`;
if (!existsSync(join(stage, tgz))) throw new Error(`npm pack did not produce ${tgz}`);
writeFileSync(
	join(stage, 'package.json'),
	JSON.stringify(
		{
			name: pkg.name,
			productName: pkg.productName,
			version: pkg.version,
			description: pkg.description,
			license: pkg.license,
			private: true,
			type: 'module',
			main: './out/main/index.js',
			dependencies: {
				'@index84/revelar': `file:${tgz}`,
				'update-electron-app': pkg.dependencies['update-electron-app']
			}
		},
		null,
		2
	)
);
cpSync(join(app, 'out'), join(stage, 'out'), { recursive: true });
mkdirSync(join(stage, 'build'));
cpSync(join(app, 'build/icon.png'), join(stage, 'build/icon.png'));
// --cpu/--os pick the native builds (sharp, esbuild, rolldown) for the target, not this Mac.
// Lifecycle scripts are skipped: esbuild's postinstall runs the binary to check its version,
// which fails for a cross-architecture install, and esbuild loads its platform package without it.
run(
	'npm',
	[
		'install',
		'--omit=dev',
		'--ignore-scripts',
		'--no-audit',
		'--no-fund',
		'--loglevel=error',
		`--cpu=${arch}`,
		'--os=darwin'
	],
	{ cwd: stage }
);
for (const name of [
	`@esbuild/darwin-${arch}`,
	`@img/sharp-darwin-${arch}`,
	`@img/sharp-libvips-darwin-${arch}`
])
	if (!existsSync(join(stage, 'node_modules', name))) throw new Error(`Staging is missing ${name}`);
rmSync(join(stage, tgz));
rmSync(join(stage, 'package-lock.json'), { force: true });

// ---------- 3. wrap, sign, notarize ----------
const notaryCredentials = () => {
	if (!notarize) return undefined;
	if (notarize !== 'env') return { keychainProfile: notarize };
	const { APPLE_ID, APPLE_APP_PASSWORD, APPLE_TEAM_ID } = process.env;
	if (!APPLE_ID || !APPLE_APP_PASSWORD || !APPLE_TEAM_ID)
		throw new Error('--notarize env needs APPLE_ID, APPLE_APP_PASSWORD and APPLE_TEAM_ID');
	return { appleId: APPLE_ID, appleIdPassword: APPLE_APP_PASSWORD, teamId: APPLE_TEAM_ID };
};
console.log(sign ? `Signing with ${identity}` : 'Not signing');
const [bundle] = await packager({
	dir: stage,
	out: dist,
	name: pkg.productName,
	executableName: pkg.productName,
	appBundleId: 'com.keoshi.revelar',
	appCategoryType: 'public.app-category.photography',
	appCopyright: `© ${new Date().getFullYear()} Filipe Varela`,
	appVersion: pkg.version,
	buildVersion: pkg.version,
	icon: join(app, 'build/icon.icns'),
	platform: 'darwin',
	arch,
	asar: false,
	prune: false,
	overwrite: true,
	darwinDarkModeSupport: true,
	osxSign: sign ? { identity } : undefined,
	osxNotarize: notaryCredentials()
});
const appPath = join(bundle, `${pkg.productName}.app`);
if (sign) run('codesign', ['--verify', '--deep', '--strict', appPath]);
if (notarize) run('spctl', ['--assess', '--type', 'execute', '--verbose=2', appPath]);

// ---------- 4. zip for releases and the updater ----------
const zip = join(dist, `${pkg.productName}-darwin-${arch}-${pkg.version}.zip`);
rmSync(zip, { force: true });
run('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', appPath, zip]);

// The updater's feed (see startUpdates in src/main/index.ts): installed copies read this file
// from the latest release, so it goes up with the zip and keeps the same name every version.
const feed = join(dist, `RELEASES-darwin-${arch}.json`);
const tag = `v${pkg.version}`;
const url = `https://github.com/keoshi/revelar/releases/download/${tag}/${basename(zip)}`;
const name = `${pkg.productName} ${pkg.version}`;
const updateTo = { version: pkg.version, name, notes: '', pub_date: new Date().toISOString(), url };
writeFileSync(
	feed,
	JSON.stringify(
		{ currentRelease: pkg.version, releases: [{ version: pkg.version, updateTo }] },
		null,
		'\t'
	) + '\n'
);
console.log(`\n${appPath}\n${zip} (${output('du', ['-sh', zip]).split('\t')[0]})\n${feed}`);
console.log(`Both go on the ${tag} release, next to the other architecture's zip and feed.`);
