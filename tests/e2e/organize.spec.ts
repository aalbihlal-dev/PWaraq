import { test, expect } from '@playwright/test';
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import { open, saved, choose, fixture } from './helpers';

const order = (page: import('@playwright/test').Page) => page.locator('.cell').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.src));

test('organize: drag, turn, delete with undo, insert a photo, save, back to View', async ({ page }) => {
  await open(page, fixture('three.pdf'));
  await page.getByRole('button', { name: 'Organize' }).click();
  await expect(page.locator('.cell')).toHaveCount(3);
  await expect.poll(() => page.locator('.cell canvas').first().evaluate((c: HTMLCanvasElement) => c.width)).not.toBe(300); // drawn

  // drag page 3 in front of page 1
  await page.locator('.cell').nth(2).dragTo(page.locator('.cell').nth(0), { targetPosition: { x: 8, y: 60 } });
  await expect.poll(() => order(page)).toEqual(['0:2', '0:0', '0:1']);

  // turn the first page right, delete the second; undo brings it back
  await page.locator('.cell').nth(0).click();
  await page.getByRole('toolbar').getByRole('button', { name: 'Turn right' }).click();
  await expect(page.locator('.cell canvas').first()).toHaveAttribute('style', /rotate\(90deg\)/);
  await page.locator('.cell').nth(1).click();
  await page.keyboard.press('Delete');
  await expect(page.locator('.cell')).toHaveCount(2);
  await page.keyboard.press('Control+z');
  await expect(page.locator('.cell')).toHaveCount(3);

  // a photo after the last page (selection: none -> at the end)
  await page.keyboard.press('Escape');
  await choose(page, () => page.getByRole('button', { name: 'Insert file' }).click(), [fixture('photo.png')]);
  await expect(page.locator('.cell')).toHaveCount(4);

  // back to View: the changes are applied, the document is marked changed until saved
  await page.getByRole('button', { name: 'View' }).click();
  await expect(page.locator('.page')).toHaveCount(4);
  await expect(page.getByText('Changed — not saved yet')).toBeVisible();

  const file = await saved(page, () => page.getByRole('button', { name: 'Save' }).first().click());
  await expect(page.getByText('Changed — not saved yet')).toBeHidden();
  const doc = m.Document.openDocument(file.bytes, 'application/pdf');
  expect(doc.countPages()).toBe(4);
  expect(doc.loadPage(0).toStructuredText().asText()).toContain('Page three');
  expect(doc.asPDF()!.findPage(0).get('Rotate').asNumber()).toBe(90);
  expect(doc.loadPage(3).getBounds().map(Math.round)).toEqual([0, 0, 595, 842]); // photo page sized like its neighbour

});

test('organize: extract the selected pages into a new file', async ({ page }) => {
  await open(page, fixture('three.pdf'));
  await page.getByRole('button', { name: 'Organize' }).click();
  await page.locator('.cell').nth(1).click();
  await page.locator('.cell').nth(2).click({ modifiers: ['Shift'] });
  const file = await saved(page, () => page.getByRole('button', { name: 'Extract' }).click());
  expect(file.name).toBe('three (Pages 2-3).pdf');
  expect(m.Document.openDocument(file.bytes, 'application/pdf').countPages()).toBe(2);
});
