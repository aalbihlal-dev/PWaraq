import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { open, choose, fixture } from './helpers';

// lintapple rules (tools/ui-audit.js): type scale, contrast, 36 px controls, 8 px gaps, sentence case, no sideways scroll
const audit = fs.readFileSync(path.join(import.meta.dirname, '..', '..', 'tools', 'ui-audit.js'), 'utf8');
const COMBOS = ['light', 'dim', 'dark', 'graphite'].flatMap((th) => ['en', 'ar'].map((l) => [l, th] as const)); // every theme, English and Arabic
async function clean(page: Page, where: string) {
  const r = await page.evaluate(audit) as { total: number; sample: unknown[] };
  expect(r.sample, where).toEqual([]);
}

for (const [lang, theme] of COMBOS) test(`design rules hold on every screen (${lang}, ${theme})`, async ({ page }, info) => {
  test.setTimeout(90_000);
  await page.addInitScript(([l, th]) => { localStorage.setItem('waraq-lang', l); localStorage.setItem('waraq-theme', th); }, [lang, theme]);
  await page.goto('/');
  await clean(page, 'start');
  await page.screenshot({ path: info.outputPath(`start-${lang}-${theme}.png`) });

  await open(page, fixture('three.pdf'));
  await clean(page, 'view');
  await page.screenshot({ path: info.outputPath(`view-${lang}-${theme}.png`) });
  await page.locator('.task').nth(1).click(); // Organize
  await expect(page.locator('.cell')).toHaveCount(3);
  await page.locator('.cell').first().click();
  await clean(page, 'organize');
  await page.screenshot({ path: info.outputPath(`organize-${lang}-${theme}.png`) });
  await page.locator('.org .tools .btn').nth(4).click(); // Crop panel
  await clean(page, 'crop');
  await page.screenshot({ path: info.outputPath(`crop-${lang}-${theme}.png`) });
  await page.locator('.org .tools .btn').nth(3).click(); // Split panel
  await clean(page, 'split');
  for (const [i, what] of [[2, 'edit'], [3, 'convert'], [5, 'protect'], [6, 'redact'], [7, 'forms'], [8, 'ocr']] as const) {
    await page.locator('.task').nth(i).click();
    if (what === 'edit') await page.locator('.scope button').nth(1).click(); // whole document
    await expect(page.locator('.side h2').first()).toBeVisible();
    await clean(page, what);
    await page.screenshot({ path: info.outputPath(`${what}-${lang}-${theme}.png`) });
  }
  await page.locator('.task').nth(1).click(); // back to Organize for the page editor
  await expect(page.locator('.cell')).toHaveCount(3);

  await page.locator('.cell').first().dblclick(); // the page editor
  await expect(page.locator('.editor .sheet .hit').first()).toBeAttached({ timeout: 20_000 });
  await clean(page, 'editor');
  await page.locator('.editor .hit.line').nth(1).click(); // a line of text: the text options
  await expect(page.locator('.editor .swatch').first()).toBeVisible();
  await clean(page, 'editor text options');
  await page.screenshot({ path: info.outputPath(`editor-${lang}-${theme}.png`) });
  await page.locator('.editor .tools .btn').nth(7).click(); // Cancel
  await expect(page.locator('.cell')).toHaveCount(3);

  await page.locator('.task').nth(4).click(); // Sign: a form with places to sign, the signature maker open
  await choose(page, () => page.locator('.side section .btn').first().click(), [fixture('sign-ar.pdf')]); // Add files
  await page.locator('.file').nth(1).click();
  await expect(page.locator('.need')).toHaveCount(1, { timeout: 20_000 });
  await page.locator('.need .btn').click();
  await expect(page.locator('.spot').first()).toBeVisible();
  await clean(page, 'signing');
  await page.screenshot({ path: info.outputPath(`sign-${lang}-${theme}.png`) });
  await page.locator('.task').nth(0).click(); // back to View

  await page.locator('.end .btn').filter({ has: page.locator('svg') }).nth(2).click(); // Close
  await page.locator('.actions .btn').nth(1).click(); // New portfolio
  await clean(page, 'empty portfolio');
  await choose(page, () => page.locator('.empty').click(), [fixture('three.pdf'), fixture('small.pdf')]);
  await expect(page.locator('.sec')).toHaveCount(2);
  await page.locator('.sec').first().locator('.btn').nth(1).click(); // divider (after the close button)
  await clean(page, 'portfolio');
  await page.screenshot({ path: info.outputPath(`portfolio-${lang}-${theme}.png`) });
});

// the screens that need a file of their own: a form with fields
for (const [lang, theme] of COMBOS) test(`design rules hold on the form screen with fields (${lang}, ${theme})`, async ({ page }, info) => {
  await page.addInitScript(([l, th]) => { localStorage.setItem('waraq-lang', l); localStorage.setItem('waraq-theme', th); }, [lang, theme]);
  await open(page, fixture('form.pdf'));
  await page.locator('.task').nth(7).click(); // Forms
  await expect(page.locator('.forms .box')).toHaveCount(6);
  await clean(page, 'forms');
  await page.screenshot({ path: info.outputPath(`forms-${lang}-${theme}.png`) });
});

// Comment: the tool panel, with a sticky note selected (its text field and delete button showing)
for (const [lang, theme] of COMBOS) test(`design rules hold on the Comment screen (${lang}, ${theme})`, async ({ page }, info) => {
  await page.addInitScript(([l, th]) => { localStorage.setItem('waraq-lang', l); localStorage.setItem('waraq-theme', th); }, [lang, theme]);
  await open(page, fixture('small.pdf'));
  await page.locator('.task').nth(9).click(); // Comment
  await expect(page.locator('.comment .layer').first()).toBeVisible();
  await clean(page, 'comment');
  await page.locator('.comment .tool').nth(10).click(); // sticky note
  const box = (await page.locator('.layer').first().boundingBox())!;
  await page.mouse.click(box.x + 200, box.y + 200);
  await expect(page.locator('.comment textarea')).toBeVisible();
  await clean(page, 'comment with a note selected');
  await page.screenshot({ path: info.outputPath(`comment-${lang}-${theme}.png`) });
});
