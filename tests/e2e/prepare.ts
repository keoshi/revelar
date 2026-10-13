/** Runs before the e2e site build: ensure photos/ holds the fixture albums and ingest with downloads enabled. */
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { generateFixtures } from '../fixtures/generate.ts';
import { runIngest } from '../../scripts/ingest/index.ts';
import { loadConfig } from '../../scripts/ingest/config.ts';

async function prepare() {
	const root = process.cwd();
	const photos = join(root, 'photos');
	if (!existsSync(join(photos, 'secret-garden'))) {
		await generateFixtures(photos, { extras: true });
		rmSync(join(photos, 'stray.jpg'), { force: true });
	}
	process.env.REVELAR_TEST_PW ??= 'correct horse battery staple';
	// Same config as the site build, with downloads enabled so the download controls are exercised.
	const config = await loadConfig();
	config.defaults.downloads = 'large';
	await runIngest({ quiet: true, config });
}

await prepare();
