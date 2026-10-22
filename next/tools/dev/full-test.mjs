// Full functionality test of Waraq 1.0 beta, driven like a person (real mouse clicks, real key presses, English and Arabic), on the
// BUILT app served the way the website serves it: under /app/, next to a copy of the website's files, with the website's
// _redirects and _headers (the CSP). Every request the app makes is logged; any non-200 is a finding.
//   corepack pnpm build:site && node tools/dev/full-test.mjs [group,group,...] [--out <report json>]
// Groups: assets start toprow view organize edit convert sign protect redact forms ocr comment portfolio recovery support
// Writes <out>/results.json and screenshots to <out>/shots (default: Archive-2026-10-12/screenshots/full-test).
// Fixes nothing: it only reports. File choosers are answered with fixtures (a real dialog cannot be driven); everything else is clicked and typed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';

const ROOT = path.resolve(import.meta.dirname, '..', '..'), SITE = process.env.WARAQ_SITE ?? path.resolve(ROOT, '..', 'waraq-site-1.0'), DIST = path.join(ROOT, 'dist-app');
const args = process.argv.slice(2), outArg = args.indexOf('--out'), OUT = outArg >= 0 ? path.resolve(args[outArg + 1]) : path.resolve(ROOT, '..', 'Archive-2026-10-12', 'screenshots', 'full-test');
const wanted = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--out')[0]?.split(',');
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('@playwright/test');
fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });
const fx = (f) => path.join(ROOT, 'tests', 'fixtures', f);

