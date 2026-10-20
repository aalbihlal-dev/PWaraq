import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import { open, saved, fixture } from './helpers';

const small = fixture('small.pdf');
const annots = (bytes: Uint8Array) => m.Document.openDocument(bytes, 'application/pdf').loadPage(0).getAnnotations();

test('comment: a highlight on real text, a sticky note and a pen stroke are saved as standard annotations and show again after reopening', async ({ page }, info) => {
  await open(page, small);
  // where "Quarterly Report" is on the page (points)
  const q = [...m.Document.openDocument(fs.readFileSync(small), 'application/pdf').loadPage(0).search('Quarterly Report')[0][0]];
  await page.getByRole('button', { name: 'Comment', exact: true }).click();
  const layer = page.locator('.layer').first();
  await expect(layer).toBeVisible();
  const box = (await layer.boundingBox())!, k = box.width / 595, at = (x: number, y: number) => [box.x + x * k, box.y + y * k] as const;
  const mid = (q[1] + q[5]) / 2;

  await page.getByRole('button', { name: 'Highlight', exact: true }).click();
  await page.mouse.move(...at(q[0] + 1, mid)); await page.mouse.down();
  await page.mouse.move(...at((q[0] + q[2]) / 2, mid), { steps: 5 }); await page.mouse.move(...at(q[2] - 1, mid), { steps: 5 }); await page.mouse.up();
  await expect(page.locator('.layer polygon.hl')).toHaveCount(1);

  await page.getByRole('button', { name: 'Sticky note', exact: true }).click();
  await page.mouse.click(...at(400, 200));
  await page.getByLabel('Text of the comment').fill('عبدالله — راجع هذا');
  await page.getByLabel('Text of the comment').blur();

  await page.getByRole('button', { name: 'Pen', exact: true }).click();
  await page.mouse.move(...at(100, 400)); await page.mouse.down();
  for (const [x, y] of [[140, 430], [180, 400], [220, 440], [260, 405]]) await page.mouse.move(...at(x, y), { steps: 4 });
  await page.mouse.up();
  await expect(page.locator('.state')).toHaveText('3 comments');
  await page.screenshot({ path: info.outputPath('comment-en.png') });

  // one undo step per action: undo takes the pen stroke away, redo brings it back
  await page.getByRole('button', { name: 'Undo (Ctrl Z)' }).click();
  await expect(page.locator('.state')).toHaveText('2 comments');
  await page.getByRole('button', { name: 'Redo (Ctrl Y)' }).click();
  await expect(page.locator('.state')).toHaveText('3 comments');

  const file = await saved(page, () => page.getByRole('button', { name: 'Save' }).first().click());
  const list = annots(file.bytes);
  expect(list.map((a) => a.getType()).sort()).toEqual(['Highlight', 'Ink', 'Text']);
  expect(list.find((a) => a.getType() === 'Text')!.getContents()).toBe('عبدالله — راجع هذا');

  // reopen the saved file: the comments are listed again (and can be changed)
  const again = info.outputPath('saved.pdf');
  fs.writeFileSync(again, file.bytes);
  await open(page, again);
  await page.getByRole('button', { name: 'Comment', exact: true }).click();
  await expect(page.locator('.state')).toHaveText('3 comments');
  await expect(page.locator('.layer polygon.hl')).toHaveCount(1);
  const b2 = (await page.locator('.layer').first().boundingBox())!, at2 = (x: number, y: number) => [b2.x + x * (b2.width / 595), b2.y + y * (b2.width / 595)] as const;
  await page.mouse.click(...at2(100, 400)); // on the pen stroke
  await page.getByRole('button', { name: 'Delete comment' }).click();
  await expect(page.locator('.state')).toHaveText('2 comments');
  await page.screenshot({ path: info.outputPath('comment-reopened.png') });
  const second = await saved(page, () => page.getByRole('button', { name: 'Save' }).first().click());
  expect(annots(second.bytes).map((a) => a.getType()).sort()).toEqual(['Highlight', 'Text']);
});

test('comment: shapes, arrow and text box; move and recolour a shape; Arabic screen', async ({ page }, info) => {
  await open(page, small);
  await page.getByRole('button', { name: 'Comment', exact: true }).click();
  const layer = page.locator('.layer').first();
  const box = (await layer.boundingBox())!, k = box.width / 595, at = (x: number, y: number) => [box.x + x * k, box.y + y * k] as const;
  const drag = async (tool: string, a: number[], b: number[]) => {
    await page.getByRole('button', { name: tool, exact: true }).click();
    await page.mouse.move(...at(a[0], a[1])); await page.mouse.down(); await page.mouse.move(...at(b[0], b[1]), { steps: 6 }); await page.mouse.up();
  };
  await drag('Rectangle', [60, 300], [200, 380]);
  await drag('Ellipse', [250, 300], [400, 380]);
  await drag('Line', [60, 450], [200, 500]);
  await drag('Arrow', [250, 450], [400, 500]);
  await drag('Text box', [60, 560], [300, 620]);
  await expect(page.locator('.state')).toHaveText('5 comments');

  // select the rectangle, make it blue and move it
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.mouse.click(...at(60, 340));
  await page.getByRole('button', { name: 'Blue', exact: true }).click();
  await page.mouse.move(...at(60, 340)); await page.mouse.down(); await page.mouse.move(...at(90, 360), { steps: 5 }); await page.mouse.up();
  await page.screenshot({ path: info.outputPath('comment-shapes.png') });
  const file = await saved(page, () => page.getByRole('button', { name: 'Save' }).first().click());
  const list = annots(file.bytes), sq = list.find((a) => a.getType() === 'Square')!;
  expect(list.map((a) => a.getType()).sort()).toEqual(['Circle', 'FreeText', 'Line', 'Line', 'Square']);
  expect(sq.getColor().map((c) => Math.round(c * 255))).toEqual([0x2f, 0x6f, 0xd6]);
  expect(Math.round(sq.getRect()[0])).toBe(90);

  await page.getByRole('button', { name: 'عربي' }).click();
  await expect(page.getByRole('button', { name: 'تعليق', exact: true })).toBeVisible();
});
