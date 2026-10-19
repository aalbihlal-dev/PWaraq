import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import { open, saved, choose, fixture } from './helpers';
import { pageObjects } from '../../src/lib/engine/editpage';

const ready = (page: Page) => expect(page.locator('.editor .sheet .hit').first()).toBeAttached({ timeout: 20_000 });
/** Screen pixels per point of the page in the editor. */
const scale = (page: Page) => page.locator('.editor .sheet').evaluate((el) => el.getBoundingClientRect().width / 595);
async function dragBy(page: Page, sel: string, dx: number, dy: number) {
  const b = (await page.locator(sel).boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + dx / 2, b.y + b.height / 2 + dy / 2, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy, { steps: 4 });
  await page.mouse.up();
}
const near = (a: { x: number; y: number; w: number; h: number }, b: typeof a, tol = 1.5) => (['x', 'y', 'w', 'h'] as const).every((k) => Math.abs(a[k] - b[k]) < tol);

test('portfolio: add Arabic text to a page, the page keeps its place, export has the real text', async ({ page }, info) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await page.getByRole('button', { name: 'New portfolio' }).click();
  await choose(page, () => page.getByRole('button', { name: 'Add a file as a section' }).first().click(), [fixture('three.pdf')]);
  await expect(page.locator('.cell')).toHaveCount(3);
  await page.locator('.cell').nth(1).dblclick();
  await ready(page);
  await expect(page.locator('.editor .where')).toHaveText('Page 3'); // contents 1, Page one 2, Page two 3

  await page.getByRole('button', { name: 'Add text' }).click();
  const sheet = (await page.locator('.editor .sheet').boundingBox())!, s = await scale(page);
  await page.mouse.click(sheet.x + 300 * s, sheet.y + 600 * s);
  await page.keyboard.type('ملاحظة الأسبوع الثاني');
  await page.getByRole('button', { name: 'Bold' }).click();
  await page.getByRole('radio', { name: 'Green' }).click();
  await page.screenshot({ path: info.outputPath('editor-portfolio.png') });
  await page.getByRole('button', { name: 'Save page' }).click();

  await expect(page.locator('.cell')).toHaveCount(3);
  await expect(page.locator('.cell').nth(1)).toHaveAttribute('data-src', /^\d+:0$/);
  await expect(page.locator('.cell .num')).toHaveText(['2', '3', '4']);
  const pdf = await saved(page, () => page.getByRole('button', { name: 'Export PDF' }).click());
  const doc = m.Document.openDocument(pdf.bytes, 'application/pdf');
  expect(doc.countPages()).toBe(4);
  const text = doc.loadPage(2).toStructuredText().asText();
  expect(text).toContain('ملاحظة الأسبوع الثاني');
  expect(text).toContain('Page two');
  expect(doc.loadPage(0).getLinks().map((l) => doc.resolveLink(l))).toEqual([1]); // contents still lead to the section
  fs.writeFileSync(info.outputPath('portfolio-edited.pdf'), pdf.bytes);

  // undo in the grid brings the original page back
  await page.keyboard.press('Control+z');
  await expect(page.locator('.cell').nth(1)).toHaveAttribute('data-src', /^\d+:1$/);
});

test('edit: move and resize one photo, replace another, save the document', async ({ page }) => {
  await open(page, fixture('edit.pdf'));
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await ready(page);
  const s = await scale(page);

  await page.getByRole('button', { name: 'Change photo 1' }).click();
  await dragBy(page, '.obj.pic.on', 100 * s, 300 * s);
  await dragBy(page, '.obj.pic.on .corner', -100 * s, 0);
  await page.getByRole('button', { name: 'Change photo 2' }).click();
  await choose(page, () => page.getByRole('button', { name: 'Replace photo' }).click(), [fixture('photo.png')]);
  await expect(page.locator('.obj.pic img')).toBeVisible();
  await page.getByRole('button', { name: 'Save page' }).click();

  await expect(page.getByText('Changed — not saved yet')).toBeVisible();
  const file = await saved(page, () => page.getByRole('button', { name: 'Save' }).first().click());
  const images = pageObjects(m.Document.openDocument(file.bytes, 'application/pdf').loadPage(0)).images;
  expect(images.length).toBe(2);
  expect(images.some((b) => near(b, { x: 172, y: 542, w: 100, h: 50 })), JSON.stringify(images)).toBe(true); // moved, then half the width
  expect(images.some((b) => near(b, { x: 350, y: 254.5, w: 100, h: 75 })), JSON.stringify(images)).toBe(true); // 4:3 photo in the square
});

test('edit: replace a line of text from Organize', async ({ page }) => {
  await open(page, fixture('edit.pdf'));
  await page.getByRole('button', { name: 'Organize' }).click();
  await page.locator('.cell').first().dblclick();
  await ready(page);
  await page.getByRole('button', { name: 'Change text: Old heading' }).click();
  const box = page.locator('.obj.text.on textarea');
  await expect(box).toHaveValue('Old heading');
  await box.fill('New heading — عنوان جديد');
  await expect(page.locator('aside')).toContainText('Tajawal');
  await page.getByRole('button', { name: 'Save page' }).click();
  await expect(page.locator('.cell')).toHaveCount(1);

  await page.getByRole('button', { name: 'View' }).click();
  await expect(page.getByText('Changed — not saved yet')).toBeVisible();
  const file = await saved(page, () => page.getByRole('button', { name: 'Save' }).first().click());
  const text = m.Document.openDocument(file.bytes, 'application/pdf').loadPage(0).toStructuredText().asText();
  expect(text).not.toContain('Old heading');
  expect(text).toContain('New heading');
  expect(text).toContain('عنوان جديد');
  expect(text).toContain('Keep this line');
});
