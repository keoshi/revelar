# Marketing page

`index.html` and `img/` are the Revelar page at https://tools.index84.com/revelar/ (and
https://revelar.index84.com, which redirects there). It is an index84 product page: it links the
shared stylesheet of the tools site (`../shared/tools.css`) and follows that repository's
`DESIGN.md`. The tools site's build fetches this folder from GitHub, so a change here goes live on
its next build; a push touching `www/` triggers one through the deploy hook in
`.github/workflows/www.yml` when the secret is set, otherwise `npx vercel deploy --prod` in the
tools folder does it.

Images:

- `img/<screen>.webp|avif`: app window captures, from `node app/scripts/screenshots.mjs <site> <out> --www`
- `img/gallery-*`, `viewer-*`, `info-*`: the live example site in dark and light, and `og.jpg`, from `node www/gallery.mjs`
- `img/gallery-dark.*` is also the hero's picture before its script runs (and without JavaScript);
  the tools catalogue uses `img/gallery-*` too

The hero (`demo/`):

- The app at work, drawn live in HTML rather than recorded, in the page's three steps: pick a
  folder (add an album), make it yours (arrange it, see the site), put it online (publish), then
  the mark before it loops. `revelar-demo.js` and `revelar-demo.css` draw Revelar's window at 1200 × 750 from one
  clock, every frame a function of `t`; `step-window.js|css` is the html-demo skill's engine
  (window, clock, scaling, steps bar, pointer), unchanged but for unpadded step numbers.
- Wording, sizes and colours are copied from `app/src/renderer/src` and the busy card's messages
  from `src/engine/publish.ts`; when the app's UI or copy changes, change them here too.
- `demo/img/*.webp` are the Synthest photos at 480 px. Classes carry the `rvd-` prefix, and the
  markup uses only divs and spans, since the page styles `header`, `section` and `code`.
