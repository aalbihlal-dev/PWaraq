import { test, expect } from '@playwright/test';
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import { saved, choose, fixture } from './helpers';

const titles = (page: import('@playwright/test').Page) => page.locator('.sec .title').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));

test('portfolio: cover with a logo, a design, a turned divider, a lined page, closed and locked sections, numbers on the right', async ({ page }, info) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await page.getByRole('button', { name: 'New portfolio' }).click();
  await choose(page, () => page.getByRole('button', { name: 'Add a file as a section' }).first().click(), [fixture('three.pdf'), fixture('small.pdf')]);
  await expect(page.locator('.sec')).toHaveCount(2);

  // cover: title, two names, supervisor, a logo in the centre; the "Band" design
  await page.locator('.side .group').nth(1).locator('input[type=checkbox]').check();
  await page.getByLabel('Title', { exact: true }).fill('Design 101');
  await page.getByLabel('Name or names').fill('Abdullah\nSara');
  await page.getByLabel('Supervisor', { exact: true }).fill('Dr Ahmed');
  await choose(page, () => page.getByRole('button', { name: 'Centre', exact: true }).first().click(), [fixture('photo.png')]);
  await expect(page.locator('.mini img')).toHaveCount(1);
  await page.getByRole('radio', { name: 'Band' }).click();
  await page.getByLabel('Title and name on section pages').selectOption('small');

  // section 1: divider turned a quarter; a lined page after page 1
  await page.getByRole('button', { name: 'Divider page' }).first().click();
  await page.getByRole('button', { name: 'Turn right: Divider page' }).click();
  await page.locator('.cell').first().click();
  await expect(page.getByRole('button', { name: 'Edit page' })).toBeEnabled();
  await page.locator('.papers .tile', { hasText: 'Lined' }).click();
  await expect(page.locator('.cell .sheet.paper-lined')).toHaveCount(1);

  // section 2: closed (pages hidden), then locked (no page bar, Edit page disabled)
  await page.getByRole('button', { name: 'Hide pages (name only)' }).nth(1).click();
  await expect(page.locator('.cell')).toHaveCount(4); // three + lined page; small.pdf hidden
  await page.getByRole('button', { name: 'Show the pages' }).click();
  await page.getByRole('button', { name: 'Lock: pages cannot be changed' }).nth(1).click();
  await page.locator('.cell').last().click();
  await expect(page.getByRole('button', { name: 'Edit page' })).toBeDisabled();
  await page.keyboard.press('Delete');
  await expect(page.locator('.cell')).toHaveCount(5); // nothing deleted in a locked section

  await page.locator('.seg button', { hasText: 'Right' }).click();
  await page.locator('.colours .dot').nth(1).click(); // navy
  await page.locator('.cell').nth(1).hover();
  await page.screenshot({ path: info.outputPath('portfolio-cover.png') });
  await page.locator('.side .group').nth(2).scrollIntoViewIfNeeded();
  await page.locator('.grid').evaluate((g) => g.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath('portfolio-designs.png') });
  const pdf = await saved(page, () => page.getByRole('button', { name: 'Export PDF' }).click());
  const doc = m.Document.openDocument(pdf.bytes, 'application/pdf');
  // cover, contents, divider, 3 pages + lined page, small = 8
  expect(doc.countPages()).toBe(8);
  for (const i of [0, 2]) (await import('node:fs')).writeFileSync(info.outputPath(`exported-${i}.png`), doc.loadPage(i).toPixmap(m.Matrix.scale(1, 1), m.ColorSpace.DeviceRGB, false).asPNG());
  const cover = doc.loadPage(0).toStructuredText().asText();
  for (const s of ['Design 101', 'Abdullah', 'Sara', 'Supervisor: Dr Ahmed']) expect(cover).toContain(s);
  expect(JSON.parse(doc.loadPage(0).toStructuredText('preserve-images').asJSON()).blocks.filter((b: any) => b.type === 'image')).toHaveLength(1);
  expect(doc.asPDF()!.findPage(2).get('Rotate').asNumber()).toBe(90);
  expect(doc.loadPage(2).toStructuredText().asText()).toContain('Design 101');
  expect(doc.loadPage(0).toStructuredText().asText()).not.toMatch(/(^|\n)1\s*$/); // the cover has no number
  const numberOnLast = JSON.parse(doc.loadPage(7).toStructuredText().asJSON()).blocks.flatMap((b: any) => b.lines ?? []).find((l: any) => l.text.trim() === '8');
  expect(numberOnLast.bbox.x).toBeGreaterThan(450); // on the right
});

test('portfolio: drag a whole section above another; a photo over the whole cover', async ({ page }, info) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New portfolio' }).click();
  await choose(page, () => page.getByRole('button', { name: 'Add a file as a section' }).first().click(), [fixture('three.pdf'), fixture('small.pdf')]);
  await expect.poll(() => titles(page)).toEqual(['three', 'small']);
  await page.locator('.sec .grip').nth(1).dragTo(page.locator('.sec').first(), { targetPosition: { x: 300, y: 4 } });
  await expect.poll(() => titles(page)).toEqual(['small', 'three']);
  await page.keyboard.press('Control+z');
  await expect.poll(() => titles(page)).toEqual(['three', 'small']);

  await page.locator('.side .group').nth(1).locator('input[type=checkbox]').check();
  await choose(page, () => page.locator('.photo .add').click(), [fixture('photo.png')]);
  await page.getByRole('radio', { name: 'Whole page' }).click();
  await expect(page.locator('.mini.photo-full')).toBeVisible();
  await page.screenshot({ path: info.outputPath('cover-photo.png') });
  const pdf = await saved(page, () => page.getByRole('button', { name: 'Export PDF' }).click());
  const doc = m.Document.openDocument(pdf.bytes, 'application/pdf');
  expect(JSON.parse(doc.loadPage(0).toStructuredText('preserve-images').asJSON()).blocks.filter((b: any) => b.type === 'image')).toHaveLength(1);
  expect(doc.loadPage(0).toStructuredText().asText()).toContain('My course');
});
