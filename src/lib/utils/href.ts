import { resolve } from '$app/paths';

/** Prefix a site-relative path (starting with `/`) with the configured base path. */
export function withBase(path: string): string {
	const base = resolve('/').replace(/\/$/, '');
	return `${base}${path}`;
}

export function albumHref(slug: string): string {
	return withBase(`/${slug}/`);
}

export function photoHref(slug: string, id: string): string {
	return withBase(`/${slug}/${id}/`);
}
