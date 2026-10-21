// The Arabic editing audit through the real page editor (Edit task → click a line → type → Save page → Save): what the
// user sees in the text box, the font note in the options panel, how long saving takes, and the saved file — for a
// subset of the corpus (every producer once, EN and AR). Screenshots and ui.json go to tests/audit-arabic/out/ui/.
//   npx playwright test -c tests/audit-arabic/playwright.config.ts
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import { pageObjects } from '../../src/lib/engine/editpage';
import { replacement } from '../fixtures/arabic/texts.mjs';

const FIX = path.join(import.meta.dirname, '..', 'fixtures', 'arabic'), OUT = path.join(import.meta.dirname, 'out', 'ui');
const FILES = ['edge-arial.pdf', 'edge-traditional-arabic.pdf', 'edge-cairo.pdf', 'word-arial.pdf', 'word-sakkal-majalla.pdf', 'libreoffice-traditional-arabic-oneline.pdf',
  'waraq-notonaskh-subset.pdf', 'waraq-notonaskh-no-tounicode.pdf', 'cadlike-visual-presentation-forms.pdf', 'mupdf-story-noto-naskh-arabic-subset.pdf', 'real/real-moj-dinnext-type0.pdf'];
const ready = (page: Page) => expect(page.locator('.editor .sheet .hit').first()).toBeAttached({ timeout: 60_000 });
const norm = (s: string) => s.normalize('NFKC').replace(/\s+/g, ' ').trim();

for (const lang of ['en', 'ar'] as const) test(`page editor, ${lang}: lift, type, save for every producer`, async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  const log: any[] = [];
  await page.addInitScript((l) => localStorage.setItem('waraq-lang', l), lang);
  for (const f of FILES) {
    const file = path.join(FIX, f), id = path.basename(f, '.pdf');
    if (!fs.existsSync(file)) continue;
    const objs = pageObjects(new m.PDFDocument(new Uint8Array(fs.readFileSync(file))).loadPage(0));
    const rec: any = { file: f, lang, lines: objs.lines.length, edits: [] };
    await page.goto('/');
    await page.locator('input[type=file]').first().setInputFiles(file);
    await expect(page.locator('.page').first()).toBeVisible({ timeout: 60_000 });
    await page.locator('.task').nth(2).click(); // Edit
    await ready(page);
    const hits = page.locator('.editor .hit.line');
    rec.hits = await hits.count();
    await page.screenshot({ path: path.join(OUT, `${id}-${lang}-0-editor.png`) });
    // two lines: the first Arabic line of the page and a longer one further down
    const picks = [objs.lines.findIndex((l) => l.rtl), objs.lines.findIndex((l, i) => l.rtl && i > 3 && l.text.length > 30)].filter((i) => i >= 0);
    for (const [k, i] of [...new Set(picks)].entries()) {
      const l = objs.lines[i], e: any = { line: i, shown: l.text, size: l.size, font: l.font };
      await hits.nth(i).click({ force: true });
      const box = page.locator('.obj.text.on textarea');
      await expect(box).toBeVisible();
      e.boxValue = await box.inputValue();
      e.boxMatchesShown = norm(e.boxValue) === norm(l.text);
      await page.screenshot({ path: path.join(OUT, `${id}-${lang}-${k + 1}a-lifted.png`) });
      const text = replacement(e.boxValue, k === 0 ? 'oneword' : 'mixed');
      e.typed = text;
      await box.fill(text);
      const note = page.getByTestId('font-note');
      await expect(note).toBeVisible({ timeout: 10_000 }).catch(() => {});
      await page.waitForTimeout(600);
      e.note = (await note.textContent().catch(() => null))?.trim() ?? null;
      e.noteClass = (await note.getAttribute('class').catch(() => null)) ?? null;
      // the box on screen vs the line: where the typed text sits and in which font family
      e.boxStyle = await box.evaluate((el) => { const cs = getComputedStyle(el), r = el.getBoundingClientRect(); return { font: cs.fontFamily, size: cs.fontSize, dir: cs.direction, align: cs.textAlign, x: r.x, y: r.y, w: r.width, h: r.height }; });
      await page.screenshot({ path: path.join(OUT, `${id}-${lang}-${k + 1}b-typed.png`) });
      const t0 = Date.now();
      await page.locator('.editor .tools .btn.primary').click();
      await expect(page.locator('.editor')).toBeHidden({ timeout: 120_000 });
      e.saveMs = Date.now() - t0;
      await page.screenshot({ path: path.join(OUT, `${id}-${lang}-${k + 1}c-saved.png`) });
      rec.edits.push(e);
      if (k < picks.length - 1) { await page.locator('.task').nth(2).click(); await ready(page); }
    }
    // the saved document
    try {
      const [download] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), page.locator('.end .btn').first().click()]);
      const bytes = new Uint8Array(fs.readFileSync((await download.path())!));
      fs.writeFileSync(path.join(OUT, `${id}-${lang}-saved.pdf`), bytes);
      const p = m.Document.openDocument(bytes, 'application/pdf').loadPage(0), text = p.toStructuredText('preserve-whitespace').asText();
      rec.savedHas = rec.edits.map((e: any) => norm(text).includes(norm(e.typed)));
      fs.writeFileSync(path.join(OUT, `${id}-${lang}-saved.png`), p.toPixmap(m.Matrix.scale(1.5, 1.5), m.ColorSpace.DeviceRGB, false).asPNG());
    } catch (err) { rec.saveError = String((err as Error).message).slice(0, 200); }
    log.push(rec);
    fs.writeFileSync(path.join(OUT, `ui-${lang}.json`), JSON.stringify(log, null, 1));
    await page.locator('.end .btn').nth(2).click().catch(() => {}); // close
  }
});
