// Screenshot tour of the built Waraq 1.0 (for the owner):  pnpm build; npx playwright test -c tools/dev/tour.config.ts
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: 'tour.spec.ts', timeout: 180_000,
  use: { channel: 'msedge', baseURL: 'http://localhost:4188', viewport: { width: 1366, height: 768 }, locale: 'ar' },
  webServer: { command: 'node node_modules/vite/bin/vite.js preview --port 4188 --strictPort', url: 'http://localhost:4188', reuseExistingServer: true, cwd: '../..' },
});
