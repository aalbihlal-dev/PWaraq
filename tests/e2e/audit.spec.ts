import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { open, choose, fixture } from './helpers';

// lintapple rules (tools/ui-audit.js): type scale, contrast, 36 px controls, 8 px gaps, sentence case, no sideways scroll
const audit = fs.readFileSync(path.join(import.meta.dirname, '..', '..', 'tools', 'ui-audit.js'), 'utf8');
async function clean(page: Page, where: string) {
  const r = await page.evaluate(audit) as { total: number; sample: unknown[] };
  expect(r.sample, where).toEqual([]);
}

for (const lang of ['en', 'ar']) test(`design rules hold on every screen (${lang})`, async ({ page }, info) => {
  test.setTimeout(90_000);
  await page.addInitScript((l) => localStorage.setItem('waraq-lang', l), lang);
  await page.goto('/');
  await clean(page, 'start');
  await page.screenshot({ path: info.outputPath(`start-${lang}.png`) });

  await open(page, fixture('three.pdf'));
  await clean(page, 'view');
  await page.screenshot({ path: info.outputPath(`view-${lang}.png`) });
  await page.locator('.task').nth(1).click(); // Organize
  await expect(page.locator('.cell')).toHaveCount(3);
  await page.locator('.cell').first().click();
  await clean(page, 'organize');
  await page.screenshot({ path: info.outputPath(`organize-${lang}.png`) });

  await page.locator('.cell').first().dblclick(); // the page editor
  await expect(page.locator('.editor .sheet .hit').first()).toBeAttached({ timeout: 20_000 });
  await clean(page, 'editor');
  await page.locator('.editor .hit.line').nth(1).click(); // a line of text: the text options
  await expect(page.locator('.editor .swatch').first()).toBeVisible();
  await clean(page, 'editor text options');
  await page.screenshot({ path: info.outputPath(`editor-${lang}.png`) });
  await page.locator('.editor .tools .btn').nth(6).click(); // Cancel
  await expect(page.locator('.cell')).toHaveCount(3);

  await page.locator('.end .btn').filter({ has: page.locator('svg') }).nth(2).click(); // Close
  await page.locator('.actions .btn').nth(1).click(); // New portfolio
  await clean(page, 'empty portfolio');
  await choose(page, () => page.locator('.empty').click(), [fixture('three.pdf'), fixture('small.pdf')]);
  await expect(page.locator('.sec')).toHaveCount(2);
  await page.locator('.sec').first().locator('.btn').first().click(); // divider
  await clean(page, 'portfolio');
  await page.screenshot({ path: info.outputPath(`portfolio-${lang}.png`) });
});
