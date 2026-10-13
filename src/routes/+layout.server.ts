import { siteSettings } from '#lib/server/site.ts';
import { soleAlbumHref } from '#lib/server/manifest.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = () => {
	return { site: siteSettings(), homeHref: soleAlbumHref() };
};
