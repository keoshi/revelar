import type { AlbumMeta, AlbumSummary, Photo } from '../types.ts';
import { compactSources, type ImageSources } from '../utils/sources.ts';
import { INLINE_LAYOUT_SCRIPT } from '../utils/layout-inline.ts';
import { siteConfig } from './site.ts';

/** Everything about an album except its photo list: what a thin photo page needs inline. */
export function albumMeta(album: AlbumSummary): AlbumMeta {
	const { photos: _photos, ...rest } = album;
	void _photos;
	return {
		...rest,
		cover: { ...album.cover, sources: compactSources(album.cover.sources as ImageSources) }
	};
}

/** A single photo with compacted sources, for the thin photo page. */
export function photoPageData(photo: Photo): Photo {
	return { ...photo, sources: compactSources(photo.sources as ImageSources) };
}

/** Album slice for the album page, with sources compacted to keep inline data small. */
export function albumPageData(album: AlbumSummary): AlbumSummary {
	return {
		...album,
		cover: { ...album.cover, sources: compactSources(album.cover.sources as ImageSources) },
		photos: album.photos.map((p): Photo => ({
			...p,
			sources: compactSources(p.sources as ImageSources)
		}))
	};
}

const albumHasMap = (album: AlbumSummary) => siteConfig().map.enabled && Boolean(album.bounds);

/** What an album page loads, wherever it is served (its folder, or the root). */
export function albumLoad(album: AlbumSummary) {
	return {
		album: albumPageData(album),
		hasMap: albumHasMap(album),
		inlineScript: INLINE_LAYOUT_SCRIPT
	};
}

/**
 * What a photo page loads: only this photo and the album's metadata are inline (for the
 * crawler-visible image, Open Graph and JSON-LD); the photo list comes from album.json.
 * Undefined when the album has no such photo.
 */
export function photoLoad(album: AlbumSummary, id: string) {
	const index = album.photos.findIndex((p) => p.id === id);
	if (index < 0) return undefined;
	return {
		album: albumMeta(album),
		photo: photoPageData(album.photos[index]),
		index,
		hasMap: albumHasMap(album)
	};
}

/** What an album's map page loads, or undefined when the album has no map. */
export function albumMapLoad(album: AlbumSummary) {
	if (!albumHasMap(album) || !album.bounds) return undefined;
	return {
		slug: album.slug,
		title: album.title,
		visibility: album.visibility,
		bounds: album.bounds,
		photos: album.photos
			.filter((p) => p.gps)
			.map((p) => ({
				id: p.id,
				title: p.title,
				alt: p.alt,
				gps: p.gps!,
				sources: compactSources(p.sources as ImageSources),
				color: p.color
			}))
	};
}
