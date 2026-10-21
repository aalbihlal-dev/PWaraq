import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fixture } from './helpers';

// The add-on prompt in the desktop app, with a stand-in for Tauri's API: the first Office/CAD conversion answers
// NO_PACKS, the page asks "Download the Office & CAD add-on (137 MB)?", nothing is downloaded before the click;
// after Download the progress shows, then the conversion runs and the document opens. "Not now" shows no error.
const audit = fs.readFileSync(path.join(import.meta.dirname, '..', '..', 'tools', 'ui-audit.js'), 'utf8');
const stub = () => {
  const calls: string[] = []; (window as any).tauriCalls = calls;
  const listeners: Record<string, (e: { payload: unknown }) => void> = {};
  let installed = false;
  const invoke = async (cmd: string) => {
    calls.push(cmd);
    if (cmd === 'convert_to_pdf') { if (!installed) throw 'NO_PACKS'; return (await (await fetch('/_test/small.pdf')).arrayBuffer()); }
    if (cmd === 'pack_status') return { installed, size: 144155656, unpacked: 604520932 };
    if (cmd === 'pack_install') { for (const done of [16777216, 80000000, 144155656]) { listeners['pack-progress']?.({ payload: [done, 144155656] }); await new Promise((r) => setTimeout(r, 150)); } installed = true; return null; }
    if (cmd === 'check_update') return null;
    return cmd === 'app_started' ? null : [];
  };
  const win = { isMaximized: async () => false, onResized: () => {}, minimize: () => {}, toggleMaximize: () => {}, close: () => {} };
  (window as any).__TAURI__ = { core: { invoke }, event: { listen: async (n: string, cb: (e: { payload: unknown }) => void) => { listeners[n] = cb; return () => {}; } }, dialog: {}, window: { getCurrentWindow: () => win } };
};

for (const lang of ['en', 'ar']) test(`first conversion asks for the add-on, downloads it after the click, then converts (${lang})`, async ({ page }, info) => {
  await page.addInitScript((l) => { localStorage.setItem('waraq-lang', l); localStorage.setItem('waraq-update-checked', String(Date.now())); }, lang);
  await page.addInitScript(stub);
  await page.goto('/');
  await page.locator('input[type=file]').first().setInputFiles(fixture('office/arabic.docx'));
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: lang === 'ar' ? 'هل تريد تنزيل إضافة أوفيس و CAD (137 ميغابايت)؟' : 'Download the Office & CAD add-on (137 MB)?' })).toBeVisible();
  expect(await page.evaluate(() => (window as any).tauriCalls)).not.toContain('pack_install'); // nothing before the click
  for (const b of await dialog.getByRole('button').all()) { const r = (await b.boundingBox())!; expect(r.height).toBeGreaterThanOrEqual(36); }
  const a = (await page.evaluate(audit)) as { sample: unknown[] }; expect(a.sample, JSON.stringify(a.sample)).toEqual([]);
  await page.screenshot({ path: info.outputPath(`pack-prompt-${lang}.png`) });
  await dialog.getByRole('button', { name: lang === 'ar' ? 'تنزيل' : 'Download' }).click();
  await expect(dialog.getByRole('progressbar')).toBeVisible();
  await page.screenshot({ path: info.outputPath(`pack-downloading-${lang}.png`) });
  await expect(page.locator('.page canvas').first()).toBeVisible({ timeout: 20_000 });
  await expect(dialog).toHaveCount(0);
  const calls = await page.evaluate(() => (window as any).tauriCalls as string[]);
  expect(calls.filter((c) => c === 'convert_to_pdf')).toHaveLength(2); // once before the pack, once after
  expect(calls).toContain('pack_install');
});

test('"Not now" closes the prompt without an error message', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('waraq-update-checked', String(Date.now())));
  await page.addInitScript(stub);
  await page.goto('/');
  await page.locator('input[type=file]').first().setInputFiles(fixture('office/table.xlsx'));
  await page.getByRole('dialog').getByRole('button', { name: 'Not now' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('This file could not be converted.')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).tauriCalls)).not.toContain('pack_install');
});
