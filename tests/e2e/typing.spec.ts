// Real keyboard typing in the page editor on the app as the WEBSITE serves it: built with base /app/ and sent with the
// website's Content-Security-Policy (waraq-site-1.0/_headers). A clicked line takes typed text, Add text takes typed text,
// "Save page" writes it, and the saved page has it. The older editor specs run at base / and set values with `fill`, which
// hid a site-only failure (fonts fetched from the origin root, not from /app/).
//   corepack pnpm build:site && npx playwright test tests/e2e/typing.spec.ts      (build:site writes dist-app/)
import { test, expect, type Page } from '@playwright/test';
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..', '..'), DIST = path.join(ROOT, 'dist-app');
// the headers of waraq-site-1.0/_headers for /app/*
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' data: blob:; object-src 'none'; frame-src 'self' blob:; base-uri 'self'; form-action 'self'; frame-ancestors 'self'";
const MIME: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.traineddata': 'application/octet-stream' };
const arabic = path.join(ROOT, 'tests', 'fixtures', 'arabic', 'edge-arial.pdf');
const norm = (s: string) => s.normalize('NFKC').replace(/\s+/g, ' ').trim();

let server: http.Server, base = '';
test.beforeAll(async () => {
  test.skip(!fs.existsSync(path.join(DIST, 'index.html')), 'run `corepack pnpm build:site` first (writes dist-app/)');
  server = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
    // like Cloudflare Pages: only /app/… exists; anything else is not found (no fallback to index.html for files)
    const rel = url.startsWith('/app/') ? url.slice(5) || 'index.html' : null;
    const file = rel === null ? null : path.join(DIST, rel.endsWith('/') ? rel + 'index.html' : rel);
    if (!file || !file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; res.setHeader('content-type', 'text/html'); return res.end('<!doctype html><title>not found</title>'); }
    res.setHeader('content-type', MIME[path.extname(file)] ?? 'application/octet-stream');
    res.setHeader('content-security-policy', CSP);
    res.end(fs.readFileSync(file));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/app/`;
});
test.afterAll(() => server?.close());

const problems: string[] = [];
test.beforeEach(({ page }) => {
  problems.length = 0;
  page.on('console', (msg) => { if (/Content Security Policy|Refused to/i.test(msg.text())) problems.push(msg.text()); });
  // known and listed for the layout session: the logo <img src="/brand-mark.svg"> in App, Workspace and Portfolio ignores the /app/ base
  const known = /brand-mark\.svg/;
  page.on('response', (r) => { if (r.status() >= 400 && !known.test(r.url())) problems.push(r.status() + ' ' + r.url()); });
  page.on('dialog', (d) => { problems.push('dialog: ' + d.message()); d.dismiss(); });
});

const ready = (page: Page) => expect(page.locator('.editor .sheet .hit').first()).toBeAttached({ timeout: 60_000 });
async function startEdit(page: Page, lang: 'en' | 'ar') {
  await page.addInitScript((l) => localStorage.setItem('waraq-lang', l), lang);
  await page.goto(base);
  await page.locator('input[type=file]').first().setInputFiles(arabic);
  await expect(page.locator('.page').first()).toBeVisible({ timeout: 60_000 });
  await page.locator('.task').nth(2).click(); // Edit
  await ready(page);
}
async function finish(page: Page) {
  await page.locator('.editor .tools .btn.primary').click(); // Save page
  await expect(page.locator('.editor')).toBeHidden({ timeout: 60_000 });
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('.end .btn').first().click()]);
  const bytes = new Uint8Array(fs.readFileSync((await download.path())!));
  return m.Document.openDocument(bytes, 'application/pdf').loadPage(0).toStructuredText('preserve-whitespace').asText();
}

for (const lang of ['en', 'ar'] as const) {
  test(`${lang}: typing over a clicked Arabic line replaces it, the page behind it is lifted, Save page writes it`, async ({ page }) => {
    test.setTimeout(180_000);
    await startEdit(page, lang);
    const line = page.locator('.editor .hit.line').first();
    await line.click({ clickCount: 3 }); // what the owner did: triple-click
    const box = page.locator('.obj.text.on textarea');
    await expect(box).toBeFocused();
    const before = await box.inputValue();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('ورق تجربة 2026', { delay: 20 });
    await expect(box).toHaveValue('ورق تجربة 2026');
    expect(before).not.toBe('ورق تجربة 2026');
    await page.waitForTimeout(1500); // the editor's background (old line taken away) and the font note settle
    expect(problems, 'nothing may fail to load or be refused').toEqual([]);
    const text = await finish(page);
    expect(problems, 'nothing may fail to load or be refused').toEqual([]);
    for (const w of ['ورق', 'تجربة', '2026']) expect(text).toContain(w);
    expect(text).not.toContain('بسم'); // the old first line is gone
  });

  test(`${lang}: Add text — click the page, type English and Arabic, save`, async ({ page }) => {
    test.setTimeout(180_000);
    await startEdit(page, lang);
    await page.locator('.editor .tools .btn').nth(1).click(); // Add text
    const sheet = (await page.locator('.editor .sheet').boundingBox())!;
    await page.mouse.click(sheet.x + sheet.width * 0.5, sheet.y + sheet.height * 0.9);
    const box = page.locator('.obj.text.on textarea');
    await expect(box).toBeFocused();
    await page.keyboard.type('Typed text: ملاحظة 42', { delay: 20 });
    await expect(box).toHaveValue('Typed text: ملاحظة 42');
    const text = await finish(page);
    expect(problems).toEqual([]);
    expect(norm(text)).toContain('Typed text');
    expect(norm(text)).toContain('ملاحظة');
  });
}
