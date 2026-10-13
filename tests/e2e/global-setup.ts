/** Ensure photos/ holds the fixture albums and the manifest is fresh before the site is built. */
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { generateFixtures } from '../fixtures/generate.ts';
import { runIngest } from '../../scripts/ingest/index.ts';

export default async function globalSetup() {
	const root = process.cwd();
	const photos = join(root, 'photos');
	if (!existsSync(join(photos, '2025-03-14-lisbon-walks'))) {
		await generateFixtures(photos);
		rmSync(join(photos, 'stray.jpg'), { force: true });
	}
	process.env.REVELAR_E2E = '1';
	await runIngest({ quiet: true });
}
