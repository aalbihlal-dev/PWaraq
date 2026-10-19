// Tour screens for "a replaced Arabic line keeps its own font" (runs with tour.spec.ts: tour.config.ts).
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import { arabicDoc } from '../../tests/arabic-pdf.mjs';

const out = process.env.TOUR_OUT ?? path.join(import.meta.dirname, '..', '..', 'test-results', 'tour');
const shot = (page: import('@playwright/test').Page, name: string) => page.screenshot({ path: path.join(out, name) });

test('tour: own font', async ({ page }) => {
  fs.mkdirSync(path.join(out, 'files'), { recursive: true });
  const file = path.join(out, 'files', 'خطاب بخط نسخ.pdf');
  fs.writeFileSync(file, arabicDoc().saveToBuffer('garbage=compact').asUint8Array());
  await page.addInitScript(() => localStorage.setItem('waraq-lang', 'ar'));
  await page.goto('/');
  await page.locator('input[type=file]').first().setInputFiles(file);
  await page.locator('.task').nth(2).click(); // Edit
  await expect(page.locator('.editor .hit.line').first()).toBeAttached({ timeout: 30_000 });
  await page.locator('.editor .hit.line').first().click();
  const box = page.locator('.obj.text.on textarea'), note = page.getByTestId('font-note');
  await box.fill('عَليكم السلام');
  await expect(note).toContainText('NotoNaskhArabic');
  await page.waitForTimeout(500);
  await shot(page, '20-own-font-kept.png');
  await box.fill('جديد عليكم السلام');
  await expect(note).toContainText('ج');
  await page.waitForTimeout(500);
  await shot(page, '21-own-font-missing-letters.png');
  await box.fill('عَليكم السلام');
  await expect(note).not.toContainText('ج');
  await page.locator('.editor .tools .btn.primary').click();
  await expect(page.locator('.mod')).toBeVisible({ timeout: 20_000 });
  const [d] = await Promise.all([page.waitForEvent('download'), page.locator('.end .btn').first().click()]);
  const p = m.Document.openDocument(fs.readFileSync((await d.path())!), 'application/pdf').loadPage(0);
  fs.writeFileSync(path.join(out, '22-own-font-saved-page.png'), p.toPixmap(m.Matrix.scale(1.5, 1.5), m.ColorSpace.DeviceRGB, false).asPNG());
});
