import { defineConfig, devices } from '@playwright/test';

const SITE_ROOT = 'tests/e2e/.site';

export default defineConfig({
	testDir: 'tests/e2e',
	testMatch: '**/*.e2e.ts',
	webServer: {
		command:
			'npx tsx tests/e2e/prepare.ts && npm run build:site -- --quiet && npm run preview -- --port 4173 --strict-port',
		port: 4173,
		reuseExistingServer: !process.env.CI,
		timeout: 180_000,
		env: {
			// Fixtures are ingested into their own root so the suite never touches photos/.
			REVELAR_SITE_ROOT: SITE_ROOT,
			// The suite has its own config so it does not depend on the owner's revelar.config.ts.
			REVELAR_CONFIG: 'tests/e2e/revelar.config.ts',
			REVELAR_TEST_PW: process.env.REVELAR_TEST_PW ?? 'correct horse battery staple'
		}
	},
	use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure' },
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
	expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.02 } }
});
