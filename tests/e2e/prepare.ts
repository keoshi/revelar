/**
 * Runs before the e2e site build. Fixtures are generated and ingested inside their own root
 * (tests/e2e/.site, gitignored) so the suite never touches photos/ or the real generated output;
 * REVELAR_SITE_ROOT points the Vite build at that root (see vite.config.ts and server/manifest.ts).
 */
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { generateFixtures } from '../fixtures/generate.ts';
import { runIngest } from '../../scripts/ingest/index.ts';
import { loadConfig } from '../../scripts/ingest/config.ts';

async function prepare() {
	const siteRoot = resolve(process.env.REVELAR_SITE_ROOT ?? 'tests/e2e/.site');
	const photos = join(siteRoot, 'photos');
	if (!existsSync(join(photos, 'secret-garden')) || !existsSync(join(photos, '2022-hundred'))) {
		rmSync(photos, { recursive: true, force: true });
		await generateFixtures(photos, { extras: true });
		rmSync(join(photos, 'stray.jpg'), { force: true });
	}
	process.env.REVELAR_TEST_PW ??= 'correct horse battery staple';
	// Same config as the site build, with downloads enabled so the download controls are exercised.
	const config = await loadConfig();
	config.photosDir = photos;
	config.defaults.downloads = 'large';
	await runIngest({ quiet: true, config, root: siteRoot });
	// Tracked static files (headers) ship with the fixture site too.
	mkdirSync(join(siteRoot, 'static'), { recursive: true });
	copyFileSync(resolve('static/_headers'), join(siteRoot, 'static', '_headers'));
}

await prepare();
