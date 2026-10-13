import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import * as v from 'valibot';

const dateish = v.union([v.string(), v.date()]);

const PhotoOverrideSchema = v.object({
	title: v.optional(v.string()),
	caption: v.optional(v.string()),
	alt: v.optional(v.string()),
	hidden: v.optional(v.boolean(), false),
	location: v.optional(v.picklist(['show', 'approximate', 'hide'])),
	downloads: v.optional(v.picklist(['none', 'large', 'original'])),
	date: v.optional(dateish)
});

export const SidecarSchema = v.object({
	title: v.optional(v.string()),
	description: v.optional(v.string()),
	date: v.optional(dateish),
	cover: v.optional(v.string()),
	sort: v.optional(v.picklist(['date-asc', 'date-desc', 'filename', 'manual'])),
	order: v.optional(v.array(v.string()), []),
	visibility: v.optional(v.picklist(['public', 'unlisted', 'private']), 'public'),
	password_env: v.optional(v.string()),
	downloads: v.optional(v.picklist(['none', 'large', 'original'])),
	location: v.optional(v.picklist(['show', 'approximate', 'hide'])),
	exif_panel: v.optional(v.boolean()),
	photos: v.optional(v.record(v.string(), PhotoOverrideSchema), {})
});

export type Sidecar = v.InferOutput<typeof SidecarSchema>;
export type PhotoOverride = v.InferOutput<typeof PhotoOverrideSchema>;

export const EMPTY_SIDECAR: Sidecar = v.parse(SidecarSchema, {});

export function normaliseDate(value: string | Date | undefined): string | undefined {
	if (value === undefined) return undefined;
	if (value instanceof Date) {
		return value.toISOString().slice(0, 19);
	}
	const s = value.trim();
	// Accept YYYY, YYYY-MM, YYYY-MM-DD, YYYY-MM-DDTHH:mm[:ss], and strip any timezone suffix.
	const m = s.match(/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
	if (!m) return s;
	let out = m[1];
	if (m[2]) out += `-${m[2]}`;
	if (m[3]) out += `-${m[3]}`;
	if (m[4]) out += `T${m[4]}:${m[5]}:${m[6] ?? '00'}`;
	return out;
}

export function loadSidecar(path: string | undefined): { sidecar: Sidecar; error?: string } {
	if (!path) return { sidecar: EMPTY_SIDECAR };
	let raw: unknown;
	try {
		raw = parse(readFileSync(path, 'utf8')) ?? {};
	} catch (e) {
		return { sidecar: EMPTY_SIDECAR, error: `${path}: ${(e as Error).message}` };
	}
	const result = v.safeParse(SidecarSchema, raw);
	if (!result.success) {
		const issues = result.issues
			.map((i) => `${i.path?.map((p) => String(p.key)).join('.') ?? ''}: ${i.message}`)
			.join('; ');
		return { sidecar: EMPTY_SIDECAR, error: `${path}: ${issues}` };
	}
	return { sidecar: result.output };
}
