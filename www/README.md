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
