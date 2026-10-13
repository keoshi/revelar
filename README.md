# Revelar

Revelar (Portuguese for "to develop", as in film) is a static, photo-first gallery site. Drop folders of photos into `photos/`, run one build command, and get a complete, fast site: responsive AVIF/WebP derivatives, ThumbHash placeholders, a justified grid, a fullscreen viewer with filmstrip and slideshow, EXIF info, maps, downloads, and password-protected albums. Built with SvelteKit (prerendered with `adapter-static`), Svelte 5 and sharp. No server, database or CMS: adding photos means adding files and rebuilding.

Live example: [dev.keoshi.com/revelar](https://dev.keoshi.com/revelar/).

## Screenshots

![Album page: justified grid of photos with Play, Download album and Map actions, dark theme](docs/screenshots/album-grid-dark.jpg)

![Fullscreen viewer with the filmstrip along the bottom and controls at the top](docs/screenshots/viewer.jpg)

![Viewer with the info panel open, showing caption, date, camera, lens, exposure and location](docs/screenshots/viewer-info.jpg)

![Map of photo locations with thumbnail markers and clusters](docs/screenshots/map.jpg)

<p>
  <img src="docs/screenshots/mobile-grid.jpg" width="300" alt="Album grid on a phone">
  <img src="docs/screenshots/mobile-viewer.jpg" width="300" alt="Fullscreen viewer on a phone">
</p>

![Album page in the light theme](docs/screenshots/album-grid-light.jpg)

## Requirements

- Node.js 22 or newer (24 recommended)
- Enough disk for derivatives: roughly 1–2× the size of your originals

## Quick start

Revelar is an npm package with a `revelar` command. A site is any folder holding a `revelar.config.ts` and a `photos/` directory.

```sh
mkdir my-photos && cd my-photos
npm init -y
npm install github:keoshi/revelar   # or `npm install revelar` once it is on npm
npx revelar init                     # writes revelar.config.ts, photos/ and .gitignore
# put albums in photos/ (see Content below), edit revelar.config.ts, then:
npx revelar build                    # ingest photos/ then build the site into build/
npx revelar preview                  # serve build/ locally
npx revelar dev                      # dev server that re-ingests as photos/ changes
```

This repository is itself a site root (the owner's gallery lives in its gitignored `photos/`), so a checkout works the same way with `npm install` followed by `npm run build`, `npm run preview` or `npm run dev`.

The same engine is available as a library for other tools: `import { runIngest, buildSite, devServer, shareLinks } from 'revelar'`.

## Content

Every immediate subfolder of `photos/` is an album. Files directly in `photos/` are ignored (with a warning). Hidden files, and files or folders starting with `_`, are skipped.

```
photos/
  2025-03-14-lisbon-walks/   # slug "lisbon-walks", album date 2025-03-14
    album.yaml               # optional
    DSC01234.jpg
  2024-iceland/              # slug "iceland", album date 2024
    001.jpg
  _drafts/                   # skipped
```

Accepted formats: JPEG, PNG, WebP, AVIF, TIFF and HEIC (HEIC only where the bundled libvips supports it; otherwise the file is skipped with a warning).

The slug is the folder name, lowercased and slugified, with an optional `YYYY-MM-DD`, `YYYY-MM` or `YYYY` prefix (followed by `-`, `_` or a space, as in `2026-10 Porto`) stripped and used as the album date. The slugs `p` and `map` are reserved and get an `-album` suffix.

Each photo gets a stable id from its path (renaming a file changes the id, editing pixels does not). Derivative filenames carry a content hash, so edits bust caches.

### Titles, captions and metadata

Titles and captions come from the files themselves, so Lightroom or Capture One exports just work. For each field the first non-empty source wins:

| Field    | 1. `album.yaml`        | 2. XMP                                 | 3. IPTC           | 4. EXIF            | 5. Fallback                               |
| -------- | ---------------------- | -------------------------------------- | ----------------- | ------------------ | ----------------------------------------- |
| Title    | `photos.<file>.title`  | `dc:title`                             | Object Name       | —                  | none (filenames never become titles)      |
| Caption  | `.caption`             | `dc:description`                       | Caption-Abstract  | ImageDescription   | none                                      |
| Alt text | `.alt`                 | `Iptc4xmpCore:AltTextAccessibility`    | —                 | —                  | caption, then title, then "Photo N of M…" |
| Date     | `.date`                | `photoshop:DateCreated`                | Date/Time Created | DateTimeOriginal   | file modification time                    |
| Keywords | —                      | `dc:subject`                           | Keywords          | —                  | none                                      |
| GPS      | —                      | —                                      | —                 | GPS tags           | none                                      |

Camera fields (make, model, lens, focal length, aperture, shutter, ISO, exposure compensation) come from EXIF only. The build warns for every photo whose alt text had to be generated.

### `album.yaml`

Every field is optional. Values here override embedded metadata.

```yaml
title: Lisbon walks
description: |
  Early mornings in Alfama and Graça. **Markdown** allowed.
date: 2025-03-14            # overrides the folder prefix and EXIF
cover: DSC01240.jpg          # default: first photo after sorting
sort: date-asc               # date-asc | date-desc | filename | manual
order:                       # used when sort: manual; unlisted files go last by filename
  - DSC01240.jpg
  - DSC01234.jpg
visibility: public           # public | unlisted | private
password_env: ALBUM_PW       # private only: the NAME of an environment variable holding the password
downloads: original          # none | large | original (overrides the site default)
location: hide               # show | approximate | hide (overrides the site default)
exif_panel: true
photos:
  DSC01234.jpg:
    title: Tram 28 at dawn
    caption: The first tram, before the tourists.
    alt: Yellow tram climbing a narrow cobbled street at sunrise
    hidden: false
    location: hide
    downloads: none
    date: 2025-03-14T07:12:00
```

## Configuration

`revelar.config.ts` in the site root (`import { defineConfig } from 'revelar/config'`) is validated at ingest; invalid values fail the build with a readable message. The important fields:

- `site.baseUrl` (required) is used for canonical and Open Graph URLs. If it has a path (for example `https://user.github.io/photos`), the site is built to work from that subpath. `BASE_PATH=/photos` overrides it.
- `site.author`, `site.authorUrl` and `site.copyright`: the footer shows the copyright line followed by a link to the author's site (as its host name); the author also appears as the creator in structured data.
- `REVELAR_CONFIG=path/to/config.ts` makes ingest, dev and build use another config file (the e2e suite uses `tests/e2e/revelar.config.ts`).
- `photosDir` can be an absolute path, so large libraries can live outside the repo.
- `defaults.downloads`, `defaults.location` and `defaults.exifPanel` set site-wide behaviour that `album.yaml` can override.
- `images.widths` and the quality settings control derivatives. Widths larger than the original are skipped; nothing is ever upscaled.
- `viewer.slideshowInterval`, `viewer.transition` (`crossfade | slide | none`), `viewer.gridRowHeight` and `viewer.filmstrip`.
- `theme.mode`, `theme.accent`, `theme.fontSans` (`inter | system`). Inter Variable is the only typeface, self-hosted.
- `map.enabled`, `map.globalMap`, and the MapLibre style URLs (OpenFreeMap by default, no API key).
- `feeds.rss` and `feeds.sitemap`.

## Commands

| Command                   | Does                                                                   |
| ------------------------- | ---------------------------------------------------------------------- |
| `revelar init`            | Create `revelar.config.ts`, `photos/` and `.gitignore` in this folder  |
| `revelar ingest`          | Process `photos/` incrementally into `static/media` and the manifest   |
| `revelar ingest --force`  | Rebuild every derivative                                               |
| `revelar build`           | Ingest, then build the site into `build/` (`--no-ingest` skips step 1) |
| `revelar dev`             | Ingest, watch `photos/`, run the Vite dev server (`--port`, `--open`)  |
| `revelar preview`         | Serve `build/` locally (`--port`)                                      |
| `revelar share <album>`   | Print a private album's URL and its `#k=` key link                     |

All commands take `--root <dir>` (default: the current directory) and `--config <file>`, or the `REVELAR_SITE_ROOT` and `REVELAR_CONFIG` environment variables. In this repository `npm run <command>` runs the same CLI from source; `npm run check`, `npm test` (Vitest), `npm run test:e2e` (Playwright, builds a fixture site in `tests/e2e/.site`) and `npm run lighthouse` are for development.

The ingest step is incremental: unchanged originals (same size, mtime and content hash) reuse their derivatives and metadata from `.cache/ingest.json`, so a second run over hundreds of photos takes well under a second. Derivatives that are no longer referenced are pruned.

## Viewing

- Albums always open as a justified grid. Click a photo (or press Enter on a focused tile) to open the fullscreen viewer; arrow keys move between tiles in the grid.
- `viewer.transition` sets how photos change in the viewer, for manual navigation and the slideshow alike: `crossfade` (default; 240 ms when you navigate, 400 ms between slideshow photos, started only once the next image has decoded), `slide` (PhotoSwipe's native slide) or `none`. Swipes always follow the finger. `prefers-reduced-motion` makes every change instant.
- Viewer shortcuts: `←`/`→` previous/next, `Space` play/pause the slideshow, `I` info panel, `T` filmstrip, `D` download, `F` fullscreen, `Esc` close. Chrome hides after 2.5 s of inactivity.
- The info panel shows title, caption, date, camera, lens, exposure, size, keywords, download and, for geotagged photos, a mini map (loaded on first open) that links to the album map centred on that photo. Approximate locations are drawn as a soft disc rather than a pin.
- A site with a single public album sends the home page straight to that album, and the header title links there.
- Every photo has its own URL (`/album/<id>/`) that opens the viewer directly and unfurls with the right image when shared. These pages are small shells: the photo, its caption and metadata are inline, and the rest of the album is fetched from the album's `album.json` while the viewer opens.
- A manual light/dark toggle in the header is remembered on the device; the viewer always uses a dark stage.

## Downloads

`downloads` defaults to `large` (the 1920 px JPEG, metadata-stripped); set it to `original` or `none` site-wide in `revelar.config.ts`, or per album and per photo in `album.yaml`. With `original`, the file is copied byte for byte, except when the effective `location` setting is `hide` or `approximate`: copying would leak GPS, so the download is instead a full-resolution, maximum-quality JPEG re-encoded by sharp with metadata limited to copyright and camera fields.

Whenever downloads are enabled, the album header shows a "Download album · size" button and the viewer a per-photo download. Album downloads are store-only zips built at ingest (`static/downloads/<album>-<hash>.zip`) and rebuilt only when the album's photos or settings change. Some hosts cap single-file sizes (Cloudflare Pages, for example); set `defaults.maxZipBytes` to switch over-limit albums to an in-browser zip that fetches files one by one.

## Location privacy

`location` is `show` (5 decimals, about 1 m), `approximate` (2 decimals, about 1 km, marked as approximate) or `hide` (no coordinates anywhere). Regardless of the setting, every served derivative has all metadata stripped except an sRGB colour profile. Album maps are only generated for albums with displayable coordinates; `map.globalMap` adds `/map/` for all public photos.

## Private and unlisted albums

- **Unlisted** albums are built at their normal slug, excluded from the home page, global map, sitemap and RSS, and carry `noindex`. Anyone with the link can view them; images are not encrypted.
- **Private** albums are encrypted at build. Set `visibility: private` and `password_env: SOME_VAR`, then provide the password in that environment variable when you build (the build fails if it is missing). A random album key encrypts the album's manifest slice and every derivative (AES-GCM); the key is wrapped with a key derived from the password (PBKDF2-SHA-256, 600 000 iterations). Encrypted files live under `static/media-private/<token>/` with meaningless names, and the album is served at `/p/<token>/` where `token` is random and stable across builds (kept in `.cache/private-tokens.json`; commit that file or cache it in CI so links keep working).
- In the browser, the password derives the key, decrypts the manifest, then fetches and decrypts images in a Web Worker. "Remember on this device" keeps the unwrapped key in `sessionStorage` (default) or `localStorage` (checkbox).
- Private albums are deliberately absent from the home page and every listing, so the only way in is the link. The ingest summary prints each private album's URL (`/p/<token>/`); opening it shows a password form, and "Remember on this device" skips the form next time. `npm run share <album>` prints the same URL plus a `#k=…` link that unlocks without a password. The fragment never reaches the server; treat the link like the password.

Limits to keep in mind: security equals password strength (use 16+ characters); changing the password re-encrypts the album; private albums never appear in the sitemap, RSS or global map; WebCrypto requires HTTPS (or localhost). `.cache/private-keys.json` holds the raw album keys so unchanged files are not re-encrypted on every build: keep it out of version control (it is gitignored) and out of untrusted CI caches.

## Deployment

The output is a plain `build/` folder; `npm run build` does the whole thing. Nothing depends on host features.

- **Netlify / Cloudflare Pages**: build command `npm run build`, publish directory `build`. The shipped `_headers` file sets immutable caching for `/media/*`, `/media-private/*`, `/downloads/*` and `/_app/immutable/*`.
- **Vercel**: framework preset "SvelteKit" (or "Other"), build command `npm run build`, output directory `build`. Add cache headers for the same paths in `vercel.json` if you want them.
- **GitHub Pages**: set `site.baseUrl` to `https://<user>.github.io/<repo>`, build in Actions and deploy `build/` (see the workflow template below). Trailing-slash URLs are used everywhere so `index.html` files resolve on plain static hosts.
- **rsync / FTP**: `npm run build && rsync -av --delete build/ user@host:/var/www/photos/`.

For thousands of photos, keep `photos/` outside the repo (`photosDir`), build locally and rsync; the incremental cache makes rebuilds cheap. In CI, cache `.cache/` and `static/media*` keyed on a hash of `photos/` and pass private-album passwords as secrets. A template lives in `.github/workflows/build.yml`.

**What a rebuild changes.** The output is deliberately small outside the images:

```
index.html                   home (or a redirect when there is a single album)
<album>/index.html           the album page with its grid, data inline
<album>/album.json           the album's photo list, fetched once by photo pages
<album>/<id>/index.html      one small shell per photo: its image, caption, Open Graph and JSON-LD
<album>/map/index.html       the album map
_app/                        hashed JavaScript and CSS
media/, downloads/           content-hashed derivatives and zips: written once, never rewritten
rss.xml sitemap.xml robots.txt _headers
```

Media and downloads only change when photos or image settings change. Everything else is a few megabytes in total and is rewritten on every build (the shells reference the hashed scripts), so after a code or config change you re-upload everything except `media/` and `downloads/`. SvelteKit's per-page `__data.json` files are not shipped: links are plain page loads and the viewer moves between photos without fetching anything.

## Project structure

A site root (any folder, including this repository):

```
revelar.config.ts            site configuration
photos/                      your albums
static/media*, downloads     generated derivatives and zips
.cache/                      ingest cache, manifest.json, private tokens and keys
.svelte-kit/                 SvelteKit's working directory for the build
build/                       the site
```

The package:

```
bin/revelar.js               the CLI entry (loads the TypeScript source through tsx)
src/cli/index.ts             command parsing: init, ingest, build, dev, preview, share
src/index.ts                 programmatic API: runIngest, buildSite, devServer, shareLinks, defineConfig
src/engine/ingest.ts         pipeline entry: scan → metadata → encode → manifest → prune
src/engine/                  scan, sidecar, metadata, encode, albums, cache, zip, prune, build, dev, share
src/lib/config.ts            defineConfig and validation (exported as 'revelar/config')
src/lib/components/          Picture, Grid, Viewer, Filmstrip, Controls, InfoPanel, MapView, MiniMap, PasswordGate…
src/lib/state/album.svelte.ts  runes store shared by grid and viewer
src/lib/crypto/              isomorphic AES-GCM helpers, browser unlock, decrypt worker
src/routes/                  /, /[album]/, /[album]/album.json, /[album]/[photo]/, /[album]/map/, /map/, /p/[token]/, feeds
vite.config.ts               SvelteKit build; the package is Vite's root, the site root supplies content and output
tests/                       Vitest unit tests, Playwright e2e, synthetic fixture generator
```

## Desktop app (proof of concept)

`app/` is an Electron app for people who would rather not use a terminal: a friendly face over the same site folder. It opens or creates a site, lists albums with their covers, adds a folder of photos as an album, edits titles, captions, cover, visibility and the other `album.yaml` settings, processes photos with live progress, previews the built site in place, and publishes to Netlify with a personal access token. Everything it writes is the same `photos/`, `album.yaml` and `revelar.config.ts` the CLI uses, so a site can move between the app and the terminal freely.

![The app's library screen](docs/screenshots/app-library.jpg)
![The album editor](docs/screenshots/app-album.jpg)

The engine runs in a utility process (see `bin/revelar-host.js` and `src/engine/host.ts`, a small request/response protocol with progress events) so image encoding never blocks the window. To try it from this checkout:

```sh
npm install               # installs the app workspace and Electron too
npm run build -w app && npm start -w app
```

It is a proof of concept: no installer, code signing or auto-update yet, and Netlify is the only publish target so far.

## Measured performance

Lighthouse (mobile, simulated 4G) on the fixture site: Accessibility, Best Practices and SEO score 100 on every page; Performance scores 97 (home), 94 (album), 94 (photo page) and 93 (100-photo album), with CLS 0 everywhere. The album page ships about 52 KB of gzipped JavaScript before PhotoSwipe and MapLibre, of which 34 KB is the Svelte 5 runtime and SvelteKit 3 client; PhotoSwipe loads on first open and MapLibre only on map routes. The HTML for a 100-photo album is under 20 KB gzipped. A photo page is a 12 KB shell (4 KB gzipped) plus the album's `album.json`, which is 24 KB gzipped for a 274-photo album; styles live in hashed, immutable CSS files shared by every page. For that 274-photo album the whole output apart from images and zips is 336 files and 7.5 MB.
