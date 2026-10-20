import { defineConfig } from '@playwright/test';

// End-to-end tests of real journeys in Microsoft Edge (already on Windows), against the dev server;
// PREVIEW=1 runs them against the built version instead (pnpm build first).
const preview = !!process.env.PREVIEW;
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: preview ? 60_000 : 120_000, // the dev server compiles the 11 MB engine on a worker's first page (~55 s); the built app opens in < 1 s
  use: { channel: 'msedge', baseURL: preview ? 'http://localhost:4188' : 'http://localhost:5188', viewport: { width: 1366, height: 768 }, locale: 'en-US' },
  webServer: preview
    ? { command: 'node node_modules/vite/bin/vite.js preview --port 4188 --strictPort', url: 'http://localhost:4188', reuseExistingServer: true }
    : { command: 'node node_modules/vite/bin/vite.js --port 5188 --strictPort', url: 'http://localhost:5188', reuseExistingServer: true },
});
