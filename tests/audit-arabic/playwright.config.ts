// The Arabic editing audit's UI run (tests/audit-arabic/ui.spec.ts) in headless Edge at 1366×768 against the dev server:
//   npx playwright test -c tests/audit-arabic/playwright.config.ts
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: 'ui.spec.ts', timeout: 600_000, workers: 1, retries: 0,
  use: { channel: 'msedge', baseURL: 'http://localhost:5188', viewport: { width: 1366, height: 768 }, locale: 'en-US' },
  webServer: { command: 'node node_modules/vite/bin/vite.js --port 5188 --strictPort', url: 'http://localhost:5188', reuseExistingServer: true, cwd: '../..' },
});
