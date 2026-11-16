import { error } from '@sveltejs/kit';
import { publicAlbums, rootAlbum } from '#lib/server/manifest.ts';
import { albumPath, photoPath } from '#lib/utils/href.ts';
import { siteConfig, siteSettings } from '#lib/server/site.ts';
import type { RequestHandler } from './$types';

export const prerender = true;

const escape = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const GET: RequestHandler = () => {
	const config = siteConfig();
	if (!config.feeds.sitemap) error(404, 'Sitemap disabled');
	const { baseUrl } = siteSettings();
	// A sitemap lists absolute addresses: without one (a build for no host) there is none.
	if (!baseUrl) error(404, 'No site address');
	const albums = publicAlbums();
	const root = rootAlbum()?.slug;
	const urls: { loc: string; lastmod?: string; image?: { loc: string; title?: string } }[] = [];
	// A single-album site serves the album at the root, so the home page is the album's entry.
	if (!root) urls.push({ loc: `${baseUrl}/` });
	for (const album of albums) {
		const lastmod = album.dateRange?.to ?? album.date;
		urls.push({ loc: `${baseUrl}${albumPath(album.slug, root)}`, lastmod: lastmod?.slice(0, 10) });
		for (const photo of album.photos) {
			const jpeg =
				'base' in photo.sources
					? `${photo.sources.base}-${photo.sources.jpegWidth}.jpg`
					: photo.sources.jpeg;
			urls.push({
				loc: `${baseUrl}${photoPath(album.slug, photo.id, root)}`,
				lastmod: photo.date?.slice(0, 10),
				image: { loc: baseUrl + jpeg, title: photo.title }
			});
		}
		if (config.map.enabled && album.bounds)
			urls.push({ loc: `${baseUrl}${albumPath(album.slug, root)}map/` });
	}
	if (!root && config.map.enabled && config.map.globalMap && albums.some((a) => a.bounds))
		urls.push({ loc: `${baseUrl}/map/` });

	const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls
	.map(
		(u) =>
			`  <url><loc>${escape(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}${
				u.image
					? `<image:image><image:loc>${escape(u.image.loc)}</image:loc>${u.image.title ? `<image:title>${escape(u.image.title)}</image:title>` : ''}</image:image>`
					: ''
			}</url>`
	)
	.join('\n')}
</urlset>
`;
	return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
