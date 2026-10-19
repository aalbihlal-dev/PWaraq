import { expect, type Page, type Download } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

export const fixture = (f: string) => path.join(import.meta.dirname, '..', 'fixtures', f);
export async function open(page: Page, file: string) {
  await page.goto('/');
  await page.locator('input[type=file]').first().setInputFiles(file);
  await expect(page.locator('.page').first()).toBeVisible({ timeout: 30_000 }); // a fresh profile compiles the 11 MB engine first
}
/** Clicks `button` and gives the file the app saves (tests get a download instead of the Save window). */
export async function saved(page: Page, click: () => Promise<void>) {
  const [download] = await Promise.all([page.waitForEvent('download'), click()]);
  return { name: download.suggestedFilename(), bytes: new Uint8Array(fs.readFileSync((await (download as Download).path())!)) };
}
/** Clicks something that opens the file picker and chooses `files`. */
export async function choose(page: Page, click: () => Promise<void>, files: string[]) {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), click()]);
  await chooser.setFiles(files);
}
