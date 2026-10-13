// Ambient declaration (this file must not be a module): `$config` is aliased in vite.config.ts to
// the site config file, revelar.config.ts or the one REVELAR_CONFIG names.
declare module '$config' {
	const config: import('./lib/config.ts').RevelarConfigInput;
	export default config;
}
