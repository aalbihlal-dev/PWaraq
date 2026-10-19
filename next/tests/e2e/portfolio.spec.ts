import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import { saved, choose, fixture } from './helpers';

test('portfolio: sections from files, contents with titles, divider page, photo, export, save and reopen', async ({ page }, info) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await page.getByRole('button', { name: 'New portfolio' }).click();
  await choose(page, () => page.getByRole('button', { name: 'Add a file as a section' }).first().click(), [fixture('three.pdf'), fixture('small.pdf')]);
  await expect(page.locator('.sec')).toHaveCount(2);
  await expect(page.locator('.sec .title').first()).toHaveValue('three');

  // contents: titles come from the file names and are marked until renamed
  const rows = page.locator('.toc li');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toHaveClass(/auto/);
  await rows.nth(0).locator('input').fill('Ø§Ù„Ø£Ø³Ø¨ÙˆØ¹ Ø§Ù„Ø£ÙˆÙ„');
  await expect(rows.nth(0)).not.toHaveClass(/auto/);
  await expect(page.locator('.sec .title').first()).toHaveValue('Ø§Ù„Ø£Ø³Ø¨ÙˆØ¹ Ø§Ù„Ø£ÙˆÙ„');

  // a divider page for section 1, written on directly
  await page.locator('.sec').first().getByRole('button', { name: 'Divider page' }).click();
  await page.locator('.paper input').fill('Ù…Ù‚Ø¯Ù…Ø© Ø§Ù„Ù…Ù‚Ø±Ø±');
  // a photo into section 2
  await choose(page, () => page.locator('.sec').nth(1).getByRole('button', { name: 'Add pages or photos' }).click(), [fixture('photo.png')]);
  await expect(page.locator('.cell')).toHaveCount(5);
  // grid numbers follow the combined file: contents 1, divider 2, Week 1 pages 3-5, small 6, photo 7
  await expect(page.locator('.cell .num')).toHaveText(['3', '4', '5', '6', '7']);
  await expect(page.locator('.toc .pg')).toHaveText(['2', '6']);
  await page.screenshot({ path: info.outputPath('portfolio.png') });

  const pdf = await saved(page, () => page.getByRole('button', { name: 'Export PDF' }).click());
  const doc = m.Document.openDocument(pdf.bytes, 'application/pdf');
  expect(doc.countPages()).toBe(7);
  expect(doc.loadPage(0).getLinks().map((l) => doc.resolveLink(l))).toEqual([1, 5]);
  expect(doc.loadPage(1).toStructuredText().asText()).toContain('Ø§Ù„Ø£Ø³Ø¨ÙˆØ¹ Ø§Ù„Ø£ÙˆÙ„');
  expect(doc.loadPage(1).toStructuredText().asText()).toContain('Ù…Ù‚Ø¯Ù…Ø© Ø§Ù„Ù…Ù‚Ø±Ø±');
  expect(doc.loadOutline()!.map((o) => [o.title, o.page])).toEqual([['Contents', 0], ['Ø§Ù„Ø£Ø³Ø¨ÙˆØ¹ Ø§Ù„Ø£ÙˆÙ„', 1], ['small', 5]]);
  expect(doc.loadPage(6).toStructuredText().asText().trim()).toBe('7'); // numbers on the whole portfolio
  fs.writeFileSync(info.outputPath('portfolio.pdf'), pdf.bytes);

  const copy = await saved(page, () => page.getByRole('button', { name: 'Save .waraq' }).click());
  expect(copy.name).toMatch(/\.waraq$/);
  fs.writeFileSync(info.outputPath('course.waraq'), copy.bytes);

  // back to the start screen: the portfolio is in Recent and opens again as it was
  await page.getByRole('button', { name: 'Close' }).click();
  await page.locator('.recent .card', { hasText: 'Portfolio' }).first().click();
  await expect(page.locator('.sec')).toHaveCount(2);
  await expect(page.locator('.sec .title').first()).toHaveValue('Ø§Ù„Ø£Ø³Ø¨ÙˆØ¹ Ø§Ù„Ø£ÙˆÙ„');
  await expect(page.locator('.paper input')).toHaveValue('Ù…Ù‚Ø¯Ù…Ø© Ø§Ù„Ù…Ù‚Ø±Ø±');

  // and the portable copy opens from the start screen too
  await page.getByRole('button', { name: 'Close' }).click();
  await page.locator('input[type=file]').first().setInputFiles(info.outputPath('course.waraq'));
  await expect(page.locator('.cell')).toHaveCount(5);
});

test('recent files: an opened PDF is listed on the start screen with its page count', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').first().setInputFiles(fixture('three.pdf'));
  await expect(page.locator('.page').first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('.recent .card', { hasText: 'three.pdf' })).toContainText('3 pages');
  await page.getByRole('button', { name: 'Remove from list: three.pdf' }).click();
  await expect(page.locator('.recent .card', { hasText: 'three.pdf' })).toHaveCount(0);
});
