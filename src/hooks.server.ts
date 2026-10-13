import type { Handle } from '@sveltejs/kit/hooks';
import { siteConfig } from '#lib/server/site.ts';

export const handle: Handle = async ({ event, resolve }) => {
	const lang = siteConfig().site.language;
	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%revelar.lang%', lang)
	});
};
