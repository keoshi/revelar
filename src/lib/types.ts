/** Shared manifest types. Produced by `scripts/ingest.ts`, consumed by routes. */
import type { PhotoSources } from './utils/sources.ts';

export type Srcset = { url: string; width: number }[];

export type PhotoExif = {
	make?: string;
	model?: string;
	lens?: string;
	focal?: number;
	aperture?: number;
	shutter?: string;
	iso?: number;
	ev?: number;
};

export type PhotoGps = { lat: number; lng: number; precision: 'exact' | 'approximate' };

export type PhotoDownload = { url: string; bytes: number; kind: 'large' | 'original' };

export type Photo = {
	id: string;
	file: string;
	width: number;
	height: number;
	aspect: number;
	title?: string;
	caption?: string;
	alt: string;
	date?: string;
	keywords: string[];
	thumbhash: string;
	color: string;
	/** explicit in the manifest; may be compacted by server loads before reaching the client */
	sources: PhotoSources;
	exif?: PhotoExif;
	gps?: PhotoGps;
	download?: PhotoDownload;
};

export type PhotoRef = Pick<
	Photo,
	'id' | 'width' | 'height' | 'aspect' | 'alt' | 'thumbhash' | 'color' | 'sources'
>;

export type AlbumVisibility = 'public' | 'unlisted';

export type AlbumSummary = {
	slug: string;
	title: string;
	description?: string;
	descriptionHtml?: string;
	date?: string;
	dateRange?: { from: string; to: string };
	visibility: AlbumVisibility;
	cover: PhotoRef;
	count: number;
	photos: Photo[];
	bounds?: [[number, number], [number, number]];
	exifPanel: boolean;
	downloads: 'none' | 'large' | 'original';
	albumDownload?:
		| { url: string; bytes: number; files: number }
		| { inBrowser: true; bytes: number; files: number };
};

/** An album without its photo list; photo pages ship this inline and fetch `album.json` for the rest. */
export type AlbumMeta = Omit<AlbumSummary, 'photos'>;

export type PrivateAlbumEntry = {
	slug: string;
	token: string;
	title?: string;
	/** base64 AES-GCM ciphertext of the album slice (IV prefixed). */
	blob: string;
	/** base64 PBKDF2 salt */
	salt: string;
	iterations: number;
	/** base64 AES-GCM wrapped DEK (IV prefixed). */
	wrappedKey: string;
};

/** The album slice stored inside a private album blob. */
export type PrivateAlbumPayload = {
	slug: string;
	title: string;
	description?: string;
	descriptionHtml?: string;
	date?: string;
	dateRange?: { from: string; to: string };
	count: number;
	photos: Photo[];
	bounds?: [[number, number], [number, number]];
	exifPanel: boolean;
	downloads: 'none' | 'large' | 'original';
	albumDownload?: { inBrowser: true; bytes: number; files: number };
};

export type Manifest = {
	generatedAt: string;
	site: { title: string; baseUrl: string };
	albums: AlbumSummary[];
	privateAlbums: PrivateAlbumEntry[];
};

export const EMPTY_MANIFEST: Manifest = {
	generatedAt: new Date(0).toISOString(),
	site: { title: '', baseUrl: '' },
	albums: [],
	privateAlbums: []
};
