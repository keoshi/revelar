import type { AlbumSummary, Photo } from '../types.ts';
import { compactSources, type ImageSources } from '../utils/sources.ts';

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
