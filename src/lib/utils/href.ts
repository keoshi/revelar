import { resolve } from '$app/paths';

/** Prefix a site-relative path (starting with `/`) with the configured base path. */
export function withBase(path: string): string {
	const base = resolve('/').replace(/\/$/, '');
	return `${base}${path}`;
}

/**
 * A site with a single public album serves it at the root: `/` is the album, `/<photo>/` its
 * photos, `/map/` its map. Several albums each get their own folder. The root album's slug is
 * set once from the layout data, for the links pages render; server code passes it in.
 */
let rootSlug: string | undefined;
export function setRootAlbum(slug: string | undefined): void {
	rootSlug = slug;
}

/** Site-relative path of an album page, without the base path. */
export function albumPath(slug: string, root = rootSlug): string {
	return slug === root ? '/' : `/${slug}/`;
}

/** Site-relative path of a photo page, without the base path. */
export function photoPath(slug: string, id: string, root = rootSlug): string {
	return slug === root ? `/${id}/` : `/${slug}/${id}/`;
}

export function albumHref(slug: string): string {
	return withBase(albumPath(slug));
}

export function photoHref(slug: string, id: string): string {
	return withBase(photoPath(slug, id));
}

/** The album's photo list, which thin photo pages fetch. */
export function albumJsonHref(slug: string): string {
	return withBase(`${albumPath(slug)}album.json`);
}
