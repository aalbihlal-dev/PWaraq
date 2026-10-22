import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fixture } from './helpers';

// Long names stay readable: the top bar keeps the end of a file name and still fits, a long section title is shown whole in a field
// that grows, lists clamp to two lines. English and Arabic (right to left), all four themes.
const audit = fs.readFileSync(path.join(import.meta.dirname, '..', '..', 'tools', 'ui-audit.js'), 'utf8');
const COMBOS = ['light', 'dim', 'dark', 'graphite'].flatMap((th) => ['en', 'ar'].map((l) => [l, th] as const));
const EN120 = ('Introduction-to-the-principles-of-structural-analysis-and-design-of-reinforced-concrete-buildings-with-worked-examples-final-v2-REVIEWED').slice(0, 116) + '.pdf';
const AR120 = ('تقرير_الأسبوع_الأول_من_مقرر_التحليل_الإنشائي_والتصميم_للمباني_الخرسانية_المسلحة_النسخة_النهائية_المعدلة_بعد_المراجعة_الأخيرة_').slice(0, 116) + '.pdf';
const TITLE_EN = 'Week 1 — Introduction to the principles of structural analysis and design of reinforced concrete buildings, with worked examples from the first semester';
const TITLE_AR = 'الأسبوع الأول — مقدمة في مبادئ التحليل الإنشائي وتصميم المباني الخرسانية المسلحة مع أمثلة محلولة من الفصل الدراسي الأول ومذكرات المختبر';
const three = () => new Uint8Array(fs.readFileSync(fixture('three.pdf')));
const give = (page: Page, name: string, bytes: Uint8Array) => page.locator('input[type=file]').first().setInputFiles({ name, mimeType: 'application/pdf', buffer: Buffer.from(bytes) });
const clean = async (page: Page, where: string) => expect(((await page.evaluate(audit)) as { sample: unknown[] }).sample, where).toEqual([]);

for (const [lang, theme] of COMBOS) test(`top bar: a 120-character file name keeps its end visible and the bar still fits (${lang}, ${theme})`, async ({ page }, info) => {
  test.setTimeout(120_000);
  const name = lang === 'ar' ? AR120 : EN120;
  expect(name.length).toBe(120);
  await page.addInitScript(([l, th]) => { localStorage.setItem('waraq-lang', l); localStorage.setItem('waraq-theme', th); }, [lang, theme]);
  await page.goto('/');
  await give(page, name, three());
  await expect(page.locator('.page').first()).toBeVisible({ timeout: 60_000 });
  const bar = page.locator('.bar'), button = page.locator('.bar .name');
  await expect(button).toHaveAttribute('title', name);
  const [b, n, tail, head] = await Promise.all([bar.boundingBox(), button.boundingBox(), page.locator('.bar .name .tail').boundingBox(), page.locator('.bar .name .head').boundingBox()]);
  expect(n!.width).toBeLessThanOrEqual(242); // the title is at most about 240 px, right after the logo
  expect(n!.width).toBeGreaterThan(120);
  expect(n!.height).toBeGreaterThanOrEqual(35.5);
  expect(tail!.x).toBeGreaterThanOrEqual(n!.x - 1); expect(tail!.x + tail!.width).toBeLessThanOrEqual(n!.x + n!.width + 1); // the end is inside the button
  expect(await page.locator('.bar .name .tail').innerText()).toMatch(/\.pdf$/);
  expect(await page.locator('.bar .name .head').evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(true); // the middle is what gives way
  expect(head!.width).toBeGreaterThan(40);
  // the whole bar fits: nothing scrolls sideways, all ten tasks and the buttons are in view
  expect(await bar.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  expect(await page.locator('.bar .tasks').evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const btn of await page.locator('.bar button').all()) { const r = (await btn.boundingBox())!; expect(r.x).toBeGreaterThanOrEqual(0); expect(r.x + r.width).toBeLessThanOrEqual(1366); expect(r.height).toBeGreaterThanOrEqual(35.5); }
  await clean(page, 'bar');
  await page.screenshot({ path: info.outputPath(`bar-${lang}-${theme}.png`), clip: { x: 0, y: 0, width: 1366, height: 160 } });
  // the full name on click, with Copy
  await button.click();
  await expect(page.getByRole('dialog', { name: lang === 'ar' ? 'الاسم كاملًا' : 'Full name' })).toContainText(name);
  await clean(page, 'full name popover');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  if (lang === 'en' && theme === 'light') { // a short name is not split
    await page.getByRole('button', { name: 'Close' }).click();
    await give(page, 'short.pdf', three());
    await expect(page.locator('.bar .name .tail')).toHaveText('');
  }
});

test('recent files: a long name takes two lines at most; the full name is the tooltip', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await give(page, EN120, three());
  await expect(page.locator('.page').first()).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Close' }).click();
  const strong = page.locator('.recent .meta strong').first();
  await expect(strong).toHaveAttribute('title', EN120);
  const lines = await strong.evaluate((e) => Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight)));
  expect(lines).toBe(2);
  expect(await strong.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true); // no sideways clipping
});

