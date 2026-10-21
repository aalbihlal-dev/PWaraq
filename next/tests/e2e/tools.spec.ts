import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import { assemble } from '../../src/lib/engine/assemble';
import { unzip } from '../../src/lib/zip';
import { open, saved, choose, fixture } from './helpers';

const pdf = (b: Uint8Array) => m.Document.openDocument(b, 'application/pdf');

test('organize: split every page into its own file (one ZIP), crop a page', async ({ page }) => {
  await open(page, fixture('three.pdf'));
  await page.getByRole('button', { name: 'Organize' }).click();
  await page.getByRole('button', { name: 'Split', exact: true }).click();
  await page.getByLabel('Each page its own file').check();
  const z = await saved(page, () => page.getByRole('button', { name: 'Split and save' }).click());
  const parts = unzip(z.bytes);
  expect(Object.keys(parts)).toHaveLength(3);
  expect(Object.values(parts).map((b) => pdf(b).countPages())).toEqual([1, 1, 1]);

  await page.locator('.cell').first().click();
  await page.getByRole('button', { name: 'Crop', exact: true }).click();
  for (const side of ['Left', 'Top', 'Right', 'Bottom']) await page.getByLabel(side, { exact: true }).fill('10');
  await page.getByRole('button', { name: /Crop selected pages/ }).click();
  await expect(page.locator('.cell .sheet').first()).toHaveAttribute('style', /clip-path/);
  await page.getByRole('button', { name: 'View' }).click();
  const file = await saved(page, () => page.getByRole('button', { name: 'Save' }).first().click());
  const b = pdf(file.bytes).loadPage(0).getBounds().map(Math.round);
  expect([b[2] - b[0], b[3] - b[1]]).toEqual([476, 674]); // 80 % of 595 x 842
});

test('edit → whole document: page numbers "n / N" at the top right and an Arabic watermark', async ({ page }) => {
  await open(page, fixture('three.pdf'));
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByRole('tab', { name: 'Whole document' }).click();
  await page.getByLabel('Where').selectOption('tr');
  await page.getByLabel('Show "of total" (3 / 10)').check();
  await page.getByLabel('Watermark', { exact: true }).check();
  await page.getByLabel('Watermark text').fill('مسودة');
  await page.getByRole('button', { name: 'Apply to all pages' }).click();
  await expect(page.locator('.page')).toHaveCount(3);
  const file = await saved(page, () => page.getByRole('button', { name: 'Save' }).first().click());
  const text = pdf(file.bytes).loadPage(2).toStructuredText().asText();
  expect(text).toContain('3 / 3');
  expect(text).toContain('مسودة');
});

test('convert: compress a file with a large photo, save pages as PNG images', async ({ page }, info) => {
  const pix = new m.Pixmap(m.ColorSpace.DeviceRGB, [0, 0, 2800, 2000], false);
  const px = pix.getPixels(); for (let i = 0; i < px.length; i++) px[i] = (i * 2654435761) >>> 24;
  const png = pix.asPNG(), three = fs.readFileSync(fixture('three.pdf'));
  const sources = new Map([[1, { doc: pdf(three), bytes: three }], [2, { doc: m.Document.openDocument(png, 'image/png'), bytes: png }]]);
  const big = assemble(m, (id) => sources.get(id)!, { items: [{ doc: 1, page: 0 }, { doc: 2, page: 0, fit: { w: 595, h: 842 } }] });
  const bigFile = info.outputPath('photo-report.pdf');
  fs.writeFileSync(bigFile, big);
  await open(page, bigFile);
  await page.getByRole('button', { name: 'Convert' }).click();
  const small = await saved(page, () => page.getByRole('button', { name: 'Save a smaller copy' }).click());
  expect(small.name).toBe('photo-report (smaller).pdf');
  expect(small.bytes.length).toBeLessThan(big.length / 2);
  expect(pdf(small.bytes).countPages()).toBe(2);
  const images = await saved(page, () => page.getByRole('button', { name: 'Save pages as PNG images' }).click());
  expect(Object.keys(unzip(images.bytes))).toEqual(['photo-report 001.png', 'photo-report 002.png']);
});

