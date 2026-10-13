/**
 * Runs before the e2e site build. Fixtures are generated and ingested inside their own site
 * root (tests/e2e/.site, gitignored) so the suite never touches photos/ or the real output;
 * REVELAR_SITE_ROOT points the build at that root (see vite.config.ts and server/manifest.ts).
 */
import { existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { generateFixtures } from '../fixtures/generate.ts';
import { runIngest } from '../../src/engine/ingest.ts';
import { loadConfig } from '../../src/engine/config.ts';

async function prepare() {
	const siteRoot = resolve(process.env.REVELAR_SITE_ROOT ?? 'tests/e2e/.site');
	const photos = join(siteRoot, 'photos');
	if (!existsSync(join(photos, 'secret-garden')) || !existsSync(join(photos, '2022-hundred'))) {
		rmSync(photos, { recursive: true, force: true });
		await generateFixtures(photos, { extras: true });
		rmSync(join(photos, 'stray.jpg'), { force: true });
	}
	process.env.REVELAR_TEST_PW ??= 'correct horse battery staple';
	// Same config as the site build (REVELAR_CONFIG, see playwright.config.ts).
	process.env.REVELAR_CONFIG ??= 'tests/e2e/revelar.config.ts';
	const config = await loadConfig();
	config.photosDir = photos;
	await runIngest({ quiet: true, config, root: siteRoot });
}

await prepare();
