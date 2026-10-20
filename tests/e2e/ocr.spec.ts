import { test, expect } from '@playwright/test';
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import { open, saved, fixture } from './helpers';
import { inkPlacement } from '../ocr-check.mjs';

test('ocr: a scanned page (English and Arabic) becomes searchable; the picture stays', async ({ page }) => {
  test.setTimeout(180_000);
  await open(page, fixture('ocr/07-report-bilingual-300.pdf'));
  await page.getByRole('button', { name: 'OCR', exact: true }).click();
  await page.getByRole('button', { name: 'Add searchable text' }).click();
  await expect(page.getByText(/Reading page 1 \/ 1/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Changed — not saved yet')).toBeVisible({ timeout: 150_000 });
  const file = await saved(page, () => page.getByRole('button', { name: 'Save' }).first().click());
  const p = m.Document.openDocument(file.bytes, 'application/pdf').loadPage(0), text = p.toStructuredText().asText();
  expect(text).toMatch(/Annual report summary/);
  expect(text).toMatch(/forty thousand visitors/);
  expect(text).toMatch(/ملخص التقرير السنوي/); // a printed line copies as one line, words joined in reading order
  expect(text).toMatch(/أولويات العام القادم هي تمديد ساعات العمل/);
  // the hit sits on the printed word: "المكتبة" is the second word of the first Arabic paragraph line, x 453..488 pt
  // on the page it was drawn from (right margin 535 minus the Tajawal widths of "استقبلت " and "المكتبة" at 12 pt)
  const hits = p.search('المكتبة');
  expect(hits.length).toBe(1);
  const xs = hits[0][0].filter((_, i) => i % 2 === 0); // quad: x y x y x y x y
  expect(Math.min(...xs)).toBeGreaterThan(445);
  expect(Math.max(...xs)).toBeLessThan(496);
  // the picture is still the page's content
  const images: unknown[] = []; p.toStructuredText('preserve-images').walk({ onImageBlock: () => images.push(1) });
  expect(images).toHaveLength(1);
});

test('ocr: a tilted, grainy photocopy is straightened and cleaned before reading (unreadable without)', async ({ page }) => {
  test.setTimeout(180_000);
  await open(page, fixture('ocr/08-minutes-photocopy-200.pdf'));
  await page.getByRole('button', { name: 'OCR', exact: true }).click();
  await page.getByRole('button', { name: 'Add searchable text' }).click();
  await expect(page.getByText('Changed — not saved yet')).toBeVisible({ timeout: 150_000 });
  const file = await saved(page, () => page.getByRole('button', { name: 'Save' }).first().click());
  const doc = m.Document.openDocument(file.bytes, 'application/pdf'), text = doc.loadPage(0).toStructuredText().asText();
  expect(text).toMatch(/محضر اجتماع لجنة المكتبة/);
  expect(text).toMatch(/الاجتماع القادم/);
  expect(doc.countPages()).toBe(1);
  const p = inkPlacement(m, file.bytes); // the words sit on the print, after the tilt was undone
  expect(p.words).toBeGreaterThan(60);
  expect(p.placed).toBeGreaterThanOrEqual(0.95);
});

test('ocr: a tilted page: every invisible word sits on its printed word, the page is the same page', async ({ page }) => {
  test.setTimeout(180_000);
  await open(page, fixture('ocr/04-notice-tilted-200.pdf'));
  await page.getByRole('button', { name: 'OCR', exact: true }).click();
  await page.getByRole('button', { name: 'Add searchable text' }).click();
  await expect(page.getByText('Changed — not saved yet')).toBeVisible({ timeout: 150_000 });
  const file = await saved(page, () => page.getByRole('button', { name: 'Save' }).first().click());
  const doc = m.Document.openDocument(file.bytes, 'application/pdf');
  expect(doc.countPages()).toBe(1);
  const images: unknown[] = []; doc.loadPage(0).toStructuredText('preserve-images').walk({ onImageBlock: () => images.push(1) });
  expect(images).toHaveLength(1);
  expect(doc.loadPage(0).toStructuredText().asText()).toMatch(/إعلان لسكان المجمع/);
  const p = inkPlacement(m, file.bytes);
  expect(p.words).toBeGreaterThan(60);
  expect(p.placed).toBeGreaterThanOrEqual(0.95);
});

test('ocr: a page that already has text is left alone ("only pages without text")', async ({ page }) => {
  await open(page, fixture('three.pdf'));
  await page.getByRole('button', { name: 'OCR', exact: true }).click();
  await page.getByRole('button', { name: 'Add searchable text' }).click();
  await expect(page.getByText('Every page already has text.')).toBeVisible({ timeout: 30_000 });
});
