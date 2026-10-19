import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import { open, choose, fixture } from './helpers';
import { pageObjects } from '../../src/lib/engine/editpage';

async function drawSignature(page: Page) {
  const b = (await page.locator('.pad').boundingBox())!;
  await page.mouse.move(b.x + 20, b.y + 60); await page.mouse.down();
  for (let i = 1; i <= 20; i++) await page.mouse.move(b.x + 20 + i * 10, b.y + 50 + 25 * Math.sin(i / 2));
  await page.mouse.up();
}

test('sign two files with the same signature set and date, then save both', async ({ page }, info) => {
  test.setTimeout(90_000);
  await open(page, fixture('sign-en.pdf'));
  await page.getByRole('button', { name: 'Sign', exact: true }).click();
  await expect(page.locator('.need')).toHaveText(['Signature needed on page 1Go', 'Signature needed on page 2Go']);
  await expect(page.locator('.spot:not(.date)')).toHaveCount(1); // page 1: "Signature: ____"

  // a signature drawn and kept on this device, then the second file and a name
  await drawSignature(page);
  await page.getByRole('radio', { name: 'Blue' }).click();
  await page.getByRole('button', { name: 'Save signature' }).click();
  await expect(page.locator('.sigbtn img')).toHaveCount(1);
  await page.getByLabel('Name under the signature (optional)').fill('Abdullah');
  await choose(page, () => page.getByRole('button', { name: 'Add files' }).click(), [fixture('sign-ar.pdf')]);
  await expect(page.locator('.file')).toHaveCount(2);
  const date = (await page.locator('.datetext').textContent())!.trim();

  // Enter: page 1, page 2 (the signature field), then the Arabic file's page 2
  await page.locator('.where').click();
  await page.keyboard.press('Enter');
  await expect(page.locator('.need')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(page.locator('.where')).toContainText('sign-ar.pdf', { timeout: 20_000 });
  await expect(page.locator('.need')).toHaveText(['Signature needed on page 2Go']);
  await page.screenshot({ path: info.outputPath('sign-before-arabic.png') });
  await page.keyboard.press('Enter');
  await expect(page.locator('.need')).toHaveCount(0);
  await expect(page.locator('img.set')).toHaveCount(1);

  const files: Record<string, Uint8Array> = {};
  page.on('download', async (d) => { files[d.suggestedFilename()] = new Uint8Array(fs.readFileSync((await d.path())!)); });
  await page.getByRole('button', { name: 'Save all signed' }).click();
  await expect.poll(() => Object.keys(files).sort()).toEqual(['sign-ar-signed.pdf', 'sign-en-signed.pdf']);
  await expect(page.getByText('Changed — not saved yet')).toBeVisible(); // the open document is the signed one now

  const en = m.Document.openDocument(files['sign-en-signed.pdf'], 'application/pdf'), ar = m.Document.openDocument(files['sign-ar-signed.pdf'], 'application/pdf');
  for (const [doc, n] of [[en, 0], [en, 1], [ar, 1]] as const) {
    const pg = doc.loadPage(n), text = pg.toStructuredText().asText();
    expect(text, `page ${n + 1}`).toContain(date);
    expect(text).toContain('Abdullah');
    expect(pageObjects(pg).images.length).toBe(1);
  }
  expect(en.loadPage(0).toStructuredText().asText()).toContain('Signature: ____');
  // the same spacing in both files: name sits the same distance under the signature
  const gap = (doc: m.Document, n: number) => { const o = pageObjects(doc.loadPage(n)), name = o.lines.find((l) => l.text === 'Abdullah')!; return name.y - (o.images[0].y + o.images[0].h); };
  expect(Math.abs(gap(en, 0) - gap(ar, 1))).toBeLessThan(1);
});
