import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { open, fixture } from './helpers';

// The desktop title bar (TitleBar.svelte) with a stand-in for Tauri's global API: the real shell is checked by
// tools/dev/tauri-smoke.mjs. Here: the bar sits at the top in the paper colour, 36 px buttons at the top-right corner
// in English and Arabic, the buttons reach the window, and the design audit stays green with the bar on screen.
const audit = fs.readFileSync(path.join(import.meta.dirname, '..', '..', 'tools', 'ui-audit.js'), 'utf8');
const stub = (updateVersion?: string) => {
  const calls: string[] = []; (window as any).tauriCalls = calls;
  const win = { isMaximized: async () => calls.includes('toggleMaximize'), onResized: () => {}, minimize: () => calls.push('minimize'), toggleMaximize: () => calls.push('toggleMaximize'), close: () => calls.push('close') };
  // commands the start screen calls: app_started (rollback note or null), check_update (an update or null), download_update
  const invoke = async (cmd: string) => { if (cmd.endsWith('_update')) calls.push(cmd); return cmd === 'check_update' ? (updateVersion ? { version: updateVersion, notes: '' } : null) : cmd === 'app_started' ? null : []; };
  (window as any).__TAURI__ = { core: { invoke }, event: { listen: async () => () => {} }, dialog: {}, window: { getCurrentWindow: () => win } };
};
async function bar(page: Page, tone: '--paper' | '--surface') {
  const bar = page.locator('.titlebar'), box = (await bar.boundingBox())!;
  expect(box.y).toBe(0); expect(box.height).toBe(40); expect(box.width).toBe(1366);
  const paper = await page.evaluate((v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim(), tone);
  expect(await bar.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe(await page.evaluate((c) => { const d = document.createElement('i'); d.style.color = c; document.body.append(d); const v = getComputedStyle(d).color; d.remove(); return v; }, paper));
  for (const b of await bar.locator('.win button').all()) { const r = (await b.boundingBox())!; expect(r.width).toBeGreaterThanOrEqual(36); expect(r.height).toBeGreaterThanOrEqual(36); expect(r.x).toBeGreaterThan(1366 - 160); }
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
  { // an open document: no strip any more, the window buttons sit in the top row, which is the drag region
    await expect(page.locator('.titlebar')).toHaveCount(0);
    const win = page.locator('.winfloat'), r = (await win.boundingBox())!, row = (await page.locator('.ws .bar').boundingBox())!;
    expect(r.y).toBe(0); expect(r.x + r.width).toBe(1366); expect(r.height).toBeGreaterThanOrEqual(row.height);
    for (const b of await win.locator('button').all()) { const q = (await b.boundingBox())!; expect(q.width).toBeGreaterThanOrEqual(36); expect(q.height).toBeGreaterThanOrEqual(36); expect(q.x).toBeGreaterThan(1366 - 160); }
    expect(await page.locator('.ws .bar').getAttribute('data-tauri-drag-region')).not.toBeNull();
    for (const el of await page.locator('.ws .bar button, .ws .bar img').all()) { const q = (await el.boundingBox())!; expect(q.x + q.width <= r.x || q.x >= r.x + r.width, 'nothing runs under the window buttons').toBe(true); }
    expect((await page.evaluate(audit) as { sample: unknown[] }).sample).toEqual([]);
  }
  await page.screenshot({ path: info.outputPath(`desktop-view-${lang}.png`) });
  const name = lang === 'ar' ? { min: 'تصغير', max: 'تكبير', restore: 'استعادة', close: 'إغلاق' } : { min: 'Minimise', max: 'Maximise', restore: 'Restore', close: 'Close' };
  await page.locator('.winfloat').getByRole('button', { name: name.min, exact: true }).click();
  await page.locator('.winfloat').getByRole('button', { name: name.max, exact: true }).click();
  await page.locator('.winfloat').getByRole('button', { name: name.close, exact: true }).click();
  expect(await page.evaluate(() => (window as any).tauriCalls)).toEqual(['minimize', 'toggleMaximize', 'close']);
});

// The updater row on the start screen: a found update is downloaded in the background and waits for the click on
// "Restart to update"; nothing installs on its own (install_update is only called by that button).
for (const lang of ['en', 'ar']) test(`update ready: Restart to update waits for a click (${lang})`, async ({ page }, info) => {
  await page.addInitScript((l) => { localStorage.setItem('waraq-lang', l); localStorage.removeItem('waraq-update-checked'); }, lang);
  await page.addInitScript(stub, '1.0.1');
  await page.goto('/');
  const restart = page.getByRole('button', { name: lang === 'ar' ? 'أعد التشغيل للتحديث · 1.0.1' : 'Restart to update · 1.0.1' });
  await expect(restart).toBeVisible();
  const box = (await restart.boundingBox())!; expect(box.height).toBeGreaterThanOrEqual(36);
  const calls = await page.evaluate(() => (window as any).tauriCalls as string[]);
  expect(calls).toContain('check_update'); expect(calls).toContain('download_update'); expect(calls).not.toContain('install_update');
  expect((await page.evaluate(audit) as { sample: unknown[] }).sample).toEqual([]);
  await page.screenshot({ path: info.outputPath(`desktop-update-ready-${lang}.png`) });
  await restart.click();
  expect(await page.evaluate(() => (window as any).tauriCalls)).toContain('install_update');
});

test('no update: the row offers a manual check and reports the latest version', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('waraq-update-checked', String(Date.now()))); // checked today: no automatic check
  await page.addInitScript(stub);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Check for updates' })).toBeVisible();
  expect(await page.evaluate(() => (window as any).tauriCalls)).not.toContain('check_update');
  await page.getByRole('button', { name: 'Check for updates' }).click();
  await expect(page.getByText('You have the latest version.')).toBeVisible();
});

test('the web build shows no title bar', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.titlebar')).toHaveCount(0);
  expect(await page.evaluate(() => 'desktop' in document.documentElement.dataset)).toBe(false);
});
