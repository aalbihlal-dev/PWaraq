import { test, expect, devices, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fixture } from './helpers';

// Phones and tablets (touch): nothing moves sideways, the options are a bottom sheet (slim dock, handle, close), two fingers change the card size /
// zoom the page, touch targets are at least 44 px. Chromium with each device's viewport, scale and touch (WebKit is not installed here).
const audit = fs.readFileSync(path.join(import.meta.dirname, '..', '..', 'tools', 'ui-audit.js'), 'utf8');
const strip = (d: object) => { const { defaultBrowserType, ...rest } = d as Record<string, unknown>; return rest; };
const DEVICES = [['iPhone 14', strip(devices['iPhone 14'])], ['iPhone SE', strip(devices['iPhone SE'])], ['iPad portrait', strip(devices['iPad (gen 7)'])]] as const;
const T = {
  en: { portfolio: 'New portfolio', add: 'Add file', hide: 'Hide options', show: 'Show options', name: 'Portfolio name' },
  ar: { portfolio: 'حافظة جديدة', add: 'إضافة ملف', hide: 'إخفاء الخيارات', show: 'إظهار الخيارات', name: 'اسم الحافظة' },
};

async function pinch(page: Page, x: number, y: number, from: number, to: number) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type: string, pts: { x: number; y: number; id: number }[]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  const at = (d: number) => [{ x: x - d / 2, y, id: 1 }, { x: x + d / 2, y, id: 2 }];
  await send('touchStart', at(from));
  for (let i = 1; i <= 8; i++) await send('touchMove', at(from + ((to - from) * i) / 8));
  await send('touchEnd', []);
  await page.waitForTimeout(400);
}
const fits = (page: Page) => page.evaluate(() => ({
  h: document.documentElement.scrollWidth <= innerWidth + 1,
  out: [...document.querySelectorAll('button, input, select, textarea')].filter((e) => { const r = e.getBoundingClientRect(), v = getComputedStyle(e).visibility; return r.width > 0 && v !== 'hidden' && (r.right > innerWidth + 1 || r.left < -1); })
    .map((e) => (e.getAttribute('aria-label') || (e as HTMLElement).innerText || e.className).slice(0, 30)),
}));

for (const [label, dev] of DEVICES) for (const lang of ['en', 'ar'] as const) test(`touch: Portfolio on ${label} (${lang}): no sideways movement, bottom sheet, pinch`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const tx = T[lang], ctx = await browser.newContext({ ...dev, locale: lang === 'ar' ? 'ar-SA' : 'en-US', baseURL: info.project.use.baseURL });
  await ctx.addInitScript((l) => localStorage.setItem('waraq-lang', l), lang);
  const page = await ctx.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: tx.portfolio }).tap();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.empty').tap()]);
  await chooser.setFiles([fixture('three.pdf')]);
  await expect(page.locator('.cell').first()).toBeVisible({ timeout: 60_000 });
  const f = await fits(page);
  expect(f.h, 'no horizontal scroll').toBe(true);
  expect(f.out, 'nothing off-screen').toEqual([]);
  const vp = page.viewportSize()!, narrow = vp.width <= 820;
  for (const b of await page.locator('.bar button, .sheet .dock button').all()) { if (!(await b.isVisible())) continue; const r = (await b.boundingBox())!; expect(r.height, 'touch target').toBeGreaterThanOrEqual(43.5); }
  if (narrow) {
    const box = (await page.locator('.sheet .dock').boundingBox())!;
    expect(box.y + box.height).toBeGreaterThan(vp.height - 2); // the dock sits at the bottom, the options are out of sight below it
    await expect(page.getByLabel(tx.name)).toBeHidden();
    const pages = (await page.locator('.grid').boundingBox())!;
    expect(pages.height).toBeGreaterThan(vp.height * 0.55); // the page area is most of the screen
    await expect(page.getByRole('button', { name: tx.add }).first()).toBeVisible();
    await page.getByRole('button', { name: tx.show }).tap();
    await expect(page.getByLabel(tx.name)).toBeVisible();
    expect((await page.locator('.grid').boundingBox())!.height).toBeCloseTo(pages.height, 0); // opening the sheet does not push the pages around
    expect((await fits(page)).h).toBe(true);
    expect(((await page.evaluate(audit)) as { sample: unknown[] }).sample).toEqual([]);
    await page.getByRole('button', { name: tx.hide }).first().tap();
    await expect(page.getByLabel(tx.name)).toBeHidden();
    // swipe up on the handle opens, swipe down closes (after the sheet has finished sliding)
    await page.waitForTimeout(500);
    const cdp = await ctx.newCDPSession(page);
    const swipe = async (dy: number) => {
      const g = (await page.locator('.sheet .dock .grip').boundingBox())!, x = g.x + g.width / 2, y = g.y + g.height / 2; // where the handle is now
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
      for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + (dy * i) / 6, id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(500);
    };
    await swipe(-120); await expect(page.getByLabel(tx.name)).toBeVisible();
    await swipe(160); await expect(page.getByLabel(tx.name)).toBeHidden();
  }
  // two fingers: the page cards change size like the slider; the browser's own zoom stays put
  const cell = page.locator('.cell .sheet').first(), w0 = (await cell.boundingBox())!.width, g = (await page.locator('.grid').boundingBox())!;
  await pinch(page, g.x + g.width / 2, g.y + 150, 100, 220);
  const w1 = (await cell.boundingBox())!.width;
  expect(w1).toBeGreaterThan(w0 * 1.3);
  await pinch(page, g.x + g.width / 2, g.y + 150, 220, 90);
  expect((await cell.boundingBox())!.width).toBeLessThan(w1 * 0.7);
  expect(await page.evaluate(() => visualViewport!.scale)).toBe(1);
  expect((await fits(page)).h).toBe(true);
  await page.screenshot({ path: info.outputPath(`portfolio-${label.replace(/ /g, '-')}-${lang}.png`) });
  await ctx.close();
});

for (const lang of ['en', 'ar'] as const) test(`touch: View on iPhone 14 (${lang}): top row fits, pinch zooms the page, no sideways scroll`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ ...DEVICES[0][1], locale: lang === 'ar' ? 'ar-SA' : 'en-US', baseURL: info.project.use.baseURL });
  await ctx.addInitScript((l) => localStorage.setItem('waraq-lang', l), lang);
  const page = await ctx.newPage();
  await page.goto('/');
  await page.locator('input[type=file]').first().setInputFiles(fixture('three.pdf'));
  await expect(page.locator('.page').first()).toBeVisible({ timeout: 60_000 });
  const f = await fits(page);
  expect(f.h).toBe(true);
  expect(f.out).toEqual([]);
  for (const b of await page.locator('.bar button').all()) { const r = (await b.boundingBox())!; expect(r.height).toBeGreaterThanOrEqual(43.5); }
  const pg = page.locator('.page').first(), w0 = (await pg.boundingBox())!.width, s = (await page.locator('.scroller').boundingBox())!;
  await pinch(page, s.x + s.width / 2, s.y + 200, 100, 200);
  expect((await pg.boundingBox())!.width).toBeGreaterThan(w0 * 1.5);
  expect(await page.evaluate(() => visualViewport!.scale)).toBe(1);
  await page.getByRole('button', { name: /▾/ }).first().tap(); // the tasks menu
  await expect(page.getByRole('menuitem')).toHaveCount(10);
  await page.screenshot({ path: info.outputPath(`view-${lang}.png`) });
  await ctx.close();
});

