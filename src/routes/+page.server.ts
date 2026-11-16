import { albumCard, publicAlbums, rootAlbum } from '#lib/server/manifest.ts';
import { albumLoad } from '#lib/server/album.ts';
import { compactSources, type ImageSources } from '#lib/utils/sources.ts';
import { siteConfig } from '#lib/server/site.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	// With a single album there is nothing to choose from: the home page is the album.
	const root = rootAlbum();
	if (root) return { ...albumLoad(root), albums: [], hasGlobalMap: false };
	const config = siteConfig();
	const albums = publicAlbums().map((a) => {
		const card = albumCard(a);
		return {
			...card,
			cover: { ...card.cover, sources: compactSources(card.cover.sources as ImageSources) }
		};
	});
	return {
		album: undefined,
		hasMap: false,
		inlineScript: undefined,
		albums,
		hasGlobalMap: config.map.enabled && config.map.globalMap && albums.some((a) => a.bounds)
	};
};
