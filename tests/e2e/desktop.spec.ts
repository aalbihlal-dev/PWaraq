import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { open, fixture } from './helpers';

// The desktop title bar (TitleBar.svelte) with a stand-in for Tauri's global API: the real shell is checked by
// tools/dev/tauri-smoke.mjs. Here: the bar sits at the top in the paper colour, 36 px buttons at the top-right corner
// in English and Arabic, the buttons reach the window, and the design audit stays green with the bar on screen.
const audit = fs.readFileSync(path.join(import.meta.dirname, '..', '..', 'tools', 'ui-audit.js'), 'utf8');
const stub = () => {
  const calls: string[] = []; (window as any).tauriCalls = calls;
  const win = { isMaximized: async () => calls.includes('toggleMaximize'), onResized: () => {}, minimize: () => calls.push('minimize'), toggleMaximize: () => calls.push('toggleMaximize'), close: () => calls.push('close') };
  (window as any).__TAURI__ = { core: { invoke: async () => [] }, event: { listen: async () => () => {} }, dialog: {}, window: { getCurrentWindow: () => win } };
};
async function bar(page: Page, tone: '--paper' | '--surface') {
  const bar = page.locator('.titlebar'), box = (await bar.boundingBox())!;
  expect(box.y).toBe(0); expect(box.height).toBe(40); expect(box.width).toBe(1366);
  const paper = await page.evaluate((v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim(), tone);
  expect(await bar.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe(await page.evaluate((c) => { const d = document.createElement('i'); d.style.color = c; document.body.append(d); const v = getComputedStyle(d).color; d.remove(); return v; }, paper));
  for (const b of await bar.locator('button').all()) { const r = (await b.boundingBox())!; expect(r.width).toBeGreaterThanOrEqual(36); expect(r.height).toBeGreaterThanOrEqual(36); expect(r.x).toBeGreaterThan(1366 - 160); }
  expect((await page.evaluate(audit) as { sample: unknown[] }).sample).toEqual([]);
}

for (const lang of ['en', 'ar']) test(`desktop title bar: paper colour, top-right buttons, audit clean (${lang})`, async ({ page }, info) => {
  await page.addInitScript((l) => localStorage.setItem('waraq-lang', l), lang);
  await page.addInitScript(stub);
  await page.goto('/');
  await bar(page, '--paper');
  await page.screenshot({ path: info.outputPath(`desktop-start-${lang}.png`) });
  await open(page, fixture('three.pdf'));
  await expect(page.locator('.page canvas').first()).toBeVisible();
  await bar(page, '--surface'); // merges with the task bar: one surface, no step
  await page.screenshot({ path: info.outputPath(`desktop-view-${lang}.png`) });
  const name = lang === 'ar' ? { min: 'تصغير', max: 'تكبير', restore: 'استعادة', close: 'إغلاق' } : { min: 'Minimise', max: 'Maximise', restore: 'Restore', close: 'Close' };
  await page.locator('.titlebar').getByRole('button', { name: name.min, exact: true }).click();
  await page.locator('.titlebar').getByRole('button', { name: name.max, exact: true }).click();
  await page.locator('.titlebar').getByRole('button', { name: name.close, exact: true }).click();
  expect(await page.evaluate(() => (window as any).tauriCalls)).toEqual(['minimize', 'toggleMaximize', 'close']);
});

test('the web build shows no title bar', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.titlebar')).toHaveCount(0);
  expect(await page.evaluate(() => 'desktop' in document.documentElement.dataset)).toBe(false);
});
