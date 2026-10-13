import { marked } from 'marked';
import { validateConfig, type RevelarConfig, type SiteSettings } from '#lib/config.ts';
// `$config` is aliased in vite.config.ts to revelar.config.ts, or to REVELAR_CONFIG when set.
import userConfig from '$config';

let cachedConfig: RevelarConfig | undefined;

export function siteConfig(): RevelarConfig {
	cachedConfig ??= validateConfig(userConfig);
	return cachedConfig;
}

export function renderMarkdown(md: string | undefined): string {
	if (!md) return '';
	return marked.parse(md, { async: false, gfm: true, breaks: false }) as string;
}

export function siteSettings(): SiteSettings {
	const c = siteConfig();
	return {
		title: c.site.title,
		description: c.site.description,
		baseUrl: c.site.baseUrl.replace(/\/$/, ''),
		author: c.site.author,
		authorUrl: c.site.authorUrl,
		copyright: c.site.copyright,
		language: c.site.language,
		introHtml: renderMarkdown(c.site.intro),
		theme: c.theme,
		viewer: c.viewer,
		map: c.map,
		defaults: { exifPanel: c.defaults.exifPanel, maxZipBytes: c.defaults.maxZipBytes }
	};
}

/** Absolute canonical URL for a site-relative path (which must start with `/`). */
export function absoluteUrl(path: string): string {
	const base = siteSettings().baseUrl;
	return base + path;
}
