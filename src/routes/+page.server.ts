import { albumCard, publicAlbums } from '#lib/server/manifest.ts';
import { siteConfig } from '#lib/server/site.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	const config = siteConfig();
	const albums = publicAlbums().map(albumCard);
	return {
		albums,
		hasGlobalMap: config.map.enabled && config.map.globalMap && albums.some((a) => a.bounds)
	};
};
