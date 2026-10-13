import { defineConfig, devices } from '@playwright/test';

const SITE_ROOT = 'tests/e2e/.site';

export default defineConfig({
	testDir: 'tests/e2e',
	testMatch: '**/*.e2e.ts',
	webServer: {
		command:
			'npx tsx tests/e2e/prepare.ts && npm run build:site && npm run preview -- --port 4173 --strictPort',
		port: 4173,
		reuseExistingServer: !process.env.CI,
		timeout: 180_000,
		env: {
			// Fixtures are ingested into their own root so the suite never touches photos/.
			REVELAR_SITE_ROOT: SITE_ROOT,
			REVELAR_TEST_PW: process.env.REVELAR_TEST_PW ?? 'correct horse battery staple'
		}
	},
	use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure' },
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
	expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.02 } }
});
