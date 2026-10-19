import { test, expect } from '@playwright/test';
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import { listFields } from '../../src/lib/engine/forms';
import { open, saved, fixture } from './helpers';

const field = (page: import('@playwright/test').Page, id: string) => page.locator(`[id="f-${id}"]`);

test('forms: fill text (Arabic), tick a box, choose a radio and a list item; the saved file keeps the answers and stays fillable', async ({ page }) => {
  await open(page, fixture('form.pdf'));
  await page.getByRole('button', { name: 'Forms', exact: true }).click();
  await expect(page.locator('.forms .box')).toHaveCount(6);
  await expect(field(page, '0:1')).toBeDisabled(); // read only
  await field(page, '0:0').fill('عبدالله');
  await field(page, '0:2').check();
  await page.getByLabel('large').check();
  await field(page, '0:5').selectOption('Oman');
  await page.getByRole('button', { name: 'Apply the answers' }).click();
  await expect(page.getByText('Changed — not saved yet')).toBeVisible();
  const file = await saved(page, () => page.getByRole('button', { name: 'Save' }).first().click());
  const f = listFields(m, file.bytes);
  expect(f.find((x) => x.name === 'name')!.value).toBe('عبدالله');
  expect(f.find((x) => x.name === 'agree')!.checked).toBe(true);
  expect(f.filter((x) => x.type === 'radio').map((x) => x.checked)).toEqual([false, true]);
  expect(f.find((x) => x.name === 'country')!.value).toBe('Oman');
  expect(f.find((x) => x.name === 'city')!.value).toBe('Cairo');
});

test('forms: "make the answers fixed" leaves no fields and the text on the page', async ({ page }) => {
  await open(page, fixture('form.pdf'));
  await page.getByRole('button', { name: 'Forms', exact: true }).click();
  await field(page, '0:0').fill('Sami');
  await page.getByLabel('Make the answers fixed (no longer fillable)').check();
  await page.getByRole('button', { name: 'Apply the answers' }).click();
  await expect(page.getByText('Changed — not saved yet')).toBeVisible();
  const file = await saved(page, () => page.getByRole('button', { name: 'Save' }).first().click());
  expect(listFields(m, file.bytes)).toHaveLength(0);
  expect(m.Document.openDocument(file.bytes, 'application/pdf').loadPage(0).toStructuredText().asText()).toContain('Sami');
});
