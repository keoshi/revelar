import * as v from 'valibot';

/**
 * Revelar site configuration. One typed file at the repo root (`revelar.config.ts`)
 * is validated at ingest time; invalid config fails the build with a readable message.
 */

const hexColor = v.pipe(v.string(), v.regex(/^#[0-9a-fA-F]{6}$/, 'must be a 6-digit hex colour'));

const SiteSchema = v.object({
	title: v.optional(v.string(), 'Photographs'),
	description: v.optional(v.string(), ''),
	baseUrl: v.pipe(
		v.string('site.baseUrl is required (used for canonical and Open Graph URLs)'),
		v.url('site.baseUrl must be an absolute URL, e.g. https://photos.example.com')
	),
	author: v.optional(v.string(), ''),
	copyright: v.optional(v.string(), ''),
	language: v.optional(v.string(), 'en'),
	intro: v.optional(v.string(), '')
});

const DefaultsSchema = v.object({
	sort: v.optional(v.picklist(['date-asc', 'date-desc', 'filename', 'manual']), 'date-asc'),
	downloads: v.optional(v.picklist(['none', 'large', 'original']), 'large'),
	location: v.optional(v.picklist(['show', 'approximate', 'hide']), 'approximate'),
	exifPanel: v.optional(v.boolean(), true),
	maxZipBytes: v.optional(v.number())
});

const ImagesSchema = v.object({
	widths: v.optional(
		v.array(v.pipe(v.number(), v.integer(), v.minValue(64))),
		[320, 640, 960, 1280, 1920, 2560, 3840]
	),
	avifQuality: v.optional(v.pipe(v.number(), v.minValue(1), v.maxValue(100)), 55),
	avifEffort: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(9)), 4),
	webpQuality: v.optional(v.pipe(v.number(), v.minValue(1), v.maxValue(100)), 78),
	jpegQuality: v.optional(v.pipe(v.number(), v.minValue(1), v.maxValue(100)), 82)
});

const ViewerSchema = v.object({
	defaultView: v.optional(v.literal('grid'), 'grid'),
	slideshowInterval: v.optional(v.pipe(v.number(), v.minValue(1000)), 5000),
	transition: v.optional(v.picklist(['crossfade', 'slide', 'none']), 'crossfade'),
	gridRowHeight: v.optional(
		v.object({
			desktop: v.optional(v.number(), 280),
			mobile: v.optional(v.number(), 180)
		}),
		{ desktop: 280, mobile: 180 }
	),
	filmstrip: v.optional(v.boolean(), true)
});

const ThemeSchema = v.object({
	mode: v.optional(v.picklist(['system', 'dark', 'light']), 'system'),
	accent: v.optional(hexColor, '#e8c37a'),
	accentLight: v.optional(hexColor, '#8a5a00'),
	fontSans: v.optional(v.picklist(['inter', 'system']), 'inter')
});

const MapSchema = v.object({
	enabled: v.optional(v.boolean(), true),
	globalMap: v.optional(v.boolean(), false),
	styleLight: v.optional(v.string(), 'https://tiles.openfreemap.org/styles/liberty'),
	styleDark: v.optional(v.string(), 'https://tiles.openfreemap.org/styles/dark')
});

export const ConfigSchema = v.object({
	site: SiteSchema,
	photosDir: v.optional(v.string(), './photos'),
	albumOrder: v.optional(v.picklist(['date-desc', 'date-asc', 'title', 'manual']), 'date-desc'),
	albumManualOrder: v.optional(v.array(v.string()), []),
	defaults: v.optional(DefaultsSchema, {}),
	images: v.optional(ImagesSchema, {}),
	viewer: v.optional(ViewerSchema, {}),
	theme: v.optional(ThemeSchema, {}),
	map: v.optional(MapSchema, {}),
	privacy: v.optional(v.object({ showPrivateTitles: v.optional(v.boolean(), false) }), {}),
	feeds: v.optional(
		v.object({
			rss: v.optional(v.boolean(), true),
			sitemap: v.optional(v.boolean(), true)
		}),
		{}
	)
});

/** The user-facing input shape: every field except `site.baseUrl` is optional. */
export type RevelarConfigInput = v.InferInput<typeof ConfigSchema>;
/** The resolved shape with all defaults applied. */
export type RevelarConfig = v.InferOutput<typeof ConfigSchema>;

export class ConfigError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ConfigError';
	}
}

/** Validate a config object, applying defaults. Throws a readable ConfigError. */
export function validateConfig(input: unknown): RevelarConfig {
	const result = v.safeParse(ConfigSchema, input);
	if (result.success) return result.output;
	const lines = result.issues.map((issue) => {
		const path = issue.path?.map((p) => String(p.key)).join('.') ?? '(root)';
		return `  • ${path}: ${issue.message}`;
	});
	throw new ConfigError(`Invalid revelar.config.ts:\n${lines.join('\n')}`);
}

/** Identity helper for typed config files; validation happens at ingest. */
export function defineConfig(config: RevelarConfigInput): RevelarConfigInput {
	return config;
}

/** The subset of config that is safe and useful to ship to the client. */
export type SiteSettings = {
	title: string;
	description: string;
	baseUrl: string;
	author: string;
	copyright: string;
	language: string;
	introHtml: string;
	theme: RevelarConfig['theme'];
	viewer: RevelarConfig['viewer'];
	map: RevelarConfig['map'];
	defaults: Pick<RevelarConfig['defaults'], 'exifPanel' | 'maxZipBytes'>;
};