test('protect: a protected copy asks for its password when opened; unlock removes it', async ({ page }, info) => {
  await open(page, fixture('three.pdf'));
  await page.getByRole('button', { name: 'Protect' }).click();
  await page.getByLabel('Password (at least 4 characters)').fill('سر-1234');
  await page.getByLabel('Password again').fill('سر-1234');
  await page.getByLabel('Allow copying text').check(); // nothing withheld, so the password can be removed again
  const locked = await saved(page, () => page.getByRole('button', { name: 'Save a protected copy' }).click());
  expect(pdf(locked.bytes).needsPassword()).toBe(true);
  const lockedFile = info.outputPath('locked.pdf');
  fs.writeFileSync(lockedFile, locked.bytes);

  await page.getByRole('button', { name: 'Close' }).click();
  await page.locator('input[type=file]').first().setInputFiles(lockedFile);
  await page.locator('#pdfpw').fill('wrong');
  await page.locator('.lock').getByRole('button', { name: 'Open' }).click();
  await expect(page.getByRole('alert')).toHaveText('Wrong password.');
  await page.locator('#pdfpw').fill('سر-1234');
  await page.locator('.lock').getByRole('button', { name: 'Open' }).click();
  await expect(page.locator('.page')).toHaveCount(3);

  await page.getByRole('button', { name: 'Protect' }).click();
  await page.getByRole('button', { name: 'Remove the password' }).click();
  await expect(page.locator('.page').first()).toBeVisible();
  const free = await saved(page, () => page.getByRole('button', { name: 'Save' }).first().click());
  expect(pdf(free.bytes).needsPassword()).toBe(false);
});

test('protect: a file with limits keeps them in copies; without the owner password it cannot be unlocked', async ({ page }, info) => {
  await open(page, fixture('three.pdf'));
  await page.getByRole('button', { name: 'Protect' }).click();
  await page.getByLabel('Password (at least 4 characters)').fill('limit-1234');
  await page.getByLabel('Password again').fill('limit-1234'); // copying stays off
  const locked = await saved(page, () => page.getByRole('button', { name: 'Save a protected copy' }).click());
  const lockedFile = info.outputPath('limited.pdf');
  fs.writeFileSync(lockedFile, locked.bytes);
  await page.getByRole('button', { name: 'Close' }).click();
  await page.locator('input[type=file]').first().setInputFiles(lockedFile);
  await page.locator('#pdfpw').fill('limit-1234');
  await page.locator('.lock').getByRole('button', { name: 'Open' }).click();
  await expect(page.locator('.page')).toHaveCount(3);
  await page.getByRole('button', { name: 'Protect' }).click();
  await expect(page.getByRole('heading', { name: 'This file has limits' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove the password' })).toHaveCount(0);
  const copy = await saved(page, () => page.getByRole('button', { name: 'Save a copy with the same limits' }).click());
  const d = pdf(copy.bytes);
  expect(d.needsPassword()).toBe(true);
  expect(d.authenticatePassword('limit-1234')).toBeGreaterThan(0);
  expect(d.hasPermission('copy')).toBe(false);
});

test('office and cad: the web version says "desktop only"; with the desktop bridge a Word file converts and opens', async ({ page }, info) => {
  const docx = info.outputPath('report.docx');
  fs.writeFileSync(docx, 'not really word');
  await open(page, fixture('three.pdf'));
  await page.getByRole('button', { name: 'Convert' }).click();
  await expect(page.getByText('This works in the Waraq desktop app.')).toBeVisible();
  await expect(page.locator('label.btn.disabled input[type=file]')).toBeDisabled();

  await page.goto('/'); // opening a Word file from the start screen says the same
  await page.locator('input[type=file]').first().setInputFiles(docx);
  await expect(page.getByRole('alert')).toContainText('desktop app');

  // the desktop app (Tauri) provides window.waraqDesktop; here a stand-in returns a known PDF
  const three = [...fs.readFileSync(fixture('three.pdf'))];
  await page.addInitScript((b) => { (globalThis as any).waraqDesktop = { convertToPdf: async () => new Uint8Array(b) }; }, three);
  await page.goto('/');
  await page.locator('input[type=file]').first().setInputFiles(docx);
  await expect(page.locator('.page')).toHaveCount(3, { timeout: 30_000 });
  await page.getByRole('button', { name: 'Convert' }).click();
  const out = await saved(page, () => choose(page, () => page.getByText('Choose a file and save as PDF').click(), [docx]));
  expect(out.name).toBe('report.pdf');
  expect(pdf(out.bytes).countPages()).toBe(3);
});
