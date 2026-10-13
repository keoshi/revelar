import { siteConfig, siteSettings } from '#lib/server/site.ts';
import type { RequestHandler } from './$types';

export const prerender = true;

export const GET: RequestHandler = () => {
	const config = siteConfig();
	const { baseUrl } = siteSettings();
	const lines = ['User-agent: *', 'Allow: /', 'Disallow: /p/', 'Disallow: /media-private/'];
	if (config.feeds.sitemap) lines.push('', `Sitemap: ${baseUrl}/sitemap.xml`);
	return new Response(lines.join('\n') + '\n', {
		headers: { 'Content-Type': 'text/plain; charset=utf-8' }
	});
};
