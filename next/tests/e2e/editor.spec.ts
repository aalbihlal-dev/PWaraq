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

test('edit: a replaced Arabic line keeps the PDF’s own font; missing letters are named in the panel', async ({ page }, info) => {
  test.setTimeout(90_000);
  const { arabicDoc, SUB } = await import('../arabic-pdf.mjs');
  const file = info.outputPath('arabic-subset.pdf');
  fs.writeFileSync(file, arabicDoc().saveToBuffer('garbage=compact').asUint8Array());
  await open(page, file);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await ready(page);
  await page.getByRole('button', { name: 'Change text: السلام عليكم' }).click();
  const box = page.locator('.obj.text.on textarea'), note = page.getByTestId('font-note');
  await box.fill('عليكم السلام');
  await expect(note).toContainText('own font: NotoNaskhArabic');
  await box.fill('جديد عليكم');
  await expect(note).toContainText('lacks these letters: ج د');
  await expect(note).toContainText('Noto Naskh Arabic');
  await page.screenshot({ path: info.outputPath('editor-own-font-missing.png') });
  await box.fill('عَليكم السلام');
  await expect(note).toContainText('own font');
  await page.screenshot({ path: info.outputPath('editor-own-font.png') });
  await page.getByRole('button', { name: 'Save page' }).click();
  await expect(page.getByText('Changed — not saved yet')).toBeVisible();
  const out = await saved(page, () => page.getByRole('button', { name: 'Save' }).first().click());
  const p = m.Document.openDocument(out.bytes, 'application/pdf').loadPage(0);
  expect(p.toStructuredText().asText()).toContain('عَليكم السلام');
  let size = 0;
  p.toStructuredText().walk({ onChar(c, _o, f) { if (c === 'س') size = f.getBuffer()!.asUint8Array().length; } });
  expect(size).toBe(SUB.length); // the PDF's own subset font
});

test('edit: redact an area in the page editor — the heading under it is gone from the saved file, the rest stays', async ({ page }) => {
  await open(page, fixture('edit.pdf'));
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await ready(page);
  const s = await scale(page), b = (await page.locator('.editor .sheet').boundingBox())!;
  await page.getByRole('button', { name: 'Redact', exact: true }).last().click();
  // "Old heading" (24 pt) sits at about x 72..220, y 64..90 on the page from the top
  await page.mouse.move(b.x + 66 * s, b.y + 60 * s); await page.mouse.down();
  await page.mouse.move(b.x + 240 * s, b.y + 95 * s, { steps: 5 }); await page.mouse.up();
  await expect(page.locator('.obj.redact')).toHaveCount(1);
  await page.getByRole('button', { name: 'Save page' }).click();
  await expect(page.getByText('Changed — not saved yet')).toBeVisible();
  const file = await saved(page, () => page.getByRole('button', { name: 'Save' }).first().click());
  const text = m.Document.openDocument(file.bytes, 'application/pdf').loadPage(0).toStructuredText().asText();
  expect(text).not.toContain('Old heading');
  expect(text).toContain('Keep this line');
});

test('edit: a white cover box (drawings, scans) — what is under it is gone, it saves white, and the next box is white too', async ({ page }) => {
  await open(page, fixture('edit.pdf'));
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await ready(page);
  const s = await scale(page), b = (await page.locator('.editor .sheet').boundingBox())!;
  await page.getByRole('button', { name: 'Redact', exact: true }).last().click();
  await page.mouse.move(b.x + 66 * s, b.y + 60 * s); await page.mouse.down();
  await page.mouse.move(b.x + 240 * s, b.y + 95 * s, { steps: 5 }); await page.mouse.up();
  await page.getByRole('button', { name: 'White', exact: true }).click();
  await expect(page.getByRole('button', { name: 'White', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Redact', exact: true }).last().click(); // a second box remembers White
  await page.mouse.move(b.x + 300 * s, b.y + 400 * s); await page.mouse.down();
  await page.mouse.move(b.x + 340 * s, b.y + 420 * s, { steps: 3 }); await page.mouse.up();
  await expect(page.getByRole('button', { name: 'White', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Save page' }).click();
  await expect(page.getByText('Changed — not saved yet')).toBeVisible();
  const file = await saved(page, () => page.getByRole('button', { name: 'Save' }).first().click());
  const p = m.Document.openDocument(file.bytes, 'application/pdf').loadPage(0), text = p.toStructuredText().asText();
  expect(text).not.toContain('Old heading');
  expect(text).toContain('Keep this line');
  const pm = p.toPixmap(m.Matrix.identity, m.ColorSpace.DeviceGray, false);
  expect(pm.getPixels()[75 * pm.getWidth() + 100]).toBeGreaterThan(240); // inside the first box: white, not black
});

test('page editor: zoom to 200 % and back to fit; the page stays whole and scrollable, text can still be placed', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await page.getByRole('button', { name: 'New portfolio' }).click();
  await choose(page, () => page.getByRole('button', { name: 'Add a file as a section' }).first().click(), [fixture('three.pdf')]);
  await page.locator('.cell').nth(1).dblclick();
  await ready(page);
  const fit = await scale(page), zoom = page.getByRole('combobox', { name: 'Zoom' });
  await zoom.selectOption({ label: '200%' });
  await expect.poll(() => scale(page)).toBeCloseTo(2, 1);
  const stage = page.locator('.editor .stage');
  expect(await stage.evaluate((el) => el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight)).toBe(true); // the page is bigger than the window: it scrolls
  await stage.evaluate((el) => { el.scrollTo(0, 0); });
  expect((await page.locator('.editor .sheet').boundingBox())!.x).toBeGreaterThanOrEqual(0); // not cut off at the start
  await page.getByRole('button', { name: 'Add text' }).click();
  const sheet = (await page.locator('.editor .sheet').boundingBox())!;
  await page.mouse.click(sheet.x + 100, sheet.y + 100);
  await page.keyboard.type('تكبير');
  await expect(page.locator('.editor textarea').first()).toHaveValue('تكبير');
  await zoom.selectOption({ label: 'Fit page' });
  await expect.poll(() => scale(page)).toBeCloseTo(fit, 1);
});
