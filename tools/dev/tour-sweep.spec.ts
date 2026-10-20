// Quality sweep: every task in English and Arabic at 1366x768 on the BUILT app. npx playwright test -c tools/dev/tour.config.ts sweep
import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const file = path.join(import.meta.dirname, '..', '..', 'tests', 'fixtures', 'three.pdf');
const out = path.join(import.meta.dirname, '..', '..', '..', 'Archive-2026-10-12', 'screenshots', 'waraq-1.0-preview', 'quality');
fs.mkdirSync(out, { recursive: true });

for (const lang of ['en', 'ar']) {
  test(`sweep ${lang}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, locale: lang });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));
    const t0 = Date.now();
    await page.goto('/');
    await page.locator('input[type=file]').first().setInputFiles(file);
    await expect(page.locator('.page').first()).toBeVisible({ timeout: 60_000 });
    console.log(lang, 'first open (built app, fresh profile):', Date.now() - t0, 'ms');
    const names = await page.locator('nav.tasks button').allInnerTexts();
    const findings: string[] = [];
    for (let i = 0; i < names.length; i++) {
      await page.locator('nav.tasks button').nth(i).click();
      await page.waitForTimeout(700);
      const r = await page.evaluate(() => {
        const bad: string[] = [];
        const vw = innerWidth, vh = innerHeight;
        if (document.documentElement.scrollWidth > vw) bad.push('page wider than window');
        if (document.documentElement.scrollHeight > vh + 1) bad.push('page taller than window (' + document.documentElement.scrollHeight + ')');
        const nav = document.querySelector('nav.tasks') as HTMLElement | null;
        if (nav && nav.scrollWidth > nav.clientWidth + 1) bad.push('task bar overflows by ' + (nav.scrollWidth - nav.clientWidth) + 'px');
        for (const el of document.querySelectorAll('button, a, input, select, textarea, [role=button]')) {
          const b = (el as HTMLElement).getBoundingClientRect();
          if (!b.width || !b.height || getComputedStyle(el).visibility === 'hidden') continue;
          const label = ((el as HTMLElement).innerText || (el as HTMLInputElement).placeholder || el.getAttribute('aria-label') || el.className || '').trim().slice(0, 28);
          if (b.height < 36 && (el as HTMLElement).offsetParent) bad.push(`small control ${Math.round(b.width)}x${Math.round(b.height)} "${label}"`);
          if (b.right > vw + 1 || b.left < -1) bad.push(`outside window "${label}"`);
        }
        for (const el of document.querySelectorAll('button, .btn, label, h1, h2, h3, p, span')) {
          const e = el as HTMLElement;
          if (e.clientWidth && e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflow !== 'visible') bad.push(`clipped text "${e.innerText.trim().slice(0, 28)}"`);
        }
        return [...new Set(bad)];
      });
      const shot = `${lang}-${String(i + 1).padStart(2, '0')}-${names[i].trim().replace(/\W+/g, '_')}.png`;
      await page.screenshot({ path: path.join(out, shot) });
      if (r.length) findings.push(`[${names[i].trim()}] ` + r.join('; '));
    }
    console.log(lang, 'tasks:', names.join(' | '));
    console.log(lang, 'findings:\n' + (findings.join('\n') || 'none'));
    console.log(lang, 'console errors:', errors.length ? errors.slice(0, 5) : 'none');
    await ctx.close();
  });
}
