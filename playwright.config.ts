import { defineConfig } from '@playwright/test';

// End-to-end tests of real journeys in Microsoft Edge (already on Windows), against the dev server.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  use: { channel: 'msedge', baseURL: 'http://localhost:5188', viewport: { width: 1366, height: 768 }, locale: 'en-US' },
  webServer: { command: 'node node_modules/vite/bin/vite.js --port 5188 --strictPort', url: 'http://localhost:5188', reuseExistingServer: true },
});
