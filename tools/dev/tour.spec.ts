import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';

const out = process.env.TOUR_OUT ?? path.join(import.meta.dirname, '..', '..', 'test-results', 'tour');
const fx = (f: string) => path.join(import.meta.dirname, '..', '..', 'tests', 'fixtures', f);
const cad = path.join(import.meta.dirname, '..', '..', 'public', '_test', 'mv-trenches.pdf');
const shot = (page: import('@playwright/test').Page, name: string) => page.screenshot({ path: path.join(out, name) });

test('tour', async ({ page }) => {
  fs.mkdirSync(out, { recursive: true });
  // weekly files with Arabic names, as a student would have them
  const tmp = path.join(out, 'files'); fs.mkdirSync(tmp, { recursive: true });
  const week1 = path.join(tmp, 'الأسبوع 1 - مقدمة المقرر.pdf'), week2 = path.join(tmp, 'الأسبوع 2 - تقرير المختبر.pdf'), photo = path.join(tmp, 'صورة السبورة.png');
  fs.copyFileSync(fx('three.pdf'), week1); fs.copyFileSync(fx('small.pdf'), week2); fs.copyFileSync(fx('photo.png'), photo);
  await page.addInitScript(() => localStorage.setItem('waraq-lang', 'ar'));
  await page.goto('/');

  // 1. a drawing in View (the owner's CAD sheet when it is on this PC)
  await page.locator('input[type=file]').first().setInputFiles(fs.existsSync(cad) ? cad : fx('small.pdf'));
  await expect.poll(() => page.locator('.page canvas:not(.tile)').first().evaluate((c: HTMLCanvasElement) => c.width), { timeout: 90_000 }).not.toBe(300);
  await page.waitForTimeout(1500);
  await shot(page, '1-view.png');

  // 2. Organize: the page grid
  await page.locator('.end .btn').nth(2).click(); // close
  await page.locator('input[type=file]').first().setInputFiles(fx('three.pdf'));
  await page.locator('.task').nth(1).click();
  await expect(page.locator('.cell canvas').first()).toBeVisible();
  await page.locator('.cell').nth(1).click();
  await page.locator('.cell').nth(2).click({ modifiers: ['Control'] });
  await page.waitForTimeout(800);
  await page.locator('.cell').nth(2).hover();
  await shot(page, '2-organize.png');

  // 3. Portfolio: two weeks, a divider page, a photo, contents
  await page.locator('.end .btn').nth(2).click(); // close
  await page.locator('.actions .btn').nth(1).click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.empty').click()]);
  await chooser.setFiles([week1, week2]);
  await expect(page.locator('.sec')).toHaveCount(2);
  await page.locator('.sec').first().locator('.btn').first().click();
  await page.locator('.paper input').fill('مقرر التصميم — الفصل الأول');
  const [c2] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.sec').nth(1).locator('.btn').nth(1).click()]);
  await c2.setFiles([photo]);
  await expect(page.locator('.cell')).toHaveCount(5);
  await page.locator('.side input').first().fill('مقرر التصميم ١٠١');
  await page.waitForTimeout(1200);
  await shot(page, '3-portfolio.png');
  await page.locator('.grid').evaluate((g) => g.scrollTo(0, 420));
  await page.waitForTimeout(600);
  await shot(page, '4-portfolio-sections.png');

  // 4. the exported PDF: contents page and divider page as they print
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('.side .btn.primary').click()]);
  const doc = m.Document.openDocument(fs.readFileSync((await download.path())!), 'application/pdf');
  for (const i of [0, 1]) fs.writeFileSync(path.join(out, `5-exported-page-${i + 1}.png`), doc.loadPage(i).toPixmap(m.Matrix.scale(1.3, 1.3), m.ColorSpace.DeviceRGB, false).asPNG());
  fs.copyFileSync((await download.path())!, path.join(out, 'مقرر التصميم ١٠١.pdf'));

  // 5. start screen with the recent files
  await page.locator('.end .btn').nth(2).click(); // close
  await expect(page.locator('.recent .card')).toHaveCount(3);
  await shot(page, '6-start-recent.png');
  await page.locator('.lang').click();
  await shot(page, '7-start-english.png');
});
