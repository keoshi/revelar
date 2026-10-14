# Revelar — build spec

Oct 13, 2026 · @Filipe Varela

> **Status.** Built on Oct 13, 2026, through all ten milestones below. This is the original spec, amended where the implementation deliberately differs; those amendments are marked **As built** inline and summarised in [As built: deviations from this spec](#as-built-deviations-from-this-spec). The live site is at https://dev.keoshi.com/revelar/ and the code is on GitHub at https://github.com/keoshi/revelar.

## Overview

Revelar (Portuguese for "to develop", as in film) is a static, photo-first gallery website where dropping photos into folders and running one build command produces a complete, polished site. It is a modern successor to SlideShowPro (Todd Dominey, 2005): the same "folder in, beautiful gallery out" promise, rebuilt with SvelteKit, modern image formats and no plugin runtime.

**Goals**

- Zero-touch content: a new folder of JPEGs becomes a new album with sensible defaults; no database, no admin UI.
- Photographs look their best: large, sharp, colour-correct, with refined motion and minimal chrome.
- Fast everywhere: responsive AVIF/WebP, placeholders that show instantly, no layout shift.
- Deploys to any static host (Netlify, Vercel, Cloudflare Pages, GitHub Pages, plain FTP/rsync).
- Metadata-driven: titles and captions come from the files themselves (Lightroom/Capture One), overridable per album.

**Non-goals for v1**

- No server runtime, upload UI, or CMS. Adding photos means adding files and rebuilding.
- No embeddable widget for third-party pages (the viewer should be componentised so this can come later).
- No video, comments, likes, or e-commerce/print sales.
- No multi-level nested albums (one level of subfolders only).

## Decisions and constraints

These were settled during scoping and are not open for Claude Code to revisit.

| Area          | Decision                                                                                                  |
| ------------- | --------------------------------------------------------------------------------------------------------- |
| Framework     | SvelteKit with `@sveltejs/adapter-static`, fully prerendered; Svelte 5 runes throughout                   |
| Product       | Standalone gallery website (not an embed)                                                                 |
| Albums        | Each top-level subfolder of `photos/` is an album; one level deep, plus a home/index page                 |
| Metadata      | EXIF/IPTC/XMP read from files; optional `album.yaml` sidecar overrides per album and per photo            |
| Viewing modes | Justified grid (always the first view), plus one fullscreen viewer with filmstrip and autoplay (no music) |
| v1 extras     | Private albums, downloads, EXIF info panel, map of photo locations                                        |
| Design        | Minimal, photo-first; neutral/dark chrome that recedes                                                    |
| Hosting       | Any static host; nothing may depend on host-specific features                                             |

The static-host constraint shapes two features: private albums use client-side encryption rather than server auth, and "adding photos" always means a rebuild (automatable via CI or a watch script).

## Tech stack

Use the latest stable release of each package at scaffold time and commit the lockfile. Do not use pre-release majors (for example SvelteKit 3 `@next`).

**As built:** SvelteKit 3.0 had shipped as stable by scaffold time, so the project is on Kit 3 (configuration lives in `vite.config.ts`, `#lib/*` subpath imports with explicit `.ts` extensions, async `pushState`). Node 24 is used locally.

| Layer                   | Package                                                                      | Why                                                                                                             |
| ----------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Framework               | `@sveltejs/kit` 3.x, `svelte` 5.x, `@sveltejs/adapter-static`                | Prerendered output, runes for state, tiny runtime ([SvelteKit releases](https://releases.sh/svelte/sveltekit))  |
| Language                | TypeScript (strict), Node 22 LTS or newer                                    | Typed manifest shared by build script and UI                                                                    |
| Scaffolding             | `npx sv create` (minimal template, TS, Prettier, ESLint, Vitest, Playwright) | Official CLI                                                                                                    |
| Image processing        | `sharp`                                                                      | libvips-based resizing to AVIF/WebP/JPEG with correct ICC handling                                              |
| Metadata                | `exifr`                                                                      | Parses EXIF, GPS, IPTC and XMP in Node, including HEIC/AVIF                                                     |
| Sidecar parsing         | `yaml`                                                                       | Reads `album.yaml`                                                                                              |
| Placeholders            | `thumbhash`                                                                  | Smaller and more accurate than BlurHash, encodes aspect ratio ([ThumbHash](https://evanw.github.io/thumbhash/)) |
| Grid layout             | `justified-layout` (Flickr)                                                  | Proven justified-row algorithm; run client-side on resize                                                       |
| Lightbox gestures       | `photoswipe` 5.x                                                             | Mature pinch-zoom, swipe and srcset handling; wrapped in a Svelte component and themed to match                 |
| Map                     | `maplibre-gl` + OpenFreeMap style URL                                        | Free vector tiles, no API key; dynamically imported only on map routes                                          |
| Crypto (private albums) | WebCrypto (browser), `node:crypto` (build)                                   | No dependency; AES-GCM + PBKDF2                                                                                 |
| Concurrency             | `p-limit`                                                                    | Bounded parallel image processing                                                                               |
| Testing                 | Vitest, Playwright                                                           | Unit tests for pipeline, E2E for viewer                                                                         |

The slideshow, filmstrip and grid are hand-built Svelte components; PhotoSwipe is used only for the fullscreen lightbox, where its gesture engine saves weeks of work.

## Content model

Photos live outside `src/` in a `photos/` folder; every immediate subfolder is an album, and files directly in `photos/` are ignored with a warning.

```
photos/
  2025-lisbon-walks/
    album.yaml          # optional
    DSC01234.jpg
    DSC01240.jpg
  iceland/
    001.jpg
  _drafts/              # leading underscore = skipped
```

**Accepted inputs:** JPEG, PNG, WebP, AVIF, TIFF, HEIC (HEIC only where sharp's libvips build supports it; otherwise warn and skip). Hidden files and files starting with `_` are skipped.

**Album slug:** folder name, lowercased and slugified. An optional `YYYY-MM-DD-` or `YYYY-` prefix is stripped from the slug and used as the album date.

**Photo identity:** a stable `id` = first 10 characters of a SHA-256 of the file's relative path. Renaming a file changes its id; editing pixels does not. Output filenames use a separate content hash so caches bust on edits.

### album.yaml

Every field is optional. Values here override embedded metadata.

```yaml
title: Lisbon walks
description: |
  Early mornings in Alfama and Graça. Markdown allowed.
date: 2025-03-14 # overrides folder prefix and EXIF
cover: DSC01240.jpg # default: first photo after sorting
sort: date-asc # date-asc | date-desc | filename | manual
order: # used when sort: manual; unlisted files go last by filename
  - DSC01240.jpg
  - DSC01234.jpg
visibility: public # public | unlisted | private
password_env: ALBUM_ICELAND_PW # private only; name of env var, never the password
downloads: original # none | large | original (overrides site default)
location: hide # show | approximate | hide (overrides site default)
exif_panel: true
photos:
  DSC01234.jpg:
    title: Tram 28 at dawn
    caption: The first tram, before the tourists.
    alt: Yellow tram climbing a narrow cobbled street at sunrise
    hidden: false
    location: hide
```

### Metadata precedence

For each field the first non-empty source wins:

| Field    | 1. Sidecar            | 2. XMP                              | 3. IPTC          | 4. EXIF               | 5. Fallback                                          |
| -------- | --------------------- | ----------------------------------- | ---------------- | --------------------- | ---------------------------------------------------- |
| Title    | `photos.<file>.title` | `dc:title`                          | ObjectName       | —                     | none (no filename titles)                            |
| Caption  | `.caption`            | `dc:description`                    | Caption-Abstract | ImageDescription      | none                                                 |
| Alt text | `.alt`                | `Iptc4xmpCore:AltTextAccessibility` | —                | —                     | caption, then title, then "Photo N of M in \<album>" |
| Date     | `.date`               | `photoshop:DateCreated`             | DateCreated      | DateTimeOriginal      | file mtime                                           |
| Keywords | —                     | `dc:subject`                        | Keywords         | —                     | \[\]                                                 |
| GPS      | —                     | —                                   | —                | GPSLatitude/Longitude | none                                                 |

Camera fields (make, model, lens, focal length, aperture, shutter, ISO, exposure compensation) come from EXIF only. Text is trimmed, normalised to NFC, and stripped of control characters.

## Build pipeline

A standalone Node script (`scripts/ingest.ts`, run via `tsx`) turns `photos/` into derivatives plus one typed manifest, and runs before `vite build`. SvelteKit never touches original files.

1. **Scan** `photos/` (via `config.photosDir`), apply skip rules, collect albums and files.
2. **Hash** each original (SHA-256 of bytes) and look it up in `.cache/ingest.json`. Unchanged files reuse cached metadata and derivatives; nothing is re-encoded.
3. **Read metadata** with `exifr.parse(file, { tiff: true, exif: true, gps: true, iptc: true, xmp: true, icc: false })`, then merge the sidecar using the precedence table.
4. **Normalise orientation**: `sharp().rotate()` bakes in EXIF orientation; stored width and height are post-rotation.
5. **Encode derivatives** with `p-limit` (concurrency = CPU count − 1):
   - Widths: 320, 640, 960, 1280, 1920, 2560, 3840 (never upscale; skip widths larger than the original).
   - Formats: AVIF (quality 55, effort 4) and WebP (quality 78); plus one JPEG at 1920 for Open Graph and the "large" download.
   - Convert to sRGB and embed a compact sRGB ICC profile; strip all other metadata from derivatives (privacy: no GPS leaks).
   - Output path: `static/media/<album>/<id>-<contenthash8>-<width>.<ext>`, or `static/media-private/...` for private albums (see Extras).
6. **Placeholders**: ThumbHash from a ≤100 px version, stored as base64 in the manifest; also store the average colour as hex for the instant background.
7. **Downloads**: when downloads resolve to `original`, place the original file in `static/downloads/` (see the GPS note below).
8. **Write manifest** to `src/lib/generated/manifest.json` plus `manifest.d.ts` types. Private albums are written as encrypted blobs instead.
9. **Prune**: delete derivatives in `static/media*` no longer referenced; update the cache file.
10. **Report**: print a summary (albums, photos, new/reused/removed, warnings, total bytes, time).

**Original downloads and GPS.** Copying originals byte-for-byte keeps GPS. When an album's effective location setting is `hide` or `approximate`, the downloadable "original" must instead be a full-resolution, maximum-quality JPEG re-encoded by sharp with metadata limited to copyright and camera fields. Document this trade-off in the README.

### Manifest shape (TypeScript)

```ts
type Manifest = {
	generatedAt: string;
	site: { title: string; baseUrl: string };
	albums: AlbumSummary[]; // public + unlisted only, for routing
	privateAlbums: { slug: string; title?: string; blob: string }[]; // title only if config.showPrivateTitles
};
type AlbumSummary = {
	slug: string;
	title: string;
	description?: string;
	date?: string;
	visibility: 'public' | 'unlisted';
	cover: PhotoRef;
	count: number;
	photos: Photo[];
	bounds?: [[number, number], [number, number]]; // for the map
};
type Photo = {
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
	sources: { avif: Srcset; webp: Srcset; jpeg: string };
	exif?: {
		make?: string;
		model?: string;
		lens?: string;
		focal?: number;
		aperture?: number;
		shutter?: string;
		iso?: number;
		ev?: number;
	};
	gps?: { lat: number; lng: number; precision: 'exact' | 'approximate' };
	download?: { url: string; bytes: number; kind: 'large' | 'original' };
};
type Srcset = { url: string; width: number }[];
```

Routes import only the slice they need (album list on home, one album per album page) so the full manifest is never shipped to the client.

## Routes and information architecture

Every route is prerendered (`export const prerender = true` in the root layout; `trailingSlash = 'always'` so plain static hosts serve `index.html` files).

| Route               | Purpose                                                           | Notes                                                                 |
| ------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------- |
| `/`                 | Home: grid of album covers, newest first (or `config.albumOrder`) | Public albums only; site title, optional intro text. **As built:** a site with exactly one public album prerenders `/` as a redirect to that album, and the header title links there |
| `/[album]/`         | Album: justified grid with title, date, description, count        | Always the first view of an album; Play and Map actions in the header |
| `/[album]/[photo]/` | Album grid with the fullscreen viewer open on one photo           | Prerendered per photo so links unfurl with the right Open Graph image |
| `/[album]/map/`     | Map of the album's geotagged photos                               | Only generated when ≥1 photo has displayable GPS                      |
| `/map/`             | Map of all public geotagged photos                                | Optional via `config.map.globalMap`                                   |
| `/p/[token]/`       | Private album shell: password prompt, then decrypted album        | `token` is random, not the slug; see Extras                           |
| `/404`              | Not found                                                         | Static `404.html` for hosts that support it                           |

**URL state.** The open photo is part of the path (`/[album]/[photo]/`), using SvelteKit shallow routing (`pushState`/`replaceState`) so moving between photos updates the URL without a full navigation. Opening the lightbox from the grid pushes state; Back closes it. View mode (grid or slideshow) is not part of the URL beyond the routes above.

**Unlisted albums** are prerendered at their normal slug but are excluded from the home page, the global map, the sitemap and RSS, and carry `<meta name="robots" content="noindex">`.

**Feeds and SEO files** (generated at build): `sitemap.xml` (public only), `rss.xml` (one item per album), `robots.txt`.

## Viewer

The grid and the fullscreen viewer share one Svelte 5 store per album (`createAlbumState(album)` using `$state`), holding the current index, view mode, panel visibility and preload queue. `The static segment map takes` precedence over the `[photo]` param; photo ids are 10-character hex so they never collide.

### 1. Justified grid (album default)

- Layout computed by `justified-layout` from photo aspect ratios on mount and on container resize (`ResizeObserver`, debounced to one animation frame).
- Target row height: 280 px desktop, 180 px below 640 px width; box spacing 4 px; last row left-aligned, not stretched.
- Each tile renders `<picture>` with AVIF and WebP `srcset` and a `sizes` value equal to the computed box width; `loading="lazy"` and `decoding="async"` except the first row.
- Before load, the tile shows the ThumbHash (decoded to a data URL once per photo) over its average colour; the real image fades in over 240 ms on `load`.
- Hover (pointer devices): subtle 1.02 scale and title overlay at the bottom. Focus shows the same overlay plus a 2 px focus ring.
- Click or Enter opens the photo in the fullscreen viewer.
- Above the grid: album title, date range, description (Markdown), photo count, and actions: Play (opens the viewer on the first photo with autoplay on), Download album (when enabled) and Map (when available).

### 2. Fullscreen viewer (the SlideShowPro view)

One immersive viewer replaces a separate slideshow and lightbox; the filmstrip lives inside it.

- Opens from the grid (click or Enter on a tile) with a zoom-from-thumbnail animation. The URL becomes `/[album]/[photo]/` via shallow routing; Esc, Back or a downward swipe closes it and returns focus to the originating tile.
- Built on PhotoSwipe 5 (dynamically imported on first open) for its gesture engine: swipe, pinch and double-tap zoom, pan, drag down to close, and larger srcset derivatives loaded on zoom. All UI is custom, registered through PhotoSwipe's UI API and styled with the design tokens.
- Stage: dark background, photo contained, never cropped, never upscaled beyond the largest derivative.
- Filmstrip: along the bottom, 72 px square-cropped thumbnails (56 px on mobile). The active thumb is centred with smooth scroll and shown at full opacity with an underline; others sit at 55%. Drag- and wheel-scrollable, virtualised past 200 items, toggled with T. Collapsed by default below 640 px width, revealed by a tap on the counter.
- Controls: close, counter ("12 / 48"), previous, next, play/pause, info, download (when enabled), filmstrip toggle, native fullscreen (Fullscreen API where supported; on iOS the viewer is already edge-to-edge).
- Chrome (controls, caption, filmstrip) auto-hides after 2.5 s of inactivity; any pointer move or tap brings it back.
- Transitions: PhotoSwipe's slide on manual navigation. During autoplay, a 400 ms crossfade (`cubic-bezier(0.2, 0, 0, 1)`), starting only after `img.decode()` resolves. If the crossfade fights PhotoSwipe's slide model, fall back to its slide transition and note it. `prefers-reduced-motion` makes all changes instant. **As built:** `config.viewer.transition` applies to manual navigation as well as autoplay (`crossfade`, the default, fades through an opaque layer in 240 ms when navigating and 400 ms between slideshow photos; `slide` keeps PhotoSwipe's slide; `none` is instant). Swipes always follow the finger.
- Autoplay: advances every 5 s (`config.viewer.slideshowInterval`) with a thin progress line on the controls; pauses on any interaction, when the tab is hidden, or when the info panel opens. Loops at the end.
- Caption: bottom-left over a subtle gradient scrim, above the filmstrip; title (semibold) and caption, at most 3 lines, expandable.
- Preloading: next and previous photos at the viewport's resolved size; during autoplay, also the one after next.
- Keyboard: ←/→ previous/next, Space play/pause, I info, T filmstrip, D download, F native fullscreen, Esc close.
- Direct links: `/[album]/[photo]/` is prerendered as the album grid with the viewer open on that photo, plus a plain `<img>` and caption in the HTML for crawlers and no-JS visitors.

### Shared components

`<Picture>` (picture element + ThumbHash), `<Grid>`, `<Viewer>` (PhotoSwipe wrapper), `<Filmstrip>`, `<Controls>`, `<InfoPanel>`, `<MapView>`, `<PasswordGate>`, `<AlbumHeader>`, `<SiteHeader>`. Components receive data as props and never import the manifest themselves.

## Extras

### Private albums

Two levels, both static-host safe:

- **Unlisted** (`visibility: unlisted`): normal album at its slug, hidden from all listings, `noindex`. Anyone with the link can view. Images are not encrypted.
- **Private** (`visibility: private`): password-protected by client-side encryption. Off-the-shelf tools such as [StatiCrypt](https://github.com/robinmoisson/staticrypt/) encrypt HTML only, not linked images, so this is custom.

Private album scheme:

1. At build, generate a random 256-bit album key (DEK) and a random 16-byte salt.
2. Derive a key-encryption key from the password (read from the env var named in `password_env`; build fails if missing) with PBKDF2-SHA-256, 600,000 iterations, and use it to wrap the DEK with AES-GCM.
3. Encrypt the album's manifest slice with the DEK (AES-GCM, random 12-byte IV) and store it as `blob` in the manifest, alongside salt, iterations and wrapped DEK.
4. Encrypt every derivative file with the DEK (fresh IV per file, IV prefixed to the ciphertext) and write it to `static/media-private/<token>/<random-name>.bin`. Filenames reveal nothing; no thumbhash or colour is exposed in plaintext.
5. The album route is `/p/<token>/` where `token` is 16 random URL-safe characters, persisted in `.cache/private-tokens.json` so links stay stable across builds.
6. In the browser, `<PasswordGate>` derives the key with WebCrypto, unwraps the DEK, decrypts the manifest, then fetches `.bin` files, decrypts them in a Web Worker and renders them via `blob:` URLs (revoked on navigation). AVIF/WebP selection uses a one-off feature check instead of `<picture>`.
7. "Remember on this device" stores the unwrapped DEK in `sessionStorage` (default) or `localStorage` (opt-in checkbox), keyed by token.
8. Optional `#k=<base64url DEK>` link fragment unlocks without a password (fragment is never sent to the server); `npm run share <album>` prints this link.

Limits to state in the README: security equals password strength (recommend 16+ characters); changing a password re-encrypts the album; private albums never appear in sitemap, RSS or global map; WebCrypto requires HTTPS (or localhost).

### Downloads

- Site default `downloads: none | large | original`, overridable per album and per photo.
- `large` = the 1920 px JPEG derivative (already metadata-stripped). `original` = the original file, or the GPS-safe re-encode described in Build pipeline.
- The download button uses `<a download="<album>-<file>">` with file size shown ("Download · 8.4 MB"). For private albums the decrypted blob is saved via an object URL; originals in private albums are encrypted like other files.

**Album download.** When an album's effective download setting is not `none`, the album header shows "Download album · 312 MB".

- Public and unlisted albums: the ingest step writes `static/downloads/<album>-<contenthash8>.zip` containing each photo's download version under its original filename. Use `yazl` with store-only (no compression; JPEG/AVIF don't shrink). Rebuilt only when the album's photos or settings change.
- Private albums: the zip is assembled in the browser after decryption, streamed with `client-zip`, with a progress indicator; nothing unencrypted is ever stored on the host.
- Host file-size limits vary (for example Cloudflare Pages caps single files). `config.defaults.maxZipBytes` (default unset) switches an over-limit album to the in-browser zip path, fetching files one by one.

### EXIF info panel

- Toggled with the info button or I. Desktop: a 320 px panel sliding in from the right, shrinking the stage (not overlaying it). Mobile: a bottom sheet at 50% height.
- Contents, each row hidden when empty: title, caption, date (localised, e.g. "14 March 2025, 07:12"), camera (make + model, de-duplicated so "SONY ILCE-7M4" becomes "Sony α7 IV" via a small alias map), lens, exposure line ("35 mm · ƒ/2.8 · 1/250 s · ISO 400 · −0.3 EV"), dimensions in megapixels, keywords as chips, location (place name is out of scope for v1; show a mini static map link instead), download. **As built:** the location row has a live, non-interactive MapLibre mini map (created when the panel first opens, reused across photos) that links to the album map focused on the photo via `#photo=<id>`, plus the coordinates as an OpenStreetMap link.
- Focal length shown in mm; all units metric.

### Map of photo locations

- `/[album]/map/` and optional `/map/`. MapLibre GL with an OpenFreeMap vector style (`liberty` for light, a dark variant in dark mode); configurable style URL in config.
- Markers are circular photo thumbnails (40 px), clustered with MapLibre's built-in GeoJSON clustering; cluster badges show counts. Clicking a marker opens that photo in the fullscreen viewer; clicking a cluster zooms in.
- Initial view fits `bounds` with 48 px padding.
- Lazy: the map library is dynamically imported only on map routes.
- **As built:** markers are 56 px DOM thumbnails positioned by MapLibre (the GL sprite atlas did not reliably show images added at runtime). Clustering runs to zoom 19; clicking a cluster whose photos share one point (common with rounded coordinates) opens a popup grid of its thumbnails instead of zooming. MapLibre's worker is bundled as its own hashed file and set with `setWorkerUrl`, because the default lookup next to the module URL breaks once the module is bundled.

**GPS privacy** (site default `location: show | approximate | hide`, overridable per album and photo):

- `show`: coordinates rounded to 5 decimals (about 1 m).
- `approximate`: rounded to 2 decimals (about 1.1 km) and marked approximate in the panel.
- `hide`: no coordinates in the manifest at all.
- Regardless of setting, all GPS tags are stripped from every served derivative.

## Design direction

The photographs are the interface; chrome should be quiet, typographic and consistent between views. Think a well-printed photobook, not an app.

**Principles**

- One accent colour, used only for focus and the active filmstrip marker.
- No borders, shadows or rounded corners on photos. Corners of controls and panels: 6 px.
- Chrome never overlaps a photo at rest, except in fullscreen where it auto-hides.
- Motion is short and functional: 160 ms for UI, 240 ms for image fade-in, 400 ms for slideshow crossfades. All motion respects `prefers-reduced-motion`.

**Tokens** (CSS custom properties in `src/lib/styles/tokens.css`; light and dark sets switched by `prefers-color-scheme`, with a manual toggle stored in `localStorage`)

| Token          | Dark (default for viewer) | Light               |
| -------------- | ------------------------- | ------------------- |
| `--bg`         | `#0e0e0e`                 | `#f6f5f2`           |
| `--bg-stage`   | `#000000`                 | `#ecebe7`           |
| `--surface`    | `#1a1a1a`                 | `#ffffff`           |
| `--text`       | `#ececec`                 | `#1a1a1a`           |
| `--text-muted` | `#9a9a9a`                 | `#6b6b6b`           |
| `--hairline`   | `rgb(255 255 255 / 0.08)` | `rgb(0 0 0 / 0.08)` |
| `--accent`     | `#e8c37a`                 | `#8a5a00`           |

Slideshow and lightbox always use the dark stage regardless of theme, so photos are judged against a neutral, dark surround.

**Typography**

- One variable sans for UI (`Inter Variable` self-hosted, or system UI stack via config) and an optional serif for album titles (`Newsreader` or system serif). **As built:** Inter only; the serif and `theme.fontTitles` were dropped on Oct 13, 2026.
- Scale: 12 / 14 / 16 / 20 / 28 / 40 px; album titles 40/28 px; captions 14 px with 1.5 line height; exposure data uses tabular figures.

**Layout**

- Grid pages: max content width 1600 px, side gutters 24 px (16 px mobile).
- Home: album covers in a 3/2/1-column grid (≥1100 / ≥640 / below), 3:2 crop with a 2 px focus outline on hover, title and date under each cover.
- Header: site title left, theme toggle right; collapses to title only below 640 px.

## Accessibility, performance and SEO

**Accessibility (WCAG 2.2 AA)**

- Every image has alt text (see precedence); the build warns for each photo that falls back to generated alt.
- All controls are real `<button>`/`<a>` elements with visible labels or `aria-label`; tooltips show keyboard shortcuts.
- The viewer region uses `aria-roledescription="carousel"`; each slide announces "Photo 12 of 48: \<title>" via a polite live region, suppressed during autoplay.
- Autoplay never starts on its own; a pause control is always reachable (WCAG 2.2.2).
- Focus is trapped in the viewer, info sheet and password dialog, and restored on close. Visible focus ring everywhere (2 px accent, 2 px offset).
- Text contrast ≥ 4.5:1 in both themes; control icons ≥ 3:1.
- Grid is navigable with arrow keys (roving tabindex) as well as Tab.

**Performance budgets** (Lighthouse mobile, simulated 4G, on an album of 100 photos)

| Metric                                                        | Budget                                                  |
| ------------------------------------------------------------- | ------------------------------------------------------- |
| LCP                                                           | ≤ 2.0 s                                                 |
| CLS                                                           | ≤ 0.01 (every image has width/height from the manifest) |
| INP                                                           | ≤ 150 ms                                                |
| JS on album page (gzip, excluding PhotoSwipe and MapLibre)    | ≤ 45 KB (**as built:** about 52 KB, of which 34 KB is the Svelte 5 runtime plus the Kit 3 client baseline; the e2e test asserts ≤ 55 KB) |
| HTML + inline data for a 100-photo album (gzip)               | ≤ 40 KB                                                 |
| Lighthouse Performance / Accessibility / Best Practices / SEO | ≥ 95 each                                               |

Techniques: first-row images get `fetchpriority="high"`; PhotoSwipe and MapLibre are dynamically imported; fonts are subset and preloaded; derivatives are served with immutable cache headers (documented per host, with a `_headers` file for Netlify/Cloudflare).

**SEO and sharing**

- Per page: `<title>`, meta description (album description or first caption), canonical URL, Open Graph and Twitter card tags using the 1920 px JPEG (album cover for album pages, the photo for photo pages).
- JSON-LD: `ImageGallery` on album pages, `ImageObject` (with `creator`, `copyrightNotice` from config) on photo pages.
- Private and unlisted pages: `noindex`, no OG image for private.

## Config file

One typed file at the repo root, `revelar.config.ts`, validated at ingest with a small hand-written validator (or `valibot`). Invalid config fails the build with a readable message.

```ts
import { defineConfig } from './src/lib/config';

export default defineConfig({
	site: {
		title: 'Photographs',
		description: 'Selected work',
		baseUrl: 'https://photos.example.com', // required for canonical/OG; its path becomes paths.base
		author: 'Your Name',
		authorUrl: 'https://example.com', // as built: linked from the footer and used as the creator URL
		copyright: '© Your Name',
		language: 'en',
		intro: '' // Markdown shown on home
	},
	photosDir: './photos',
	albumOrder: 'date-desc', // date-desc | date-asc | title | manual
	albumManualOrder: [], // slugs, when manual
	defaults: {
		sort: 'date-asc',
		downloads: 'large', // none | large | original (as built: defaults to large, so album zips are on)
		location: 'approximate', // show | approximate | hide
		exifPanel: true
	},
	images: {
		widths: [320, 640, 960, 1280, 1920, 2560, 3840],
		avifQuality: 55,
		webpQuality: 78,
		jpegQuality: 82
	},
	viewer: {
		defaultView: 'grid', // fixed: albums always open in the grid
		slideshowInterval: 5000, // ms
		transition: 'crossfade', // crossfade | slide | none
		gridRowHeight: { desktop: 280, mobile: 180 },
		filmstrip: true
	},
	theme: {
		mode: 'system', // system | dark | light
		accent: '#e8c37a',
		fontSans: 'inter' // inter | system (as built: no fontTitles; Inter is the only typeface)
	},
	map: {
		enabled: true,
		globalMap: false,
		styleLight: 'https://tiles.openfreemap.org/styles/liberty',
		styleDark: 'https://tiles.openfreemap.org/styles/dark'
	},
	privacy: { showPrivateTitles: false },
	feeds: { rss: true, sitemap: true }
});
```

## Project structure, commands and deployment

```
.
├─ revelar.config.ts
├─ photos/                      # user content (gitignored or LFS, user's choice)
├─ scripts/
│  ├─ ingest.ts                 # pipeline entry
│  ├─ ingest/                   # scan, metadata, encode, crypto, manifest, prune
│  ├─ share.ts                  # prints private-album share links
│  └─ watch.ts                  # chokidar watcher → incremental ingest
├─ src/
│  ├─ lib/
│  │  ├─ components/            # Picture, Grid, Viewer, Filmstrip, ...
│  │  ├─ state/album.svelte.ts  # runes-based album store
│  │  ├─ crypto/                # browser decrypt + worker
│  │  ├─ styles/                # tokens.css, base.css
│  │  ├─ config.ts              # defineConfig + types
│  │  └─ generated/             # manifest.json, manifest.d.ts (gitignored)
│  └─ routes/                   # see Routes
├─ static/media/, static/media-private/, static/downloads/   # generated, gitignored
├─ .cache/                      # ingest cache, private tokens (tokens must be kept)
└─ tests/                       # vitest unit + playwright e2e, fixture photos
```

| Command                               | Does                                                 |
| ------------------------------------- | ---------------------------------------------------- |
| `npm run ingest`                      | Process `photos/` incrementally                      |
| `npm run ingest -- --force`           | Rebuild all derivatives                              |
| `npm run dev`                         | Ingest, then watch `photos/` and run Vite dev server |
| `npm run build`                       | Ingest, then `vite build` to `build/`                |
| `npm run preview`                     | Serve `build/` locally over HTTPS-capable localhost  |
| `npm run share <album>`               | Print the private album URL and the `#k=` key link   |
| `npm run check` / `test` / `test:e2e` | svelte-check, Vitest, Playwright                     |

**As built (engine split, Oct 13, 2026).** Revelar is an npm package with a `revelar` command rather than only a template to clone, as groundwork for a desktop companion app for non-technical users. A site root is any folder with `revelar.config.ts` and `photos/`; the package's checkout is one too, so the table above still applies there. Layout: `bin/revelar.js` (loads the TypeScript source through tsx) → `src/cli/index.ts` (`init`, `ingest`, `build [--no-ingest]`, `dev`, `preview`, `share`, all with `--root` and `--config`); `src/index.ts` is the programmatic API (`runIngest`, `buildSite`, `devServer`, `shareLinks`, `defineConfig`); the pipeline moved from `scripts/ingest/` to `src/engine/`; configs import `defineConfig` from `'revelar/config'`. In `vite.config.ts` the package is Vite's root while the site root (`REVELAR_SITE_ROOT`, else the working directory) supplies the config, `.cache/manifest.json` (no longer `src/lib/generated/`), `static/`, Kit's `.svelte-kit/` and `build/`. SvelteKit resolves its own paths against the working directory, so the engine changes into the package directory for the duration of each Vite call. A site folder needs nothing installed in it: the CLI and the app's engine process hook Node's module resolution (`bin/register.js`) so the config's `'revelar/config'` import finds the package, and Kit's working directory lives inside the package (`.svelte-kit/sites/<hash>` per site) so the server output's externals resolve. Verified by packing the package, installing it in an empty folder and running `revelar init` and `revelar build` there, and again against a folder with no `node_modules` at all.

**Deployment**

- Output is a plain `build/` folder; the README documents Netlify, Cloudflare Pages, Vercel, GitHub Pages and rsync/FTP.
- CI template (GitHub Actions): cache `.cache/` and `static/media*` between runs keyed on a hash of `photos/`, pass private-album passwords as secrets, deploy `build/`.
- Ship a `_headers` file (Netlify/Cloudflare) setting `Cache-Control: public, max-age=31536000, immutable` for `/media*` and a short cache for HTML.
- Large libraries: document that photos can live outside the repo (`photosDir` absolute path) and that a local build + rsync is the recommended path for thousands of photos.

**As built**

- `site.baseUrl` may include a path; it becomes `paths.base`, so the site works from a subfolder (`BASE_PATH` overrides it). Links and asset URLs are absolute under that path (`paths.relative: false`): relative hrefs rendered for a photo page resolved wrongly once the viewer's shallow routing changed the URL. A build is therefore tied to its base URL, as its canonical, Open Graph, sitemap and RSS URLs already were.
- `REVELAR_CONFIG=path/to/config.ts` selects another config file for ingest, dev and build. The e2e suite uses `tests/e2e/revelar.config.ts` and its own site root (`tests/e2e/.site`), so it never touches `photos/`, `build/` or the owner's settings.
- Media (`media/`, `downloads/`) are content-hashed and unaffected by config or code changes; a redeploy after such changes only needs the HTML, `album.json`, `_app/` and feed files, a few megabytes in total.
- Photo pages are thin shells. Each `/<album>/<id>/index.html` carries only its own photo (image, caption, Open Graph, JSON-LD) and fetches the album's photo list from `/<album>/album.json`, a prerendered endpoint, before opening the viewer. The album page keeps its server-rendered grid with the data inline. SvelteKit's per-page `__data.json` files are deleted after the build (`scripts/postbuild.ts`); links are plain page loads (`data-sveltekit-reload`) and the viewer's shallow routing never fetches data.
- The first deployment is a hand upload to `https://dev.keoshi.com/revelar/` (nginx).

## Build plan and acceptance criteria

Claude Code should build in these milestones, committing at the end of each and stopping to report before moving on. Each milestone is done only when its checks pass.

1. **Scaffold.** `sv create` with TS, ESLint, Prettier, Vitest, Playwright; adapter-static; tokens and base styles; `revelar.config.ts` with validation.
   - Check: `npm run build` produces an empty-state home page; `npm run check` is clean.
2. **Ingest pipeline.** Scan, metadata merge, derivatives, ThumbHash, manifest, cache, prune, summary.
   - Check: unit tests on a fixture set (portrait, landscape, rotated EXIF, no-EXIF PNG, IPTC-captioned, GPS-tagged, sidecar override). Second run reuses 100% of derivatives in under 2 s for 50 photos. No derivative contains GPS (verified by re-reading with exifr).
3. **Home and album grid.** Album covers, justified grid, `<Picture>` with placeholders.
   - Check: CLS 0 on the fixture album; grid relayouts correctly from 320 to 2560 px wide (Playwright screenshots).
4. **Fullscreen viewer. PhotoSwipe wrapper, filmstrip, controls, autoplay with crossfade**, preload, keyboard and touch, shallow-routed photo URLs.
   - Check: E2E for keyboard nav, deep link `/[album]/[photo]/` opens the right photo, Back returns to grid, reduced-motion disables fades.
5. **Viewer polish. Thumbnail-origin animation, auto-hiding chrome, native fullscreen, filmstrip virtualis**ation, focus return.
6. **Info panel and downloads.** EXIF formatting, camera aliases, download sizes and GPS-safe originals.
7. **Map.** Album map and optional global map, clustering, GPS privacy levels.
   - Check: `approximate` coordinates in the manifest have at most 2 decimals; `hide` has none.
8. **Private and unlisted albums.** Encryption at build, PasswordGate, worker decryption, remember-me, share links.
   - Check: no plaintext image bytes, titles or captions of a private album appear anywhere in `build/` (grep test); wrong password shows an error without hanging; correct password renders the album.
9. **SEO, feeds, a11y and performance pass.** Meta, OG, JSON-LD, sitemap, RSS, `_headers`; axe-core in Playwright; Lighthouse CI against budgets.
10. **Docs.** README covering setup, adding photos, `album.yaml` reference, private albums and their limits, deployment per host.

**Overall acceptance**

- [ ] Dropping a new folder of JPEGs into `photos/` and running `npm run build` yields a new album with no other edits.
- [ ] The built site works when served from any static file server, including a subpath (`paths.base` configurable).
- [ ] Lighthouse mobile ≥ 95 in all four categories on home, album and photo pages.
- [ ] Zero axe-core violations.
- [ ] Works in the latest two versions of Safari (macOS and iOS), Chrome and Firefox.

## As built: deviations from this spec

Recorded on Oct 13, 2026. Each is deliberate; do not "fix" them back without a decision.

| Area          | Spec                                             | As built                                                                                                                                     |
| ------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework     | SvelteKit 2.x                                    | SvelteKit 3.0 (current stable at scaffold time)                                                                                              |
| Typography    | Inter plus optional serif for titles             | Inter Variable only                                                                                                                          |
| Transitions   | Slide on manual navigation, crossfade in autoplay | `viewer.transition` applies to both; crossfade by default                                                                                    |
| Downloads     | Default `none`                                   | Default `large`, so album zips are built unless turned off                                                                                   |
| Home page     | Grid of album covers                             | Single-album sites redirect `/` to the album                                                                                                 |
| Map markers   | 40 px GL sprites                                 | 56 px DOM thumbnails; clusters to zoom 19; popup grid for photos sharing one point; worker shipped as a hashed file                            |
| JS budget     | ≤ 45 KB gzip on the album page                   | About 52 KB; test asserts ≤ 55 KB                                                                                                            |
| Config        | One file at the root                             | Plus `site.authorUrl` (footer link, creator URL) and `REVELAR_CONFIG` for alternate config files                                             |
| Site settings | `location: approximate`, placeholder author/URL  | The owner's site uses `location: show`, author Filipe Varela with https://keoshi.com, base URL `https://dev.keoshi.com/revelar`                |
| Packaging     | A template repository with npm scripts           | An npm package with a `revelar` CLI and a programmatic API; any folder with a config and `photos/` is a site root (see Project structure, As built) |
| Desktop app   | Out of scope                                     | `app/` workspace: an Electron proof of concept (illustrated welcome, library with quick previews, album editor with drag-to-arrange, site settings, preview, publish to Netlify / Vercel / Cloudflare Pages / GitHub Pages with `site.baseUrl` set automatically) over the engine, which runs as a utility process speaking the `src/engine/host.ts` protocol; `runIngest` emits progress events |
| Output layout | One full page per photo                          | Thin photo shells plus one `album.json` per album; no `__data.json` files (see Deployment, As built)                                          |

## Open questions

- [x] Name is Revelar (decided). Domain: `https://dev.keoshi.com/revelar/` for now; a final domain is still to choose.
- [ ] Default album view: grid first, viewer on demand (decided).
- [ ] Should the home page show album covers only, or a featured photo hero above them?
- [ ] Self-host map tiles as a PMTiles file later, to remove the OpenFreeMap dependency?
- [ ] Reverse-geocoded place names in the info panel (needs an offline gazetteer at build time) for v2?

## Sources

- [SvelteKit releases](https://releases.sh/svelte/sveltekit) and [What's new in Svelte: August 2026](https://svelte.dev/blog/whats-new-in-svelte-august-2026)
- [exifr](https://github.com/MikeKovarik/exifr)
- [ThumbHash](https://evanw.github.io/thumbhash/)
- [Flickr justified-layout](https://github.com/flickr/justified-layout)
- [PhotoSwipe on npm](https://npmjs.com/package/photoswipe)
- [StatiCrypt](https://github.com/robinmoisson/staticrypt/)
- [MapLibre styles and OpenFreeMap](https://maplibre.org/flutter-maplibre-gl/concepts/styles/)
