import { siteSettings } from '#lib/server/site.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = () => {
	return { site: siteSettings() };
};
