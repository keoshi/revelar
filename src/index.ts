/**
 * Revelar's programmatic API: everything the CLI does, for other tools (a desktop app, a
 * watcher, CI) to call directly. Configs should import `defineConfig` from 'revelar/config'
 * (a light entry with no Node-only dependencies); this entry re-exports it for convenience.
 */
export { defineConfig, validateConfig } from './lib/config.ts';
export type { RevelarConfig, RevelarConfigInput, SiteSettings } from './lib/config.ts';
export type { Manifest, AlbumSummary, AlbumMeta, Photo, PhotoGps } from './lib/types.ts';
export { runIngest } from './engine/ingest.ts';
export type { IngestOptions, IngestReport } from './engine/ingest.ts';
export { buildSite, previewSite, pruneDataFiles } from './engine/build.ts';
export type { BuildOptions, BuildReport, PreviewOptions } from './engine/build.ts';
export { devServer } from './engine/dev.ts';
export type { DevOptions } from './engine/dev.ts';
export { shareLinks } from './engine/share.ts';
export type { ShareLinks } from './engine/share.ts';
export { configPath, loadConfig, siteRoot, PACKAGE_ROOT } from './engine/config.ts';
export {
	initSite,
	isSite,
	listAlbums,
	readAlbum,
	saveAlbum,
	addAlbum,
	readConfig,
	saveConfig,
	patchConfig,
	readManifest,
	titleFromPath,
	defaultConfigFor,
	DEFAULT_CONFIG
} from './engine/site.ts';
export type { AlbumListing, AlbumDetail } from './engine/site.ts';
export {
	publish,
	publishSite,
	publishNetlify,
	publishVercel,
	publishCloudflare,
	publishGitHub,
	predictUrl,
	isManagedUrl,
	zipDirectory,
	PUBLISH_TARGETS
} from './engine/publish.ts';
export type {
	PublishOptions,
	PublishResult,
	PublishSiteOptions,
	PublishSiteResult,
	PublishTarget,
	PublishEvent
} from './engine/publish.ts';
export { startHost } from './engine/host.ts';
export type { IngestEvent } from './engine/ingest.ts';