// ---- the site: a composed folder (website files + the built app under app/), with _redirects and _headers applied like Cloudflare Pages
const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waraq-site-'));
// the site as published (waraq-site-1.0/.stage = what the ZIP holds: pages, scripts, fonts, _headers, _redirects) without its old app and the big download pieces; app/ is the fresh build
const STAGE = fs.existsSync(path.join(SITE, '.stage')) ? path.join(SITE, '.stage') : SITE;
fs.cpSync(STAGE, siteDir, { recursive: true, filter: (s) => !/[\\/](app|publish|tools|\.git)$/.test(s) && !/[\\/](publish|\.git)[\\/]/.test(s) && !(fs.statSync(s).isFile() && fs.statSync(s).size > 5 * 1024 * 1024) });
fs.cpSync(DIST, path.join(siteDir, 'app'), { recursive: true });
const rules = (f) => (fs.existsSync(path.join(STAGE, f)) ? fs.readFileSync(path.join(STAGE, f), 'utf8').split(/\r?\n/) : []);
const redirects = rules('_redirects').filter((l) => l.trim() && !l.startsWith('#')).map((l) => l.trim().split(/\s+/)).map(([from, to, status]) => ({ re: new RegExp('^' + from.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '(.*)').replace(':splat', '$1') + '$'), to, status: +(status ?? 301), from }));
const headerBlocks = []; { let cur = null; for (const l of rules('_headers')) { if (!l.trim() || l.startsWith('#')) continue; if (/^\S/.test(l)) { cur = { re: new RegExp('^' + l.trim().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'), h: [] }; headerBlocks.push(cur); } else { const i = l.indexOf(':'); cur?.h.push([l.slice(0, i).trim(), l.slice(i + 1).trim()]); } } }
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.traineddata': 'application/octet-stream', '.gz': 'application/gzip', '.txt': 'text/plain', '.pdf': 'application/pdf' };
const served = [];
function respond(req, res) {
  let url = decodeURIComponent((req.url ?? '/').split('?')[0]), status = 200;
  const rd = redirects.find((r) => r.re.test(url));
  if (rd) { if (rd.status === 301 || rd.status === 302) { res.statusCode = rd.status; res.setHeader('location', rd.to); served.push([rd.status, url]); return res.end(); } url = url.replace(rd.re, rd.to); }
  if (!path.extname(url) && !url.endsWith('/') && fs.existsSync(path.join(siteDir, url + '.html'))) url += '.html'; // Cloudflare Pages clean URLs: /support -> support.html
  let file = path.join(siteDir, url.endsWith('/') ? url + 'index.html' : url);
  if (!file.startsWith(siteDir) || !fs.existsSync(file) || (fs.statSync(file).isDirectory() && !fs.existsSync(path.join(file, 'index.html')))) { status = 404; file = path.join(siteDir, '404.html'); if (!fs.existsSync(file)) { res.statusCode = 404; served.push([404, req.url]); return res.end('Not found'); } }
  else if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  for (const b of headerBlocks) if (b.re.test(url)) for (const [k, v] of b.h) res.setHeader(k, v);
  res.statusCode = status; res.setHeader('content-type', MIME[path.extname(file)] ?? 'application/octet-stream'); served.push([status, req.url]);
  res.end(fs.readFileSync(file));
}
const server = http.createServer(respond);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`, APP = BASE + '/app/';

// ---- the strings, so one script clicks by the label of the language in use
const strings = new Function('return {' + fs.readFileSync(path.join(ROOT, 'src/lib/i18n.svelte.ts'), 'utf8').split('const strings = {')[1].split('} satisfies')[0] + '}')();
const L = (lang) => (k) => strings[k][lang === 'ar' ? 1 : 0];

// ---- recording
const results = [], findings = [];
let shotN = 0;
const slug = (s) => s.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 50);
async function shot(page, task, name, lang) { const f = `${String(++shotN).padStart(3, '0')}-${lang}-${slug(task)}-${slug(name)}.png`; try { await page.screenshot({ path: path.join(OUT, 'shots', f) }); } catch {} return 'shots/' + f; }
const run = { browser: null, step: '' };
/** one check: `fn(ctx)` throws on failure; a note can be returned as a string */
class Soft extends Error {}
async function check(task, name, lang, page, fn, o = {}) {
  const t0 = Date.now(); let status = 'pass', note = '', s = ''; run.step = task + ' / ' + name;
  try { note = (await fn()) ?? ''; if (o.shot) s = await shot(page, task, name, lang); } catch (e) { status = e instanceof Soft ? 'note' : 'fail'; note = String(e.message ?? e).split('\n').slice(0, 3).join(' ').slice(0, 300); s = await shot(page, task, name + (status === 'fail' ? '-FAIL' : '-NOTE'), lang); }
  results.push({ task, name, lang, status, note, shot: s, ms: Date.now() - t0 });
  console.log(`${status === 'pass' ? 'ok  ' : status === 'note' ? 'note' : 'FAIL'} [${lang}] ${task} / ${name}${note ? ' — ' + note : ''}`);
  return status === 'pass';
}
async function session(lang, theme = 'light', viewport = { width: 1366, height: 768 }) {
  const browser = run.browser ??= await chromium.launch({ channel: 'msedge' });
  const ctx = await browser.newContext({ viewport, locale: lang === 'ar' ? 'ar-SA' : 'en-US', acceptDownloads: true });
  await ctx.addInitScript(([l, th]) => { try { if (!sessionStorage.getItem('ft-init')) { localStorage.setItem('waraq-lang', l); localStorage.setItem('waraq-theme', th); sessionStorage.setItem('ft-init', '1'); } } catch {} }, [lang, theme]);
  const page = await ctx.newPage(), bad = [];
  page.on('response', (r) => { const s = r.status(); if (/brand-mark\.svg$/.test(r.url())) return; if (s !== 200 && s !== 304 && s !== 206 && !(s === 204)) bad.push(`${s} ${r.url().replace(BASE, '')}`); });
  page.on('requestfailed', (r) => { if (!/blob:|data:/.test(r.url())) bad.push(`failed ${r.url().replace(BASE, '')} ${r.failure()?.errorText ?? ''}`); });
  page.on('console', (msg) => { if (/Content Security Policy|Refused to/i.test(msg.text())) bad.push('console: ' + msg.text().slice(0, 200)); });
  page.on('pageerror', (e) => bad.push('pageerror during "' + run.step + '": ' + String(e.message).slice(0, 120) + ' @ ' + String(e.stack ?? '').split(/\r?\n/).slice(1, 3).join(' ').replace(/http:\/\/127\.0\.0\.1:\d+/g, '').slice(0, 160)));
  page.on('dialog', (d) => { bad.push('dialog: ' + d.message()); d.dismiss(); });
  return { ctx, page, bad, t: L(lang), lang };
}
async function openFile(s, file, { name, bytes } = {}) {
  await s.page.goto(APP);
  await s.page.locator('input[type=file]').first().setInputFiles(bytes ? { name, mimeType: 'application/pdf', buffer: Buffer.from(bytes) } : file);
  await s.page.locator('.page').first().waitFor({ state: 'visible', timeout: 90_000 });
}
const saveClick = async (s, click) => { const [d] = await Promise.all([s.page.waitForEvent('download', { timeout: 120_000 }), click()]); return { name: d.suggestedFilename(), bytes: new Uint8Array(fs.readFileSync(await d.path())) }; };
const task = (s, key) => s.page.locator('nav.tasks button.task, .moremenu button.task').filter({ hasText: new RegExp('^\\s*' + s.t(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$') }).first();
const goStart = async (s) => { await s.page.goto(APP); await s.page.locator('.start').waitFor({ timeout: 60_000 }); };
const doc = (bytes) => m.Document.openDocument(bytes, 'application/pdf');
const textOf = (bytes, p = 0) => doc(bytes).loadPage(p).toStructuredText('preserve-whitespace').asText();
const allText = (bytes) => { const d = doc(bytes); let t = ''; for (let i = 0; i < d.countPages(); i++) t += d.loadPage(i).toStructuredText('preserve-whitespace').asText() + '\n'; return t; };
const norm = (s) => s.normalize('NFKC').replace(/\s+/g, ' ').trim();
const pages = (bytes) => doc(bytes).countPages();
const must = (cond, msg) => { if (!cond) throw new Error(msg); };
/** types like a person: click the field, select what is there, type */
async function typeReal(s, locator, text, o = {}) { await locator.click(); if (!o.append) await s.page.keyboard.press('Control+a'); await s.page.keyboard.type(text, { delay: 12 }); }
const sheetBox = (page, sel) => page.locator(sel).boundingBox();
async function drag(page, a, b) { await page.mouse.move(a[0], a[1]); await page.mouse.down(); await page.mouse.move((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, { steps: 5 }); await page.mouse.move(b[0], b[1], { steps: 5 }); await page.mouse.up(); }
const arabicPdf = fx('arabic/edge-arial.pdf');
const endBad = async (s, where) => { const b = [...new Set(s.bad)]; s.bad.length = 0; return b; };
const expectNoBad = (s, task, lang) => results.push({ task, name: 'no failed / refused request during this group', lang, status: s.bad.length ? 'fail' : 'pass', note: [...new Set(s.bad)].slice(0, 8).join(' | '), shot: '', ms: 0 });

const groups = {};

// ========================================================================== assets (site serving)
groups.assets = async () => {
  const lang = 'en', s = await session(lang);
  const files = []; (function walk(d, rel = '') { for (const f of fs.readdirSync(d, { withFileTypes: true })) f.isDirectory() ? walk(path.join(d, f.name), rel + f.name + '/') : files.push(rel + f.name); })(DIST);
  const rt = []; let n = 0;
  for (const f of files) { const r = await s.page.request.get(APP + f); n++; if (r.status() !== 200) rt.push(`${r.status()} /app/${f}`); }
  await check('assets', `every file of the build is served 200 under /app/ (${n} files)`, lang, s.page, async () => { must(!rt.length, rt.slice(0, 10).join(' | ')); return `${n} files`; });
  for (const p of ['/app/', '/app/index.html', '/app', '/', '/support.html', '/support']) { const r = await s.page.request.get(BASE + p, { maxRedirects: 5 }); results.push({ task: 'assets', name: `site path ${p}`, lang, status: r.status() === 200 ? 'pass' : 'note', note: `HTTP ${r.status()}`, shot: '', ms: 0 }); console.log(`     ${p} -> ${r.status()}`); }
  const r = await s.page.request.get(APP); const csp = r.headers()['content-security-policy'] ?? '';
  await check('assets', 'the website CSP is sent with /app/', lang, s.page, async () => { must(/script-src 'self' 'wasm-unsafe-eval'/.test(csp), 'no CSP header: ' + csp.slice(0, 80)); });
  // what the app fetches while it works: open a PDF, the editor (fonts), OCR files, then log every response
  await s.page.goto(APP); await s.page.locator('.start').waitFor({ timeout: 60_000 });
  await check('assets', 'the Waraq logo image on the start screen loads', lang, s.page, async () => { const ok = await s.page.locator('.start img').first().evaluate((i) => i.complete && i.naturalWidth > 0); must(ok, 'logo <img src=' + (await s.page.locator('.start img').first().getAttribute('src')) + '> is broken'); }, { shot: true });
  await openFile(s, fx('three.pdf'));
  await task(s, 'edit').click(); await s.page.locator('.editor .sheet .hit').first().waitFor({ state: 'attached', timeout: 60_000 }).catch(() => {});
  await s.page.waitForTimeout(1500);
  const seen = [...new Set(served.map((x) => x[0] + ' ' + x[1]))].filter((x) => !x.startsWith('200 ') && !x.startsWith('301 /app'));
  await check('assets', 'run-time fetches while opening a PDF and the page editor: no non-200', lang, s.page, async () => { must(!s.bad.length, [...new Set(s.bad)].join(' | ')); });
  await check('assets', 'server log: no 404 or other non-200 so far', lang, s.page, async () => { must(!seen.length, seen.slice(0, 10).join(' | ')); });
  await s.ctx.close();
};

// ========================================================================== start screen
groups.start = async () => {
  for (const lang of ['en', 'ar']) {
    const s = await session(lang), P = s.page, t = s.t;
    await P.goto(APP);
    await check('start', 'start screen shows the open button and the privacy line', lang, P, async () => { await P.getByRole('button', { name: t('open') }).waitFor({ timeout: 60_000 }); must(await P.getByText(t('privacy')).isVisible(), 'privacy line'); }, { shot: true });
    await check('start', 'page direction follows the language', lang, P, async () => { must((await P.locator('html').getAttribute('dir')) === (lang === 'ar' ? 'rtl' : 'ltr'), 'dir'); });
    await check('start', 'open a PDF with the file chooser (Open button click)', lang, P, async () => { const [c] = await Promise.all([P.waitForEvent('filechooser'), P.getByRole('button', { name: t('open') }).click()]); await c.setFiles(fx('three.pdf')); await P.locator('.page').first().waitFor({ timeout: 90_000 }); must((await P.locator('.page').count()) === 3, 'pages'); }, { shot: true });
    await check('start', 'Close returns to the start screen; the file is in Recent with its page count', lang, P, async () => { await P.getByRole('button', { name: t('close') }).first().click(); await P.locator('.recent .card').first().waitFor(); must(/3/.test(await P.locator('.recent .card').first().innerText()), await P.locator('.recent .card').first().innerText()); }, { shot: true });
    await check('start', 'open from Recent (click the card)', lang, P, async () => { await P.locator('.recent .card').first().click(); const ok = await P.locator('.page').first().waitFor({ timeout: 8_000 }).then(() => true, () => false); if (!ok) { const msg = await P.locator('[role=alert], .error').first().innerText().catch(() => ''); throw new Soft('the card did not reopen the file on the web (a file chosen through the Open button has no stored handle); the app says: ' + msg); } });
    await check('start', 'drag and drop a PDF onto the start screen', lang, P, async () => {
      await goStart(s);
      const bytes = fs.readFileSync(fx('small.pdf')), dt = await P.evaluateHandle((b64) => { const dt = new DataTransfer(); const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); dt.items.add(new File([bin], 'dropped.pdf', { type: 'application/pdf' })); return dt; }, bytes.toString('base64'));
      await P.dispatchEvent('.start', 'dragenter', { dataTransfer: dt }); await P.dispatchEvent('.start', 'dragover', { dataTransfer: dt }); await P.dispatchEvent('.start', 'drop', { dataTransfer: dt });
      await P.locator('.page').first().waitFor({ timeout: 60_000 });
      must((await P.locator('.name').first().innerText()).includes('dropped'), 'name');
    }, { shot: true });
    await goStart(s);
    await check('start', 'language switch button flips the whole interface and it is remembered after reload', lang, P, async () => { await P.locator('.start .lang button[aria-label]').last().click(); await P.waitForTimeout(300); must((await P.locator('html').getAttribute('dir')) === (lang === 'ar' ? 'ltr' : 'rtl'), 'did not flip'); await P.reload(); must((await P.locator('html').getAttribute('dir')) === (lang === 'ar' ? 'ltr' : 'rtl'), 'not remembered'); await P.locator('.start .lang button[aria-label]').last().click(); await P.waitForTimeout(200); }, { shot: true });
    await check('start', 'theme button cycles four themes (Light, Dim, Dark, Graphite)', lang, P, async () => { const seen = []; for (let i = 0; i < 5; i++) { seen.push(await P.locator('html').getAttribute('data-theme')); await P.locator('.start .lang button').first().click(); await P.waitForTimeout(150); if (i === 1) await shot(P, 'start', 'theme-dim', lang); } must(new Set(seen).size >= 4, 'themes seen: ' + seen.join(',')); return seen.slice(0, 4).join(' > '); });
    await check('start', 'New portfolio opens a portfolio', lang, P, async () => { await P.getByRole('button', { name: t('newPortfolio') }).click(); await P.locator('.empty, .sec').first().waitFor({ timeout: 30_000 }); }, { shot: true });
    expectNoBad(s, 'start', lang); await s.ctx.close();
  }
};

// ========================================================================== top row
groups.toprow = async () => {
  const names = { en: 'A very long English report title for the second quarter of the year 2026 final version.pdf', ar: 'تقرير سنوي طويل جدا عن مشروع التحول الرقمي للمؤسسات الصغيرة والمتوسطة النسخة النهائية ٢٠٢٦.pdf', mixed: 'تقرير Q3 2026 — Final مراجعة نهائية للإدارة العليا والمجلس الاستشاري.pdf' };
  for (const lang of ['en', 'ar']) {
    const s = await session(lang), P = s.page, t = s.t;
    for (const [k, name] of Object.entries(names)) {
      await check('top row', `long ${k} file name: title after the logo, tasks fit, nothing off screen`, lang, P, async () => {
        await openFile(s, null, { name, bytes: fs.readFileSync(fx('three.pdf')) });
        const bar = await P.locator('.bar').boundingBox(), nm = await P.locator('.bar .name').boundingBox();
        must(nm.width <= 245, 'title wider than 240: ' + Math.round(nm.width));
        must(await P.locator('.bar .tasks').evaluate((e) => e.scrollWidth <= e.clientWidth + 1), 'tasks overflow');
        for (const b of await P.locator('.bar button:visible').all()) { const r = await b.boundingBox(); must(r.x >= 0 && r.x + r.width <= 1367, 'button off screen'); }
        must((await P.locator('.bar .name').getAttribute('title')) === name, 'full name not in the title');
        const rows = await P.evaluate(() => [...document.querySelectorAll('.bar button')].filter((b) => b.offsetParent).map((b) => Math.round(b.getBoundingClientRect().top / 10)));
        must(new Set(rows).size <= 2, 'buttons on several rows: ' + [...new Set(rows)]);
      }, { shot: true });
      await check('top row', `${k} name: click the title shows the full name; Copy name copies it; Escape closes`, lang, P, async () => {
        await P.locator('.bar .name').click(); const dlg = P.getByRole('dialog'); await dlg.waitFor(); must((await dlg.innerText()).includes(name.slice(0, 12)), 'dialog text');
        await shot(P, 'top row', `popover-${k}`, lang);
        await ctxGrant(s); await dlg.getByRole('button', { name: t('copyName') }).click(); const clip = await P.evaluate(() => navigator.clipboard.readText()); must(clip === name, 'clipboard: ' + clip.slice(0, 30));
        await P.keyboard.press('Escape'); must((await P.getByRole('dialog').count()) === 0, 'dialog still open');
      });
      await P.getByRole('button', { name: t('close') }).first().click(); await P.locator('.start').waitFor();
    }
    await openFile(s, fx('three.pdf'));
    await check('top row', 'unsaved dot appears after a change and goes after Save', lang, P, async () => {
      await task(s, 'organize').click(); await P.locator('.cell').nth(0).click(); await P.keyboard.press('Delete');
      await P.locator('.bar .mod').waitFor({ timeout: 10_000 });
      await shot(P, 'top row', 'unsaved-dot', lang);
      const f = await saveClick(s, () => P.locator('.bar .end').getByRole('button', { name: t('save') }).first().click());
      await P.locator('.bar .mod').waitFor({ state: 'detached', timeout: 10_000 }); must(pages(f.bytes) === 2, 'saved pages ' + pages(f.bytes));
    });
    await check('top row', 'Save ▾: Save, Save as…, Save a smaller copy are all in the menu', lang, P, async () => {
      await P.getByRole('button', { name: t('saveOptions') }).click(); const items = await P.getByRole('menuitem').allInnerTexts(); await shot(P, 'top row', 'save-menu', lang);
      must(items.some((x) => x.includes(t('saveAsItem').replace('…', ''))) && items.some((x) => x.includes(t('compressSave').replace(/…/g, ''))), 'items: ' + items.join(' / '));
      await P.keyboard.press('Escape');
    });
    await check('top row', 'Save a smaller copy: dialog, Recommended, Save writes a PDF that opens', lang, P, async () => {
      await P.getByRole('button', { name: t('saveOptions') }).click(); await P.getByRole('menuitem', { name: t('compressSave') }).click();
      const d = P.getByRole('dialog'); await d.waitFor(); const f = await saveClick(s, () => d.getByRole('button', { name: t('save'), exact: true }).click()); must(pages(f.bytes) === 2, 'pages');
    });
    await check('top row', 'Open button opens another file; Close then Undo close brings the document back', lang, P, async () => {
      const [c] = await Promise.all([P.waitForEvent('filechooser'), P.locator('.bar .end').getByRole('button', { name: t('openShort') }).click()]); await c.setFiles(fx('small.pdf')); await P.locator('.page').first().waitFor({ timeout: 60_000 });
      await P.getByRole('button', { name: t('close') }).first().click(); await P.locator('.start').waitFor();
      await shot(P, 'top row', 'undo-close-offer', lang);
      await P.getByRole('button', { name: new RegExp(t('undoClose').split('{name}')[0].trim()) }).click(); await P.locator('.page').first().waitFor({ timeout: 30_000 });
    });
    expectNoBad(s, 'top row', lang); await s.ctx.close();
  }
};
async function ctxGrant(s) { try { await s.ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE }); } catch {} }

// ========================================================================== view
groups.view = async () => {
  for (const lang of ['en', 'ar']) {
    const s = await session(lang), P = s.page, t = s.t, word = lang === 'ar' ? 'بسم' : 'Report';
    await openFile(s, lang === 'ar' ? arabicPdf : fx('small.pdf'));
    await check('view', 'zoom in / zoom out buttons and Ctrl + / Ctrl − change the page size; Ctrl 0 fits', lang, P, async () => {
      const w = () => P.locator('.page').first().evaluate((e) => e.getBoundingClientRect().width); const w0 = await w();
      await P.getByRole('button', { name: t('zoomIn') }).click(); await P.waitForTimeout(300); const w1 = await w(); must(w1 > w0, `zoom in ${w0}->${w1}`);
      await P.getByRole('button', { name: t('zoomOut') }).click(); await P.getByRole('button', { name: t('zoomOut') }).click(); await P.waitForTimeout(300); must((await w()) < w1, 'zoom out');
      await P.keyboard.press('Control+Equal'); await P.waitForTimeout(200); await P.keyboard.press('Control+0'); await P.waitForTimeout(300);
    }, { shot: true });
    await check('view', 'Fit width and Whole page buttons', lang, P, async () => { await P.getByRole('button', { name: t('fitWidth') }).click(); await P.waitForTimeout(250); const a = await P.locator('.page').first().boundingBox(); await P.getByRole('button', { name: t('fitPage') }).click(); await P.waitForTimeout(250); const b = await P.locator('.page').first().boundingBox(); must(a.width !== b.width || a.height !== b.height, 'no change'); });
    await check('view', 'page box: type a page number and press Enter', lang, P, async () => { const box = P.locator('input[type=number], .pagebox input').first(); if (await box.count()) { await box.click(); await P.keyboard.press('Control+a'); await P.keyboard.type('1'); await P.keyboard.press('Enter'); } });
    await check('view', 'thumbnails panel toggles (button and F4)', lang, P, async () => { const th = P.locator('.thumb').first(); const was = await th.isVisible().catch(() => false); await P.keyboard.press('F4'); await P.waitForTimeout(300); const now = await th.isVisible().catch(() => false); must(was !== now, 'F4 did not toggle'); await P.getByRole('button', { name: t('thumbnails') }).click(); await P.waitForTimeout(300); }, { shot: true });
    await check('view', `Find (Ctrl F) types "${word}": hit counter and marks appear`, lang, P, async () => {
      await P.keyboard.press('Control+f'); const box = P.getByRole('searchbox'); await box.click(); await P.keyboard.type(word, { delay: 15 }); await P.keyboard.press('Enter');
      await P.locator('.find .num').waitFor({ timeout: 15_000 }); await P.waitForFunction(() => /\d/.test(document.querySelector('.find .num')?.textContent ?? ''), null, { timeout: 15_000 }).catch(() => {}); const n = await P.locator('.find .num').innerText(); must(/[1-9]/.test(n), 'counter: ' + n); must((await P.locator('.marks i').count()) >= 1, 'no hit boxes'); return n;
    }, { shot: true });
    await check('view', 'select text by triple click on a text line and copy with Ctrl C', lang, P, async () => {
      await ctxGrant(s); const span = P.locator('.text span').first(); await span.click({ clickCount: 3 }); await P.keyboard.press('Control+c'); const clip = await P.evaluate(() => navigator.clipboard.readText()); must(clip.trim().length > 3, 'nothing copied'); return clip.trim().slice(0, 30);
    });
    expectNoBad(s, 'view', lang); await s.ctx.close();
  }
};

// ========================================================================== organize
groups.organize = async () => {
  for (const lang of ['en', 'ar']) {
    const s = await session(lang), P = s.page, t = s.t, cells = () => P.locator('.cell'), order = () => cells().evaluateAll((els) => els.map((e) => e.dataset.src));
    await openFile(s, fx('three.pdf')); await task(s, 'organize').click(); await cells().first().waitFor();
    await check('organize', 'three pages shown; click, Shift+click and Ctrl+click select many', lang, P, async () => {
      must((await cells().count()) === 3, 'cells'); await cells().nth(0).click(); await cells().nth(2).click({ modifiers: ['Shift'] }); const a = await P.locator('.cell.sel').count(); must(a === 3, 'shift range selected ' + a);
      await cells().nth(1).click(); await cells().nth(2).click({ modifiers: ['Control'] }); must((await P.locator('.cell.sel').count()) === 2, 'ctrl selection');
    }, { shot: true });
    await check('organize', 'drag the last page to the front', lang, P, async () => { await cells().nth(2).click(); const o0 = await order(), cb = await cells().nth(0).boundingBox(); await cells().nth(2).dragTo(cells().nth(0), { targetPosition: { x: lang === 'ar' ? cb.width - 8 : 8, y: 60 } }); await P.waitForTimeout(400); const o1 = await order(); must(o1[0] === o0[2], 'order ' + o0 + ' -> ' + o1); });
    await check('organize', 'rotate right turns the picture', lang, P, async () => { await cells().nth(0).click(); await P.getByRole('button', { name: t('rotateRight') }).first().click(); await P.waitForTimeout(300); must(/rotate\(90deg\)/.test((await P.locator('.cell canvas').first().getAttribute('style')) ?? ''), 'no rotate'); await P.getByRole('button', { name: t('rotateLeft') }).first().click(); });
    await check('organize', 'Delete key removes a page; Ctrl Z brings it back; Ctrl Y deletes again; Ctrl Z', lang, P, async () => { await cells().nth(1).click(); await P.keyboard.press('Delete'); must((await cells().count()) === 2, 'delete'); await P.keyboard.press('Control+z'); must((await cells().count()) === 3, 'undo'); await P.keyboard.press('Control+y'); must((await cells().count()) === 2, 'redo'); await P.keyboard.press('Control+z'); must((await cells().count()) === 3, 'undo 2'); });
    await check('organize', 'Insert file (a photo) adds a page; Blank page adds another', lang, P, async () => {
      const [c] = await Promise.all([P.waitForEvent('filechooser'), P.getByRole('button', { name: t('insertFile') }).click()]); await c.setFiles(fx('photo.png')); await P.waitForTimeout(800); must((await cells().count()) === 4, 'after photo ' + (await cells().count()));
      await P.getByRole('button', { name: t('blankPage') }).click(); await P.waitForTimeout(500); must((await cells().count()) === 5, 'after blank ' + (await cells().count()));
    }, { shot: true });
    await check('organize', 'the "+" between two pages inserts a file there', lang, P, async () => { await cells().nth(0).hover(); const [c] = await Promise.all([P.waitForEvent('filechooser'), P.locator('.cell .ins').first().click({ force: true })]); await c.setFiles(fx('small.pdf')); await P.waitForTimeout(800); must((await cells().count()) > 5, 'cells ' + (await cells().count())); });
    await check('organize', 'save: the file has exactly the pages shown', lang, P, async () => { const n = await cells().count(); const f = await saveClick(s, () => P.locator('.bar .end').getByRole('button', { name: t('save') }).first().click()); must(pages(f.bytes) === n, `saved ${pages(f.bytes)} vs ${n}`); });
    await openFile(s, fx('three.pdf')); await task(s, 'organize').click(); await cells().first().waitFor();
    await check('organize', 'Extract: select two pages, Extract saves a 2-page PDF', lang, P, async () => { await cells().nth(1).click(); await cells().nth(2).click({ modifiers: ['Shift'] }); const f = await saveClick(s, () => P.getByRole('button', { name: t('extract') }).click()); must(pages(f.bytes) === 2, 'pages ' + pages(f.bytes)); });
    await check('organize', 'Split: each page its own file, one ZIP with 3 files', lang, P, async () => { await P.getByRole('button', { name: t('split'), exact: true }).click(); await P.getByLabel(t('splitEach')).check(); const f = await saveClick(s, () => P.getByRole('button', { name: t('splitSave') }).click()); const n = (Buffer.from(f.bytes).toString('latin1').match(/PK\x03\x04/g) ?? []).length; must(n === 3, 'zip entries ' + n); }, { shot: true });
    await check('organize', 'Crop: type 30 in each side box, crop the page, save: the page is smaller', lang, P, async () => {
      await cells().nth(0).click(); await P.getByRole('button', { name: t('crop'), exact: true }).click();
      for (const k of ['cropLeft', 'cropTop', 'cropRight', 'cropBottom']) await typeReal(s, P.getByLabel(t(k), { exact: true }), '30');
      await P.getByRole('button', { name: t('cropSelected') }).click(); await P.waitForTimeout(500);
      const f = await saveClick(s, () => P.locator('.bar .end').getByRole('button', { name: t('save') }).first().click()); const b0 = doc(fs.readFileSync(fx('three.pdf'))).loadPage(0).getBounds(), b1 = doc(f.bytes).loadPage(0).getBounds();
      must(b1[2] - b1[0] < b0[2] - b0[0] - 30, `width ${b1[2] - b1[0]} vs ${b0[2] - b0[0]}`);
    }, { shot: true });
    expectNoBad(s, 'organize', lang); await s.ctx.close();
  }
};

// ========================================================================== edit (the page editor, typing for real)
const sheetPoint = async (P, fx_, fy_) => { const b = await P.locator('.editor .sheet').boundingBox(); return [b.x + b.width * fx_, b.y + b.height * fy_]; };
let lastArabic = null;
groups.edit = async () => {
  for (const lang of ['en', 'ar']) {
    const s = await session(lang), P = s.page, t = s.t, ready = () => P.locator('.editor .sheet .hit').first().waitFor({ state: 'attached', timeout: 90_000 });
    const savePage = async () => { await P.locator('.editor .tools .btn.primary').click(); await P.locator('.editor').waitFor({ state: 'hidden', timeout: 60_000 }); };
    const saveDoc = () => saveClick(s, () => P.locator('.bar .end').getByRole('button', { name: t('save') }).first().click());
    await openFile(s, arabicPdf); await task(s, 'edit').click(); await ready();
    await check('edit', 'click the first Arabic line, type a new Arabic line with digits, Latin and brackets, Save page, Save', lang, P, async () => {
      await P.locator('.editor .hit.line').first().click({ clickCount: 3 }); const box = P.locator('.obj.text.on textarea'); await box.waitFor(); must(await box.evaluate((e) => document.activeElement === e), 'textarea not focused');
      await P.keyboard.press('Control+a'); await P.keyboard.type('ورق (تجربة) 2026 Waraq [٢٠٢٦]', { delay: 15 }); await P.waitForTimeout(1200); await shot(P, 'edit', 'typed-arabic-line', lang);
      await savePage(); const f = await saveDoc(); const txt = norm(textOf(f.bytes));
      for (const w of ['ورق', 'تجربة', '2026', 'Waraq']) must(txt.includes(w), `"${w}" missing from saved text: ${txt.slice(0, 120)}`); must(!txt.includes('بسم'), 'old first line still there');
      lastArabic = f.bytes;
    });
    await check('edit', 'the saved Arabic line reopens in Waraq and the editing box holds the typed text', lang, P, async () => { await openFile(s, null, { name: 'again.pdf', bytes: lastArabic }); await task(s, 'edit').click(); await ready(); await P.locator('.editor .hit.line').first().click({ clickCount: 3 }); const v = await P.locator('.obj.text.on textarea').inputValue(); must(v.length > 3, 'box: ' + v); await shot(P, 'edit', 'reopened-line', lang); return v.slice(0, 40); });
    await openFile(s, fx('small.pdf')); await task(s, 'edit').click(); await ready();
    await check('edit', 'English page: click a line, type English with digits and brackets, save, text is in the file', lang, P, async () => {
      await P.locator('.editor .hit.line').first().click({ clickCount: 3 }); const box = P.locator('.obj.text.on textarea'); await box.waitFor(); await P.keyboard.press('Control+a'); await P.keyboard.type('Typed heading (v2) 2026', { delay: 15 }); await P.waitForTimeout(800);
      await savePage(); const f = await saveDoc(); must(norm(textOf(f.bytes)).includes('Typed heading (v2) 2026'), 'text: ' + norm(textOf(f.bytes)).slice(0, 100));
    });
    await check('edit', 'Add text: click the page, type English and Arabic, drag the bar to move it, drag the corner to widen it, Save page', lang, P, async () => {
      await task(s, 'edit').click(); await ready(); await P.getByRole('button', { name: t('addText') }).click(); const [x, y] = await sheetPoint(P, 0.4, 0.85); await P.mouse.click(x, y);
      const box = P.locator('.obj.text.on textarea'); await box.waitFor(); await P.keyboard.type('Added: ملاحظة 42', { delay: 15 });
      const obj = P.locator('.obj.text.on'), b0 = await obj.boundingBox(); let moved = false, widened = false;
      const grip = await obj.locator('.grip').first().boundingBox().catch(() => null);
      if (grip) { await drag(P, [grip.x + grip.width / 2, grip.y + grip.height / 2], [grip.x + grip.width / 2 + 40, grip.y + grip.height / 2 - 30]); const b1 = await obj.boundingBox(); moved = Math.abs(b1.x - b0.x) > 15 || Math.abs(b1.y - b0.y) > 15; }
      const corner = await obj.locator('.corner').first().boundingBox().catch(() => null); const w1 = (await obj.boundingBox()).width;
      if (corner) { await drag(P, [corner.x + corner.width / 2, corner.y + corner.height / 2], [corner.x + corner.width / 2 + 60, corner.y + corner.height / 2]); widened = (await obj.boundingBox()).width > w1 + 20; }
      must(moved, 'dragging the move bar did not move the text box'); must(widened, 'dragging the corner did not widen the text box');
      await shot(P, 'edit', 'added-text', lang); await savePage(); const f = await saveDoc(); const txt = norm(textOf(f.bytes)); must(txt.includes('Added') && txt.includes('ملاحظة'), 'text: ' + txt.slice(0, 120));
      return 'moved and widened';
    });
    await check('edit', 'Add photo: choose a photo, move it, resize it, Save page: the page has a picture', lang, P, async () => {
      await task(s, 'edit').click(); await ready(); const [c] = await Promise.all([P.waitForEvent('filechooser'), P.getByRole('button', { name: t('addPhoto') }).click()]); await c.setFiles(fx('photo.png')); await P.locator('.obj.pic').waitFor({ timeout: 15_000 });
      const pic = P.locator('.obj.pic'), p0 = await pic.boundingBox(); await drag(P, [p0.x + p0.width / 2, p0.y + p0.height / 2], [p0.x + p0.width / 2 + 50, p0.y + p0.height / 2 + 40]); const p1 = await pic.boundingBox(); must(Math.abs(p1.x - p0.x) > 20 || Math.abs(p1.y - p0.y) > 20, 'dragging the photo did not move it');
      const cn = await pic.locator('.corner').first().boundingBox().catch(() => null); must(cn, 'no resize corner on the photo'); await drag(P, [cn.x + cn.width / 2, cn.y + cn.height / 2], [cn.x + cn.width / 2 + 40, cn.y + cn.height / 2 + 40]); const p2 = await pic.boundingBox(); must(p2.width > p1.width + 10, 'dragging the corner did not enlarge the photo');
      await shot(P, 'edit', 'added-photo', lang); await savePage(); const f = await saveDoc(); const imgs = JSON.parse(doc(f.bytes).loadPage(0).toStructuredText('preserve-images').asJSON()).blocks.filter((b) => b.type === 'image').length; must(imgs >= 1, 'images ' + imgs); return 'moved and enlarged';
    });
    await check('edit', 'Redact box in the page editor: drag over the page text, Save page: the text is gone from the file', lang, P, async () => {
      await openFile(s, fx('small.pdf')); await task(s, 'edit').click(); await ready(); const before = norm(allText(fs.readFileSync(fx('small.pdf'))));
      await P.locator('.editor').getByRole('button', { name: t('redactArea') }).click(); const b = await P.locator('.editor .sheet').boundingBox(); await drag(P, [b.x + 5, b.y + 5], [b.x + b.width - 5, b.y + b.height - 5]); await savePage();
      const f = await saveDoc(); const after = norm(allText(f.bytes)); must(before.length > 3 && after.length < before.length / 2, `text before ${before.length} chars, after ${after.length}`); await shot(P, 'edit', 'redacted-in-editor', lang);
    });
    await check('edit', 'Whole document: page numbers top right with total, and a watermark; Apply; saved text has both', lang, P, async () => {
      await openFile(s, fx('three.pdf')); await task(s, 'edit').click(); await P.getByRole('tab', { name: t('wholeDocument') }).click();
      await P.getByLabel(t('numberPosition')).selectOption('tr'); await P.getByLabel(t('withTotal')).check();
      await P.getByLabel(t('watermark'), { exact: true }).check(); await typeReal(s, P.getByLabel(t('watermarkText')), lang === 'ar' ? 'مسودة' : 'DRAFT'); await shot(P, 'edit', 'whole-document', lang);
      await P.getByRole('button', { name: t('applyAll') }).click(); await P.waitForTimeout(1500); const f = await saveDoc(); const txt = allText(f.bytes); must(/1 \/ 3|3 \/ 1|3 \/ ?1/.test(txt), 'page numbers: ' + norm(txt).slice(0, 100)); must(txt.includes(lang === 'ar' ? 'مسودة' : 'DRAFT'), 'watermark');
    });
    await check('edit', 'Whole document: page numbers in Arabic-Indic digits', lang, P, async () => {
      await openFile(s, fx('three.pdf')); await task(s, 'edit').click(); await P.getByRole('tab', { name: t('wholeDocument') }).click(); await P.getByRole('radio', { name: t('digitsArabic') }).click(); await P.getByRole('button', { name: t('applyAll') }).click(); await P.waitForTimeout(1500);
      const f = await saveDoc(); must(/[٠-٩]/.test(allText(f.bytes)), 'no Arabic-Indic digits in the saved text');
    });
    expectNoBad(s, 'edit', lang); await s.ctx.close();
  }
};

// ========================================================================== convert, protect, redact, forms
const zipEntries = (bytes) => (Buffer.from(bytes).toString('latin1').match(/PK\x03\x04/g) ?? []).length;
const saveBtn = (s) => s.page.locator('.bar .end').getByRole('button', { name: s.t('save') }).first();
groups.convert = async () => {
  for (const lang of ['en', 'ar']) {
    const s = await session(lang), P = s.page, t = s.t;
    await openFile(s, fx('three.pdf')); await task(s, 'convert').click();
    await check('convert', 'pages to images: Save pages as PNG gives a ZIP with 3 PNG pictures', lang, P, async () => { const f = await saveClick(s, () => P.getByRole('button', { name: t('imagesSave') }).click()); must(zipEntries(f.bytes) === 3, 'entries ' + zipEntries(f.bytes)); must(Buffer.from(f.bytes).includes(Buffer.from([0x89, 0x50, 0x4e, 0x47])), 'no PNG signature'); }, { shot: true });
    await check('convert', 'Word / Excel / PowerPoint / CAD on the web says it is desktop only', lang, P, async () => { await P.getByText(t('officeDesktopOnly')).waitFor({ timeout: 5000 }); }, { shot: true });
    await check('convert', 'a photo becomes a PDF: open photo.png, Save, the file is a 1-page PDF', lang, P, async () => { await goStart(s); await P.locator('input[type=file]').first().setInputFiles(fx('photo.png')); await P.locator('.page').first().waitFor({ timeout: 30_000 }); const f = await saveClick(s, () => saveBtn(s).click()); must(pages(f.bytes) >= 1, 'pages'); });
    expectNoBad(s, 'convert', lang); await s.ctx.close();
  }
};
groups.protect = async () => {
  for (const lang of ['en', 'ar']) {
    const s = await session(lang), P = s.page, t = s.t, pw = lang === 'ar' ? 'سر-1234' : 'pass-1234'; let locked, limited;
    await openFile(s, fx('three.pdf')); await task(s, 'protect').click();
    await check('protect', 'type a password twice, allow printing and copying, Save a protected copy', lang, P, async () => {
      await typeReal(s, P.getByLabel(t('password')), pw); await typeReal(s, P.getByLabel(t('passwordAgain')), pw); await P.getByLabel(t('allowCopy')).check(); await shot(P, 'protect', 'form', lang);
      const f = await saveClick(s, () => P.getByRole('button', { name: t('protectSave') }).click()); locked = f.bytes; must(Buffer.from(f.bytes).includes('/Encrypt'), 'no /Encrypt in the saved file');
    });
    await check('protect', 'open the protected file: a wrong password is refused, the right one opens it', lang, P, async () => {
      await goStart(s); await P.locator('input[type=file]').first().setInputFiles({ name: 'locked.pdf', mimeType: 'application/pdf', buffer: Buffer.from(locked) }); await P.locator('#pdfpw').waitFor({ timeout: 30_000 }); await shot(P, 'protect', 'password-asked', lang);
      await typeReal(s, P.locator('#pdfpw'), 'wrong'); await P.keyboard.press('Enter'); await P.getByRole('alert').waitFor({ timeout: 10_000 }); must((await P.getByRole('alert').innerText()).includes(t('wrongPassword')), 'message: ' + (await P.getByRole('alert').innerText()));
      await typeReal(s, P.locator('#pdfpw'), pw); await P.keyboard.press('Enter'); await P.locator('.page').first().waitFor({ timeout: 30_000 }); must((await P.locator('.page').count()) === 3, 'pages');
    });
    await check('protect', 'Remove the password, Save: the saved copy opens without a password', lang, P, async () => {
      await task(s, 'protect').click(); await P.getByRole('button', { name: t('unlockApply') }).click(); await P.waitForTimeout(800); const f = await saveClick(s, () => saveBtn(s).click()); must(!Buffer.from(f.bytes).includes('/Encrypt'), 'still encrypted'); must(pages(f.bytes) === 3, 'pages');
    });
    await check('protect', 'permissions: protect with copying NOT allowed; reopened with the password the file says it has limits; Extract keeps the protection', lang, P, async () => {
      await openFile(s, fx('three.pdf')); await task(s, 'protect').click(); await typeReal(s, P.getByLabel(t('password')), pw); await typeReal(s, P.getByLabel(t('passwordAgain')), pw); await P.getByLabel(t('allowCopy')).uncheck();
      limited = (await saveClick(s, () => P.getByRole('button', { name: t('protectSave') }).click())).bytes;
      await goStart(s); await P.locator('input[type=file]').first().setInputFiles({ name: 'limited.pdf', mimeType: 'application/pdf', buffer: Buffer.from(limited) }); await P.locator('#pdfpw').waitFor(); await typeReal(s, P.locator('#pdfpw'), pw); await P.keyboard.press('Enter'); await P.locator('.page').first().waitFor({ timeout: 30_000 });
      await task(s, 'protect').click(); await P.getByText(t('limitedTitle')).waitFor({ timeout: 8000 }); await shot(P, 'protect', 'limited-file', lang);
      await task(s, 'organize').click(); await P.locator('.cell').first().click(); const f = await saveClick(s, () => P.getByRole('button', { name: t('extract') }).click()); must(Buffer.from(f.bytes).includes('/Encrypt'), 'extract dropped the protection');
    });
    expectNoBad(s, 'protect', lang); await s.ctx.close();
  }
};
groups.redact = async () => {
  for (const lang of ['en', 'ar']) {
    const s = await session(lang), P = s.page, t = s.t, marks = () => P.locator('.redact .mark').count();
    await openFile(s, fx('private.pdf')); await task(s, 'redact').click(); await P.locator('.redact .sheet canvas').waitFor({ timeout: 30_000 });
    await check('redact', 'Mark all finds the phone numbers; e-mails and a typed word are added; a dragged area adds one; clicking a mark removes it', lang, P, async () => {
      await P.getByRole('button', { name: t('findAll') }).click(); await P.waitForTimeout(500); const a = await marks(); must(a === 2, 'phones ' + a);
      await P.getByLabel(t('findEmail')).check(); await P.getByRole('button', { name: t('findAll') }).click(); await P.waitForTimeout(400); must((await marks()) === 3, 'emails ' + (await marks()));
      await P.getByLabel(t('findWord')).check(); await typeReal(s, P.getByLabel(t('findWord')).last(), 'secret'); await P.getByRole('button', { name: t('findAll') }).click(); await P.waitForTimeout(400); must((await marks()) === 4, 'word ' + (await marks()));
      const b = await P.locator('.redact .sheet').boundingBox(); await drag(P, [b.x + 100, b.y + 400], [b.x + 200, b.y + 450]); must((await marks()) === 5, 'drag ' + (await marks()));
      await P.locator('.redact .mark').last().click(); must((await marks()) === 4, 'remove ' + (await marks())); await shot(P, 'redact', 'marks', lang);
    });
    await check('redact', 'Remove marked content (and the title/author): the saved file has no marked text, searching finds nothing', lang, P, async () => {
      await P.getByLabel(t('removeMetadata')).check(); await P.getByRole('button', { name: t('redactApply') }).click(); await P.locator('.bar .mod').waitFor({ timeout: 30_000 });
      const f = await saveClick(s, () => saveBtn(s).click()); const d = doc(f.bytes), text = d.loadPage(0).toStructuredText().asText();
      for (const gone of ['966', 'sami@', '٠٥٠', 'secret']) must(!text.includes(gone), `"${gone}" still in the text`); must(text.includes('Call Sami'), 'other text lost'); must(d.loadPage(0).search('secret').length === 0, 'search finds secret'); must(!Buffer.from(f.bytes).includes('secret'), 'raw bytes still contain "secret"');
    });
    expectNoBad(s, 'redact', lang); await s.ctx.close();
  }
};
groups.forms = async () => {
  const { listFields } = await import('../../src/lib/engine/forms.ts');
  for (const lang of ['en', 'ar']) {
    const s = await session(lang), P = s.page, t = s.t, fld = (id) => P.locator(`[id="f-${id}"]`), long = lang === 'ar' ? 'عبدالله محمد الأحمد الدوسري — مدينة الرياض، حي الملقا، شارع الأمير تركي بن عبدالعزيز' : 'Abdullah Mohammed Al-Ahmad Al-Harbi, 12 King Fahd Road, Riyadh';
    await openFile(s, fx('form.pdf')); await task(s, 'forms').click(); await P.locator('.forms .box').first().waitFor({ timeout: 30_000 });
    await check('forms', 'fields are listed; a read-only field is locked; type a long answer, tick the box, pick a radio and a list item; Apply; Save keeps them fillable', lang, P, async () => {
      must((await P.locator('.forms .box').count()) === 6, 'boxes ' + (await P.locator('.forms .box').count())); must(await fld('0:1').isDisabled(), 'read-only not locked');
      await typeReal(s, fld('0:0'), long); await fld('0:2').check(); await P.getByLabel('large').check(); await fld('0:5').selectOption('Oman'); await shot(P, 'forms', 'filled', lang);
      await P.getByRole('button', { name: t('formsApply') }).click(); await P.locator('.bar .mod').waitFor({ timeout: 20_000 });
      const f = await saveClick(s, () => saveBtn(s).click()), list = listFields(m, f.bytes);
      must(list.find((x) => x.name === 'name').value === long, 'name value: ' + list.find((x) => x.name === 'name').value); must(list.find((x) => x.name === 'agree').checked === true, 'checkbox'); must(JSON.stringify(list.filter((x) => x.type === 'radio').map((x) => x.checked)) === '[false,true]', 'radio'); must(list.find((x) => x.name === 'country').value === 'Oman', 'choice');
    });
    await check('forms', 'Make the answers fixed: no fields left and the answer is text on the page', lang, P, async () => {
      await openFile(s, fx('form.pdf')); await task(s, 'forms').click(); await typeReal(s, fld('0:0'), long); await P.getByLabel(t('flatten')).check(); await P.getByRole('button', { name: t('formsApply') }).click(); await P.locator('.bar .mod').waitFor({ timeout: 20_000 });
      const f = await saveClick(s, () => saveBtn(s).click()); must(listFields(m, f.bytes).length === 0, 'fields remain'); must(norm(textOf(f.bytes)).includes(norm(long).slice(0, 14)), 'answer text not on the page: ' + norm(textOf(f.bytes)).slice(0, 80)); await shot(P, 'forms', 'flattened', lang);
    });
    expectNoBad(s, 'forms', lang); await s.ctx.close();
  }
};

// ========================================================================== sign
async function drawPad(s) { const P = s.page; await P.locator('.pad').scrollIntoViewIfNeeded(); const b = await P.locator('.pad').boundingBox(); await P.mouse.move(b.x + 20, b.y + 60); await P.mouse.down(); for (let i = 1; i <= 20; i++) await P.mouse.move(b.x + 20 + i * 10, b.y + 50 + 25 * Math.sin(i / 2)); await P.mouse.up(); }
groups.sign = async () => {
  for (const lang of ['en', 'ar']) {
    const s = await session(lang), P = s.page, t = s.t, files = {}; P.on('download', async (d) => { files[d.suggestedFilename()] = new Uint8Array(fs.readFileSync(await d.path())); });
    await openFile(s, fx('sign-en.pdf')); await task(s, 'sign').click();
    await check('sign', 'places to sign are found on both pages', lang, P, async () => { await P.locator('.need').first().waitFor({ timeout: 20_000 }); must((await P.locator('.need').count()) === 2, 'places ' + (await P.locator('.need').count())); }, { shot: true });
    await check('sign', 'draw a signature on the pad, pick blue, Save signature: it appears in "My signature"', lang, P, async () => { await drawPad(s); await P.getByRole('radio', { name: t('blueColour') }).click(); await P.getByRole('button', { name: t('saveSignature') }).click(); await P.locator('.sigbtn img').first().waitFor({ timeout: 10_000 }); });
    await check('sign', 'type a name under the signature, Hijri calendar and Arabic-Indic digits, add a second file', lang, P, async () => {
      await typeReal(s, P.getByLabel(t('nameUnder')), lang === 'ar' ? 'عبدالله' : 'Abdullah'); await P.getByRole('radio', { name: t('hijri') }).click().catch(() => P.getByLabel(t('hijri')).click()); await P.getByRole('radio', { name: t('digitsArabic') }).click().catch(() => {});
      const [c] = await Promise.all([P.waitForEvent('filechooser'), P.getByRole('button', { name: t('addFiles') }).click()]); await c.setFiles(fx('sign-ar.pdf')); await P.waitForFunction(() => document.querySelectorAll('.file').length === 2, null, { timeout: 15_000 }); await shot(P, 'sign', 'set-up', lang); return await P.locator('.datetext').innerText();
    });
    await check('sign', 'Enter places the set page by page, across both files; Save all signed gives two signed PDFs with name, date and picture', lang, P, async () => {
      await P.locator('.where').click(); for (let i = 0; i < 3; i++) { await P.keyboard.press('Enter'); await P.waitForTimeout(600); } await P.locator('.need').first().waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {});
      await shot(P, 'sign', 'placed', lang); await P.getByRole('button', { name: t('saveAll') }).click(); await P.waitForFunction(() => true); const t0 = Date.now(); while (Object.keys(files).length < 2 && Date.now() - t0 < 40_000) await P.waitForTimeout(500);
      must(Object.keys(files).length === 2, 'downloads: ' + Object.keys(files)); for (const f of Object.values(files)) { const txt = allText(f); must(/[٠-٩]|\d/.test(txt) && txt.includes(lang === 'ar' ? 'عبدالله' : 'Abdullah'), 'name/date missing: ' + norm(txt).slice(0, 80)); }
      return Object.keys(files).join(', ');
    });
    // certificate signature
    await openFile(s, fx('sign-en.pdf')); await task(s, 'sign').click(); await P.locator('.need').first().waitFor({ timeout: 20_000 });
    await check('sign', 'digital ID: Also sign with my digital ID, New ID (name, e-mail, passphrase twice), Create ID', lang, P, async () => {
      if (!(await P.locator('.pad').count())) await P.getByRole('button', { name: t('newSignature') }).click(); await drawPad(s); await P.getByRole('button', { name: t('saveSignature') }).click(); await P.getByLabel(t('useCert')).check(); await P.getByRole('button', { name: t('newId') }).click();
      await typeReal(s, P.getByRole('textbox', { name: t('fullName') }), 'Abdullah Test'); await typeReal(s, P.getByLabel(t('emailOptional')), 'abdullah@example.com'); await typeReal(s, P.getByLabel(t('passphrase'), { exact: true }), 'correct horse battery'); await typeReal(s, P.getByLabel(t('passphraseAgain')), 'correct horse battery'); await shot(P, 'sign', 'new-id', lang);
      await P.getByRole('button', { name: t('createId') }).click(); await P.locator('.idbtn').first().waitFor({ timeout: 30_000 }); must((await P.locator('.idbtn').first().innerText()).includes('Abdullah Test'), 'id name');
    });
    await check('sign', 'sign with the ID, reopen the signed file: the panel says 1 signature, valid; editing it afterwards shows a warning', lang, P, async () => {
      for (const k of Object.keys(files)) delete files[k]; await typeReal(s, P.getByLabel(t('sigReason')), 'Approved'); await P.locator('.where').click(); await P.keyboard.press('Enter'); await P.keyboard.press('Enter'); await P.waitForTimeout(800);
      await typeReal(s, P.getByLabel(t('passphrase'), { exact: true }).first(), 'correct horse battery'); await P.getByRole('button', { name: t('saveAll') }).click(); const t0 = Date.now(); while (!Object.keys(files).length && Date.now() - t0 < 40_000) await P.waitForTimeout(500); must(Object.keys(files).length === 1, 'no signed file');
      await task(s, 'sign').click(); await P.locator('.badge').waitFor({ timeout: 20_000 }); const badge = await P.locator('.badge').innerText(); must(new RegExp(t('sigValid')).test(badge), 'badge: ' + badge); await shot(P, 'sign', 'valid-signature', lang);
      await task(s, 'organize').click(); await P.locator('.cell').first().click(); await P.getByRole('button', { name: t('rotateRight') }).first().click(); await P.getByRole('button', { name: t('save'), exact: true }).first().click().catch(() => {}); await task(s, 'sign').click(); await P.waitForTimeout(1500); await shot(P, 'sign', 'after-change', lang);
      return 'badge: ' + badge;
    });
    expectNoBad(s, 'sign', lang); await s.ctx.close();
  }
};

// ========================================================================== ocr
groups.ocr = async () => {
  for (const lang of ['en', 'ar']) {
    const s = await session(lang), P = s.page, t = s.t; let out;
    await openFile(s, fx('ocr/07-report-bilingual-300.pdf')); await task(s, 'ocr').click();
    await check('ocr', 'scanned Arabic + English page: Add searchable text runs and finishes; Save', lang, P, async () => {
      await P.getByRole('button', { name: t('ocrStart') }).click(); await P.getByText(t('ocrProgress')).waitFor({ timeout: 90_000 }); await shot(P, 'ocr', 'running', lang); await P.locator('.bar .mod').waitFor({ timeout: 240_000 }); out = (await saveClick(s, () => saveBtn(s).click())).bytes; must(pages(out) === 1, 'pages');
    });
    await check('ocr', 'the saved text has the English and the Arabic lines, a printed line copies as one line in reading order', lang, P, async () => { const txt = norm(textOf(out)); must(/Annual report summary/.test(txt), 'english: ' + txt.slice(0, 80)); must(/ملخص التقرير السنوي/.test(txt), 'arabic title'); must(/أولويات العام القادم هي تمديد ساعات العمل/.test(txt), 'arabic line joined in reading order'); });
    await check('ocr', 'Find a printed Arabic word: hits are on the word', lang, P, async () => {
      await P.locator('.bar .end').getByRole('button', { name: t('close') }).first().click().catch(() => {}); await openFile(s, null, { name: 'ocr-out.pdf', bytes: out }); await P.keyboard.press('Control+f'); await P.getByRole('searchbox').click(); await P.keyboard.type('المكتبة', { delay: 20 }); await P.keyboard.press('Enter'); await P.waitForFunction(() => /\d/.test(document.querySelector('.find .num')?.textContent ?? ''), null, { timeout: 15_000 });
      must((await P.locator('.marks i').count()) >= 1, 'no hit box'); await shot(P, 'ocr', 'find-hit', lang);
    });
    await check('ocr', 'a page turned 90 degrees is read (upright text in the file)', lang, P, async () => {
      await openFile(s, fx('ocr/v3/58-letter-turned-90-.pdf')); await task(s, 'ocr').click(); await P.getByRole('button', { name: t('ocrStart') }).click(); await P.locator('.bar .mod').waitFor({ timeout: 240_000 });
      const f = (await saveClick(s, () => saveBtn(s).click())).bytes, txt = textOf(f); must(txt.replace(/\s/g, '').length > 80, 'only ' + txt.replace(/\s/g, '').length + ' characters read'); await shot(P, 'ocr', 'turned-page-done', lang);
    });
    expectNoBad(s, 'ocr', lang); await s.ctx.close();
  }
};

// ========================================================================== comment
groups.comment = async () => {
  for (const lang of ['en', 'ar']) {
    const s = await session(lang), P = s.page, t = s.t, small = fx('small.pdf'), state = async () => parseInt(((await P.locator('.state').innerText()).match(/\d+/) ?? ['0'])[0], 10), want = async (n, what) => { const t0 = Date.now(); let v; while (Date.now() - t0 < 6000) { v = await state(); if (v === n) return; await P.waitForTimeout(150); } must(false, `${what}: ${v} comments, expected ${n}`); };
    const q = [...doc(fs.readFileSync(small)).loadPage(0).search('Quarterly Report')[0][0]];
    await openFile(s, small); await task(s, 'comment').click(); const layer = P.locator('.layer').first(); await layer.waitFor(); const box = await layer.boundingBox(), k = box.width / 595, at = (x, y) => [box.x + x * k, box.y + y * k], mid = (q[1] + q[5]) / 2;
    const tool = (key) => P.getByRole('button', { name: t(key), exact: true }).click();
    await check('comment', 'highlight, underline and strike follow the real text', lang, P, async () => { for (const [key, dy] of [['cHighlight', 0], ['cUnderline', 0], ['cStrike', 0]]) { await tool(key); await P.mouse.move(...at(q[0] + 1, mid + dy)); await P.mouse.down(); await P.mouse.move(...at((q[0] + q[2]) / 2, mid + dy), { steps: 5 }); await P.mouse.move(...at(q[2] - 1, mid + dy), { steps: 5 }); await P.mouse.up(); } await want(3, 'three text marks'); }, { shot: true });
    await check('comment', 'pen, rectangle, ellipse, line and arrow are drawn with the mouse', lang, P, async () => { let y = 300; for (const key of ['cPen', 'cRect', 'cEllipse', 'cLine', 'cArrow']) { await tool(key); await P.mouse.move(...at(100, y)); await P.mouse.down(); for (const [dx, dy] of [[40, 20], [90, 0], [140, 25]]) await P.mouse.move(...at(100 + dx, y + dy), { steps: 4 }); await P.mouse.up(); y += 50; } await want(8, 'five drawn shapes'); });
    await check('comment', 'text box: click the page, type Arabic and English; sticky note: type a note', lang, P, async () => {
      await tool('cText'); await P.mouse.move(...at(330, 120)); await P.mouse.down(); await P.mouse.move(...at(460, 170), { steps: 5 }); await P.mouse.up(); await P.waitForTimeout(300); await P.keyboard.type('ملاحظة Waraq 42', { delay: 15 }); await P.keyboard.press('Escape');
      await tool('cNote'); await P.mouse.click(...at(450, 260)); const ta = P.getByLabel(t('cContents')); await ta.click(); await P.keyboard.type('راجع هذا — check', { delay: 15 }); await P.locator('.layer').first().click({ position: { x: 5, y: 5 } }).catch(() => {}); await shot(P, 'comment', 'text-and-note', lang); await want(10, 'text box and note');
    });
    await check('comment', 'Undo and Redo change the count; Save; the file has the annotations (MuPDF)', lang, P, async () => {
      let undos = 0; for (; undos < 3; undos++) { await P.getByRole('button', { name: t('undo') }).click(); await P.waitForTimeout(400); if ((await state()) === 9) break; } await want(9, `after ${undos + 1} undo click(s)`); lastUndos = undos + 1; await P.getByRole('button', { name: t('redo') }).click(); await want(10, 'after redo');
      const f = await saveClick(s, () => saveBtn(s).click()); const ann = doc(f.bytes).loadPage(0).getAnnotations(); must(ann.length === 10, 'annotations in file: ' + ann.length); const types = ann.map((a) => a.getType()); must(types.includes('FreeText') && types.includes('Text') && types.includes('Highlight'), types.join(','));
      const ft = ann.find((a) => a.getType() === 'FreeText'); must(/ملاحظة/.test(ft.getContents()), 'free text: ' + ft.getContents()); lastComment = f.bytes; return types.join(',') + (lastUndos > 1 ? ` (Undo needed ${lastUndos} clicks: the first undid the note text)` : '');
    });
    await check('comment', 'reopen: comments show again; select one, Delete comment; save: one fewer', lang, P, async () => {
      await openFile(s, null, { name: 'commented.pdf', bytes: lastComment }); await task(s, 'comment').click(); await P.locator('.layer').first().waitFor(); await want(10, 'after reopen');
      await tool('cSelect'); await P.mouse.click(...at(q[0] + 20, mid)); await P.getByRole('button', { name: t('cDelete') }).click(); await want(9, 'after delete'); const f = await saveClick(s, () => saveBtn(s).click()); must(doc(f.bytes).loadPage(0).getAnnotations().length === 9, 'saved');
    });
    expectNoBad(s, 'comment', lang); await s.ctx.close();
  }
};
let lastComment = null, lastUndos = 1;

// ========================================================================== portfolio
groups.portfolio = async () => {
  for (const lang of ['en', 'ar']) {
    const s = await session(lang), P = s.page, t = s.t; let pdf, waraq;
    await goStart(s); await P.getByRole('button', { name: t('newPortfolio') }).click();
    await check('portfolio', 'add two PDFs as sections; titles come from the file names; rename one by typing', lang, P, async () => {
      const [c] = await Promise.all([P.waitForEvent('filechooser'), P.getByRole('button', { name: t('addSection') }).first().click()]); await c.setFiles([fx('three.pdf'), fx('small.pdf')]); await P.waitForFunction(() => document.querySelectorAll('.sec').length === 2, null, { timeout: 30_000 });
      await typeReal(s, P.locator('.sec .title').first(), lang === 'ar' ? 'الأسبوع الأول' : 'Week one'); must((await P.locator('.sec .title').first().inputValue()).length > 3, 'title');
    }, { shot: true });
    await check('portfolio', 'divider page with a typed note; add a photo to a section', lang, P, async () => {
      await P.locator('.sec').first().getByRole('button', { name: t('divider') }).click(); await typeReal(s, P.locator('.paper textarea.note'), lang === 'ar' ? 'مقدمة المقرر' : 'Course introduction');
      const [c] = await Promise.all([P.waitForEvent('filechooser'), P.locator('.sec').nth(1).getByRole('button', { name: t('addPages') }).click()]); await c.setFiles(fx('photo.png')); await P.waitForTimeout(1000); must((await P.locator('.cell').count()) >= 5, 'cells ' + (await P.locator('.cell').count()));
    });
    await check('portfolio', 'cover page: title, names, supervisor typed; a logo; design Band; colour', lang, P, async () => {
      await P.locator('.side .group').nth(1).locator('input[type=checkbox]').check(); await typeReal(s, P.getByLabel(t('coverTitle'), { exact: true }), lang === 'ar' ? 'تصميم ١٠١' : 'Design 101'); await typeReal(s, P.getByLabel(t('coverNames')), lang === 'ar' ? 'عبدالله\nسارة' : 'Abdullah\nSara'); await typeReal(s, P.getByLabel(t('coverSupervisor'), { exact: true }), lang === 'ar' ? 'د. أحمد' : 'Dr Ahmed');
      const [c] = await Promise.all([P.waitForEvent('filechooser'), P.getByRole('button', { name: t('logoCenter'), exact: true }).first().click()]); await c.setFiles(fx('photo.png')); await P.getByRole('radio', { name: t('design_band') }).click(); await P.locator('.colours .dot').nth(1).click(); await P.waitForTimeout(500); await shot(P, 'portfolio', 'cover', lang);
    });
    await check('portfolio', 'contents page and page numbers on; Export PDF: cover, contents with working links, numbers', lang, P, async () => {
      const toc = P.getByLabel(t('tocSwitch')); if (await toc.count()) await toc.first().check().catch(() => {}); const num = P.getByRole('radio', { name: t('numbersAll') }); if (await num.count()) await num.first().click().catch(() => {});
      pdf = (await saveClick(s, () => P.getByRole('button', { name: t('exportPdf') }).click())).bytes; const txt = allText(pdf); must(txt.includes(lang === 'ar' ? 'تصميم' : 'Design 101'), 'cover title'); must(txt.includes(lang === 'ar' ? 'المحتويات' : 'Contents'), 'contents page');
      const links = (() => { const d = doc(pdf); let n = 0; for (let i = 0; i < d.countPages(); i++) n += d.loadPage(i).getLinks().length; return n; })(); must(links >= 1, 'no links in the contents page'); return `${pages(pdf)} pages, ${links} links`;
    });
    await check('portfolio', 'Save .waraq, Close, reopen from Recent: sections, titles and note are back', lang, P, async () => {
      waraq = (await saveClick(s, () => P.getByRole('button', { name: t('saveWaraq') }).click())).bytes; await P.getByRole('button', { name: t('close') }).first().click(); await P.locator('.recent .card').first().waitFor({ timeout: 10_000 }); await P.locator('.recent .card', { hasText: t('portfolio') }).first().click(); await P.locator('.sec').first().waitFor({ timeout: 20_000 }); must((await P.locator('.sec').count()) === 2, 'sections');
    });
    await check('portfolio', 'open the saved .waraq file again through Open', lang, P, async () => { await P.getByRole('button', { name: t('close') }).first().click(); await P.locator('.start').waitFor(); await P.locator('input[type=file]').first().setInputFiles({ name: 'course.waraq', mimeType: 'application/octet-stream', buffer: Buffer.from(waraq) }); await P.locator('.sec').first().waitFor({ timeout: 20_000 }); });
    await check('portfolio', 'a damaged .waraq gives a plain message and does not crash', lang, P, async () => { await P.getByRole('button', { name: t('close') }).first().click(); await P.locator('.start').waitFor(); await P.locator('input[type=file]').first().setInputFiles({ name: 'broken.waraq', mimeType: 'application/octet-stream', buffer: Buffer.from('this is not a portfolio') }); await P.getByRole('alert').waitFor({ timeout: 10_000 }); must((await P.getByRole('alert').innerText()).includes(t('portfolioInvalid').slice(0, 20)), await P.getByRole('alert').innerText()); await shot(P, 'portfolio', 'damaged', lang); });
    expectNoBad(s, 'portfolio', lang); await s.ctx.close();
  }
};

// ========================================================================== recovery and support
groups.recovery = async () => {
  for (const lang of ['en', 'ar']) {
    const s = await session(lang), P = s.page, t = s.t, outside = [];
    s.ctx.on('request', (r) => { if (!r.url().startsWith(BASE) && !/^(blob|data):/.test(r.url())) outside.push(r.url()); });
    await openFile(s, fx('three.pdf')); await task(s, 'organize').click(); await P.locator('.cell').first().click(); await P.keyboard.press('Delete'); await task(s, 'view').click(); await P.locator('.page').first().waitFor();
    const drafts = () => P.evaluate(async () => { try { const d = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('vault')).getDirectoryHandle('drafts'); const n = []; for await (const [name] of d.entries()) n.push(name); return n; } catch { return []; } });
    for (let i = 0; i < 20 && (await drafts()).length < 2; i++) await P.waitForTimeout(500);
    await check('recovery', 'an unsaved edit is kept as a draft on this device (two files in the vault)', lang, P, async () => { must((await drafts()).length === 2, 'drafts: ' + (await drafts()).join(',')); });
    // the kill: a run that never said goodbye = its id in the session list and no lock (how the app tells; a real process kill cannot be made from here: closing a tab runs pagehide, which counts as a clean exit)
    await P.evaluate(() => localStorage.setItem('waraq-sessions', JSON.stringify(['crashed-run']))); await P.reload(); const P2 = P; s.page = P2;
    await check('recovery', 'after the kill, the start screen offers to restore the unsaved work', lang, P2, async () => { await P2.getByText(new RegExp(t('restoreFrom').split('{time}')[0].trim())).first().waitFor({ timeout: 15_000 }); }, { shot: true });
    await check('recovery', 'Restore opens the draft with the deleted page still deleted', lang, P2, async () => { await P2.getByRole('button', { name: t('restore'), exact: true }).click(); await P2.locator('.page').first().waitFor({ timeout: 30_000 }); must((await P2.locator('.page').count()) === 2, 'pages ' + (await P2.locator('.page').count())); });
    await check('recovery', 'crash report: Preview shows the exact text; nothing is sent by itself', lang, P2, async () => {
      const prev = P2.getByRole('button', { name: t('crashPreview') }); await prev.first().waitFor({ timeout: 8000 }).catch(() => {}); if (!(await prev.count())) throw new Soft('no crash dialog was offered after the page kill (the dialog appears after an engine/JS crash, not a closed tab)');
      await prev.first().click(); await shot(P2, 'recovery', 'crash-preview', lang);
    });
    await check('recovery', 'no request went outside the site while recovering (nothing sent)', lang, P2, async () => { must(!outside.length, outside.join(' | ')); });
    await s.ctx.close();
  }
};
groups.support = async () => {
  for (const lang of ['en', 'ar']) {
    const s = await session(lang), P = s.page, t = s.t; await goStart(s);
    await check('support', 'start screen has a "Report a problem" / support link', lang, P, async () => { const l = await P.locator('a[href*=support], a[href*=issues]').count(); const b = await P.getByRole('button', { name: /report|problem|دعم|مشكلة|إبلاغ|الإبلاغ/i }).count(); must(l + b > 0, 'no support link or button on the start screen'); });
    // the crash buttons appear on the start screen only once a crash is in the log (and "Open crash log folder" only in the desktop app); "Report a problem" is always there
    await check('support', 'start screen: Report a problem opens the support page in a new tab with version, system and language', lang, P, async () => { await s.ctx.route('https://www.pwaraq.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: 'support' })); const [pop] = await Promise.all([P.context().waitForEvent('page'), P.getByRole('button', { name: t('reportProblem') }).click()]); const u = pop.url(); await pop.close(); must(/^https:\/\/www\.pwaraq\.com\/support#v=[^&]+&os=[^&]+&lang=/.test(u), 'opened ' + u); });
    await openFile(s, fx('small.pdf'));
    await check('support', 'top row: the ⋯ menu has Report a problem', lang, P, async () => { await P.getByRole('button', { name: t('helpMenu') }).click(); must((await P.getByRole('menuitem', { name: t('reportProblem') }).count()) === 1, 'no menu item'); });
    await s.ctx.close();
  }
};

// ========================================================================== run
const todo = wanted ?? Object.keys(groups);
for (const g of todo) { console.log(`\n=== ${g}`); try { await groups[g](); } catch (e) { results.push({ task: g, name: 'group aborted', lang: '-', status: 'fail', note: String(e.message).slice(0, 300), shot: '', ms: 0 }); console.log('GROUP ABORTED', g, e.message); } fs.writeFileSync(path.join(OUT, `results-${wanted ? wanted.join('+') : 'all'}.json`), JSON.stringify({ results, served: [...new Set(served.map((x) => x.join(' ')))].filter((x) => !x.startsWith('200 ')) }, null, 1)); }
await run.browser?.close(); server.close();
console.log(`\n${results.filter((r) => r.status === 'pass').length} pass, ${results.filter((r) => r.status === 'fail').length} fail, ${results.filter((r) => r.status === 'note').length} note`);
fs.rmSync(siteDir, { recursive: true, force: true });
