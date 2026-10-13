import type { AlbumMeta, AlbumSummary, Photo } from '../types.ts';
import { compactSources, type ImageSources } from '../utils/sources.ts';

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
