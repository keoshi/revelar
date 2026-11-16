import { siteSettings } from '#lib/server/site.ts';
import { rootAlbum } from '#lib/server/manifest.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = () => {
	return { site: siteSettings(), rootAlbum: rootAlbum()?.slug };
};