for (const [lang, theme] of COMBOS) test(`portfolio: long names and titles are fully visible in fields that grow (${lang}, ${theme})`, async ({ page }, info) => {
  test.setTimeout(120_000);
  const title = lang === 'ar' ? TITLE_AR : TITLE_EN;
  await page.addInitScript(([l, th]) => { localStorage.setItem('waraq-lang', l); localStorage.setItem('waraq-theme', th); }, [lang, theme]);
  await page.goto('/');
  await page.locator('.actions .btn').nth(1).click(); // New portfolio
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.empty').click()]);
  await chooser.setFiles([fixture('three.pdf')]);
  await expect(page.locator('.sec')).toHaveCount(1);
  const sectionTitle = page.locator('.sec textarea.title');
  const oneLine = (await sectionTitle.boundingBox())!.height;
  await sectionTitle.fill(title);
  await expect.poll(async () => (await sectionTitle.boundingBox())!.height).toBeGreaterThan(oneLine * 1.5); // it grew
  const shown = async (loc: ReturnType<Page['locator']>) => loc.evaluate((e) => e.scrollHeight <= e.clientHeight + 1 && e.scrollWidth <= e.clientWidth + 1);
  expect(await shown(sectionTitle), 'section title fully visible').toBe(true);
  await sectionTitle.press('Enter'); // single-line semantics: no new line
  expect(await sectionTitle.inputValue()).toBe(title);
  await sectionTitle.fill('one\ntwo'); // a pasted line break becomes a space
  expect(await sectionTitle.inputValue()).toBe('one two');
  await sectionTitle.fill(title);
  // the contents row shows the same title whole
  const row = page.locator('.toc li textarea').first();
  await expect(row).toHaveValue(title);
  expect(await shown(row), 'contents row fully visible').toBe(true);
  // the portfolio name and the cover fields
  const nameField = page.getByLabel(lang === 'ar' ? 'اسم الحافظة' : 'Portfolio name');
  await nameField.fill(title);
  expect(await shown(nameField), 'portfolio name').toBe(true);
  await page.locator('.switch', { hasText: lang === 'ar' ? 'صفحة الغلاف' : 'Cover page' }).first().locator('input').check();
  const coverTitle = page.getByLabel(lang === 'ar' ? 'العنوان' : 'Title', { exact: true });
  await coverTitle.fill(title);
  expect(await shown(coverTitle), 'cover title').toBe(true);
  // a divider page: its title and note
  await page.locator('.sec').first().getByRole('button', { name: lang === 'ar' ? 'صفحة فاصلة' : 'Divider page' }).click();
  const dtitle = page.locator('.paper textarea.plain');
  await dtitle.fill(title);
  expect(await dtitle.evaluate((e) => e.scrollWidth <= e.clientWidth + 1 && e.clientHeight > 40), 'divider title wraps (no sideways clipping)').toBe(true); // the small preview scrolls after 6 lines
  await clean(page, 'portfolio with long names');
  await page.screenshot({ path: info.outputPath(`portfolio-long-${lang}-${theme}.png`) });
});

// The top row shows any name whole somewhere (visible, tooltip, popover); Row 2 stays complete at 1366 and 1024 wide.
const NAMES = [EN120, AR120.slice(0, 90 - 4) + '.pdf', 'تقرير (final) 2026.pdf'];
for (const [w, h] of [[1366, 768], [1024, 700]]) for (const lang of ['en', 'ar']) test(`top row: long, Arabic and mixed names; every task reachable (${w}x${h}, ${lang})`, async ({ page }, info) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: w, height: h });
  await page.addInitScript((l) => localStorage.setItem('waraq-lang', l), lang);
  await page.goto('/');
  for (const name of NAMES) {
    await give(page, name, three());
    await expect(page.locator('.page').first()).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('.bar .name')).toHaveAttribute('title', name);
    await page.locator('.bar .name').click();
    await expect(page.getByRole('dialog')).toContainText(name);
    await page.keyboard.press('Escape');
    for (const btn of await page.locator('.bar button').all()) { const r = (await btn.boundingBox())!; expect(r.height).toBeGreaterThanOrEqual(35.5); expect(r.x).toBeGreaterThanOrEqual(0); expect(r.x + r.width).toBeLessThanOrEqual(w); }
    expect(await page.locator('.bar').evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true); // nothing scrolls sideways
    const tasks = await page.locator('.bar .tasks .task').count(), more = await page.getByRole('button', { name: /^(More|المزيد) ▾$/ }).count();
    if (more) { expect(tasks).toBe(7); await page.getByRole('button', { name: /^(More|المزيد) ▾$/ }).click(); expect(await page.getByRole('menuitem').count()).toBe(4); await page.keyboard.press('Escape'); } else expect(tasks).toBe(10); // all ten, or six + More with four inside
    await page.screenshot({ path: info.outputPath(`toprow-${w}-${lang}-${NAMES.indexOf(name)}.png`), clip: { x: 0, y: 0, width: w, height: 140 } });
    await page.getByRole('button', { name: lang === 'ar' ? 'إغلاق' : 'Close' }).click();
  }
});
