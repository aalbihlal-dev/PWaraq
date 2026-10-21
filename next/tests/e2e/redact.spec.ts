import { test, expect } from '@playwright/test';
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import { open, saved, fixture } from './helpers';

const pdf = (b: Uint8Array) => m.Document.openDocument(b, 'application/pdf');

test('redact: find phone numbers and a word, drag one area, apply — the text is gone from the saved file', async ({ page }) => {
  await open(page, fixture('private.pdf'));
  await page.getByRole('button', { name: 'Redact' }).click();
  await expect(page.locator('.redact .sheet canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Mark all' }).click();
  await expect(page.locator('.redact .mark')).toHaveCount(2); // Latin and Arabic-digit numbers
  await page.getByLabel('Email addresses').check();
  await page.getByRole('button', { name: 'Mark all' }).click();
  await expect(page.locator('.redact .mark')).toHaveCount(3);
  await page.getByLabel('A word or phrase').check();
  await page.getByLabel('A word or phrase').last().fill('secret');
  await page.getByRole('button', { name: 'Mark all' }).click();
  await expect(page.locator('.redact .mark')).toHaveCount(4);
  // drag a fifth area over nothing in particular, then take it away again with a click
  const b = (await page.locator('.redact .sheet').boundingBox())!;
  await page.mouse.move(b.x + 100, b.y + 400); await page.mouse.down(); await page.mouse.move(b.x + 200, b.y + 450, { steps: 4 }); await page.mouse.up();
  await expect(page.locator('.redact .mark')).toHaveCount(5);
  await page.locator('.redact .mark').last().click();
  await expect(page.locator('.redact .mark')).toHaveCount(4);

  await page.getByLabel('Also remove title, author and dates').check();
  await page.getByRole('button', { name: 'Remove marked content' }).click();
  await expect(page.getByText('Changed — not saved yet')).toBeVisible(); // the document is reopened, now without the marked content
  const file = await saved(page, () => page.getByRole('button', { name: 'Save' }).first().click());
  const d = pdf(file.bytes), text = d.loadPage(0).toStructuredText().asText();
  for (const gone of ['966', 'sami@', '٠٥٠', 'secret']) expect(text).not.toContain(gone);
  expect(text).toContain('Call Sami');
  expect(d.loadPage(0).search('secret')).toHaveLength(0);
  expect(d.getMetaData('info:Author') ?? '').toBe('');
});
