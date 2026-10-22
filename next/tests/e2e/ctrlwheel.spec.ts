// Ctrl + mouse wheel over the document zooms the document (View, Edit) or the page cards (Organize), and the browser's own
// page zoom is cancelled there (the event's default is prevented: a passive listener could not). Over the toolbar it is left alone.
import { test, expect, type Page, type Locator } from '@playwright/test';
import path from 'node:path';

const small = path.join(import.meta.dirname, '..', 'fixtures', 'small.pdf');

async function open(page: Page) {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(small);
  await expect(page.locator('.page').first()).toBeVisible({ timeout: 30_000 });
}
// a real Ctrl + wheel at the middle of `el`; returns whether the page cancelled the browser's zoom
const ctrlWheel = (el: Locator, up = true) => el.evaluate((n, up) => {
  const r = n.getBoundingClientRect(), e = new WheelEvent('wheel', { deltaY: up ? -120 : 120, ctrlKey: true, bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 });
  n.dispatchEvent(e);
  return e.defaultPrevented;
}, up);

test('View: Ctrl + wheel over the document zooms it, not the web page; over the toolbar the browser keeps it', async ({ page }) => {
  await open(page);
  const width = () => page.locator('.page').first().evaluate((p) => p.getBoundingClientRect().width);
  const before = await width();
  expect(await ctrlWheel(page.locator('.scroller'))).toBe(true);
  await expect.poll(width).toBeGreaterThan(before * 1.1);
  expect(await ctrlWheel(page.locator('.scroller'), false)).toBe(true);
  expect(await ctrlWheel(page.locator('nav.tasks:not(.phone)'))).toBe(false);
});

test('Edit: Ctrl + wheel steps the page zoom up and back to fit', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Edit' }).first().click();
  const stage = page.locator('.editor .stage'), zoom = page.locator('.zoomer select');
  await expect(page.locator('.editor .sheet')).toBeVisible({ timeout: 30_000 });
  expect(await ctrlWheel(stage)).toBe(true);
  await expect(zoom).not.toHaveValue('0');
  for (let i = 0; i < 8; i++) { await ctrlWheel(stage, false); await page.waitForTimeout(150); }
  await expect(zoom).toHaveValue('0');
});

test('Organize: Ctrl + wheel makes the page cards bigger', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Organize' }).click();
  const card = page.locator('.cell').first();
  await expect(card).toBeVisible();
  const before = (await card.boundingBox())!.width;
  for (let i = 0; i < 3; i++) expect(await ctrlWheel(page.locator('.grid'))).toBe(true);
  await expect.poll(async () => (await card.boundingBox())!.width).toBeGreaterThan(before * 1.2);
});
