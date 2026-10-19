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

  // 6. the page editor (Arabic): a page of the portfolio gets an Arabic note and a photo, in its place in the portfolio
  await page.locator('.lang').click();
  await page.locator('.recent .card', { hasText: 'مقرر التصميم' }).first().click();
  await expect(page.locator('.cell')).toHaveCount(5);
  await page.locator('.cell').nth(1).dblclick();
  const ready = () => expect(page.locator('.editor .sheet .hit').first()).toBeAttached({ timeout: 30_000 });
  await ready();
  await page.locator('.editor .tools .btn').nth(1).click(); // Add text
  let sheet = (await page.locator('.editor .sheet').boundingBox())!, s = sheet.width / 595;
  await page.mouse.click(sheet.x + 520 * s, sheet.y + 600 * s);
  await page.keyboard.type('ملاحظة: راجع هذا الدرس قبل الاختبار');
  await page.locator('.editor .side select').selectOption('20');
  await page.locator('.editor .swatch').nth(2).click(); // green
  await page.locator('.editor .side .row .btn').first().click(); // bold
  const [c3] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.editor .tools .btn').nth(2).click()]);
  await c3.setFiles([photo]);
  await page.waitForTimeout(800);
  await shot(page, '8-editor-portfolio-page.png');
  await page.locator('.editor .tools .btn.primary').click(); // Save page
  await expect(page.locator('.cell')).toHaveCount(5);
  await page.waitForTimeout(1200);
  await shot(page, '9-portfolio-after-edit.png');
  const [d2] = await Promise.all([page.waitForEvent('download'), page.locator('.side .btn.primary').click()]);
  const edited = m.Document.openDocument(fs.readFileSync((await d2.path())!), 'application/pdf');
  fs.writeFileSync(path.join(out, '10-edited-page-exported.png'), edited.loadPage(3).toPixmap(m.Matrix.scale(1.3, 1.3), m.ColorSpace.DeviceRGB, false).asPNG());

  // 7. a PDF in View → Edit: a photo moved, another replaced, a heading replaced with Arabic
  await page.locator('.end .btn').nth(2).click(); // close
  await page.locator('input[type=file]').first().setInputFiles(fx('edit.pdf'));
  await page.locator('.task').nth(2).click(); // Edit
  await ready();
  sheet = (await page.locator('.editor .sheet').boundingBox())!; s = sheet.width / 595;
  await page.locator('.editor .hit.photo').first().click();
  const b = (await page.locator('.obj.pic.on').boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 60 * s, b.y + b.height / 2 + 260 * s, { steps: 8 }); await page.mouse.up();
  await page.locator('.editor .hit.photo').first().click();
  const [c4] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.editor .side .btn').first().click()]); // replace photo
  await c4.setFiles([photo]);
  await page.locator('.editor .hit.line').first().click();
  await page.locator('.obj.text.on textarea').fill('عنوان جديد للتقرير');
  await page.waitForTimeout(800);
  await shot(page, '11-editor-photo-and-heading.png');
  await page.locator('.editor .tools .btn.primary').click();
  await expect(page.locator('.mod')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1500);
  await shot(page, '12-view-after-edit.png');

  // 8. signing mode (Arabic): a photo of a signature cleaned, two files signed with the same set and date
  await page.locator('.end .btn').nth(2).click(); // close (the edited file is not kept)
  await page.locator('input[type=file]').first().setInputFiles(fx('sign-ar.pdf'));
  await page.locator('.task').nth(4).click(); // Sign
  await expect(page.locator('.need')).toHaveCount(1, { timeout: 30_000 });
  await page.locator('.maker [role=tab]').nth(2).click(); // photo
  const [c5] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.maker .btn').nth(3).click()]);
  await c5.setFiles([fx('signature-photo.png')]);
  await page.locator('.maker .swatch').nth(2).click(); // blue
  await page.waitForTimeout(500);
  await shot(page, '13-sign-photo-cleaned.png');
  await page.locator('.maker .btn.primary').click(); // save signature
  await page.locator('.side input.input').last().fill('عبدالله');
  const [c6] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.side section .btn').first().click()]);
  await c6.setFiles([fx('sign-en.pdf')]);
  await page.locator('.need .btn').first().click();
  await page.waitForTimeout(800);
  await shot(page, '14-sign-needed-highlighted.png');
  await page.locator('.where').click();
  await page.keyboard.press('Enter');
  await expect(page.locator('.where')).toContainText('sign-en.pdf', { timeout: 20_000 });
  await page.waitForTimeout(800);
  await shot(page, '15-sign-second-file.png');
  await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
  const got: string[] = [];
  page.on('download', async (d) => { const f = path.join(out, d.suggestedFilename()); fs.copyFileSync((await d.path())!, f); got.push(f); });
  await page.locator('.tools .end .btn').nth(1).click(); // save all
  await expect.poll(() => got.length, { timeout: 30_000 }).toBe(2);
  for (const [f, n, name] of [[got.find((g) => g.includes('sign-ar'))!, 1, '16-signed-arabic.png'], [got.find((g) => g.includes('sign-en'))!, 0, '17-signed-english.png']] as const)
    fs.writeFileSync(path.join(out, name), m.Document.openDocument(fs.readFileSync(f), 'application/pdf').loadPage(n).toPixmap(m.Matrix.scale(1.3, 1.3), m.ColorSpace.DeviceRGB, false).asPNG());
});
