import { error } from '@sveltejs/kit';
import { publicAlbums } from '#lib/server/manifest.ts';
import { siteConfig, siteSettings } from '#lib/server/site.ts';
import type { RequestHandler } from './$types';

export const prerender = true;

const escape = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function rfc822(date: string | undefined): string {
	const d = date ? new Date(date.length <= 10 ? `${date}T12:00:00` : date) : new Date();
	return Number.isNaN(d.getTime()) ? new Date().toUTCString() : d.toUTCString();
}

export const GET: RequestHandler = () => {
	const config = siteConfig();
	if (!config.feeds.rss) error(404, 'RSS disabled');
	const site = siteSettings();
	const albums = publicAlbums();
	const items = albums
		.map((album) => {
			const url = `${site.baseUrl}/${album.slug}/`;
			const cover =
				'base' in album.cover.sources
					? `${album.cover.sources.base}-${album.cover.sources.jpegWidth}.jpg`
					: album.cover.sources.jpeg;
			const description = album.descriptionHtml ?? `<p>${album.count} photos</p>`;
			return `    <item>
      <title>${escape(album.title)}</title>
      <link>${escape(url)}</link>
      <guid isPermaLink="true">${escape(url)}</guid>
      <pubDate>${rfc822(album.date ?? album.dateRange?.from)}</pubDate>
      <description><![CDATA[<p><img src="${site.baseUrl + cover}" alt="${escape(album.cover.alt)}" /></p>${description}]]></description>
      <enclosure url="${escape(site.baseUrl + cover)}" type="image/jpeg" length="0" />
    </item>`;
		})
		.join('\n');
	const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escape(site.title)}</title>
    <link>${escape(site.baseUrl)}/</link>
    <description>${escape(site.description)}</description>
    <language>${escape(site.language)}</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${escape(site.baseUrl)}/rss.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;
	return new Response(body, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
};
