import { defineConfig } from '@playwright/test';

export default defineConfig({
	webServer: {
		command: 'pnpm build && pnpm preview',
		port: 4173,
		reuseExistingServer: !process.env.CI
	},
	testDir: 'tests/e2e',
	timeout: 60_000,
	use: { baseURL: 'http://localhost:4173' },
	testMatch: '**/*.e2e.ts'
});
