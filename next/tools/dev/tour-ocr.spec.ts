// OCR screenshots for the owner (Arabic UI, the grainy tilted photocopy of the test set):
// pnpm build; npx playwright test -c tools/dev/tour.config.ts tour-ocr   → test-results/tour-ocr/ (copy them to the archive)
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const out = process.env.TOUR_OUT ?? path.join(import.meta.dirname, '..', '..', 'test-results', 'tour-ocr');
const fx = (f: string) => path.join(import.meta.dirname, '..', '..', 'tests', 'fixtures', 'ocr', f);
const shot = (page: import('@playwright/test').Page, name: string) => page.screenshot({ path: path.join(out, name) });

test('ocr tour', async ({ page }) => {
  fs.mkdirSync(out, { recursive: true });
  await page.addInitScript(() => localStorage.setItem('waraq-lang', 'ar'));
  await page.goto('/');
  await page.locator('input[type=file]').first().setInputFiles(fx('08-minutes-photocopy-200.pdf'));
  await expect(page.locator('.page').first()).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'التعرف على النص', exact: true }).click();
  await page.waitForTimeout(1500);
  await shot(page, '1-ocr-panel.png');
  await page.getByRole('button', { name: 'أضف نصًا قابلًا للبحث' }).click();
  await expect(page.getByText(/جارٍ قراءة الصفحة 1/)).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(700);
  await shot(page, '2-ocr-reading.png');
  await expect(page.getByText('تغيّر — لم يُحفظ بعد')).toBeVisible({ timeout: 150_000 });
  // back in View: find a word that is only there thanks to OCR
  await page.locator('.task').first().click();
  await expect(page.locator('.page').first()).toBeVisible();
  await page.keyboard.press('Control+f');
  await page.getByRole('searchbox').fill('اللجنة');
  await page.waitForTimeout(1500);
  await shot(page, '3-ocr-search.png');
});
