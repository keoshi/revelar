import { redirect } from '@sveltejs/kit';
import { albumCard, publicAlbums, soleAlbumHref } from '#lib/server/manifest.ts';
import { compactSources, type ImageSources } from '#lib/utils/sources.ts';
import { siteConfig } from '#lib/server/site.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	// With a single album there is nothing to choose from: go straight to it.
	const sole = soleAlbumHref();
	if (sole) redirect(307, sole);
	const config = siteConfig();
	const albums = publicAlbums().map((a) => {
		const card = albumCard(a);
		return {
			...card,
			cover: { ...card.cover, sources: compactSources(card.cover.sources as ImageSources) }
		};
	});
	return {
		albums,
		hasGlobalMap: config.map.enabled && config.map.globalMap && albums.some((a) => a.bounds)
	};
};
