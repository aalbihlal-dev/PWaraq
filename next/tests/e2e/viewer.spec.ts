import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const small = path.join(import.meta.dirname, '..', 'fixtures', 'small.pdf');
// The owner's A0 CAD drawing (not in the repository): the heavy-page tests run only where it exists.
const cad = path.join(import.meta.dirname, '..', '..', 'public', '_test', 'mv-trenches.pdf');

async function open(page: Page, file: string) {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(file);
  await expect(page.locator('.page').first()).toBeVisible({ timeout: 30_000 }); // a fresh profile compiles the 11 MB engine first
}
const drawnWidth = (page: Page, n = 0) => page.locator('.page canvas:not(.tile)').nth(n).evaluate((c: HTMLCanvasElement) => c.width);

test('start screen: open button, Arabic switches the whole page to right-to-left', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Open a PDF' })).toBeVisible();
  await page.getByRole('button', { name: 'عربي' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('button', { name: 'افتح ملف PDF' })).toBeVisible();
});

test('open a PDF: the page and its thumbnail are drawn, the file name shows', async ({ page }) => {
  await open(page, small);
  await expect.poll(() => drawnWidth(page)).not.toBe(300); // 300 = an undrawn canvas
  await expect.poll(() => page.locator('.thumb canvas').first().evaluate((c: HTMLCanvasElement) => c.width)).not.toBe(300);
  await expect(page.locator('.name')).toHaveText('small.pdf');
});

test('zoom: Ctrl + makes the page larger, Ctrl 0 fits the whole page', async ({ page }) => {
  await open(page, small);
  const width = () => page.locator('.page').first().evaluate((el) => el.getBoundingClientRect().width);
  const before = await width();
  await page.keyboard.press('Control+Equal');
  await expect.poll(width).toBeGreaterThan(before * 1.2);
  await page.keyboard.press('Control+0');
  await expect.poll(async () => (await page.locator('.page').first().boundingBox())!.height).toBeLessThan(700);
});

test('find: Ctrl+F finds a word, highlights it and counts matches', async ({ page }) => {
  await open(page, small);
  await page.keyboard.press('Control+f');
  await page.getByRole('searchbox').fill('Report');
  await expect(page.locator('.find .num')).toHaveText('1 / 1');
  await expect(page.locator('.marks i')).toHaveCount(1);
  await expect(page.locator('.bar')).toBeInViewport(); // jumping to a match must not hide the top bar
});

test('text can be selected: the text layer holds the page text', async ({ page }) => {
  await open(page, small);
  await expect(page.locator('.text span', { hasText: 'Quarterly Report' })).toHaveCount(1);
});

test('close returns to the start screen', async ({ page }) => {
  await open(page, small);
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('button', { name: 'Open a PDF' })).toBeVisible();
});

test('heavy CAD drawing: first page drawn with solid lines, zoom tile sharpens', async ({ page }) => {
  test.skip(!fs.existsSync(cad), 'owner drawing not on this machine');
  test.setTimeout(120_000);
  await open(page, cad);
  await expect.poll(() => drawnWidth(page), { timeout: 60_000 }).not.toBe(300);
  const box = (await page.locator('.scroller').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.4);
  await page.keyboard.down('Control');
  for (let i = 0; i < 14; i++) await page.mouse.wheel(0, -120);
  await page.keyboard.up('Control');
  await expect(page.locator('canvas.tile:not([hidden])').first()).toBeAttached({ timeout: 30_000 });
});
