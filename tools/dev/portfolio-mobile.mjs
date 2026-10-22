// The Portfolio journey on phones and tablets: Playwright device emulation with touch (taps, touch drags) on the BUILT app served under /app/ with the
// website's CSP, like tools/dev/full-test.mjs. WebKit is not installed here, so Chromium (Edge) runs with each device's viewport, user agent, scale and touch.
//   corepack pnpm build:site && node tools/dev/portfolio-mobile.mjs [--out <folder>] [--devices "iPhone 14,iPad (gen 7)"]
// At every step it records: content outside the screen sideways, controls under 44 px, text cut off, horizontal page scroll, console errors, and a screenshot.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';

const ROOT = path.resolve(import.meta.dirname, '..', '..'), SITE = process.env.WARAQ_SITE ?? path.resolve(ROOT, '..', 'waraq-site-1.0'), DIST = path.join(ROOT, 'dist-app');
const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const OUT = path.resolve(arg('--out', path.resolve(ROOT, '..', 'Archive-2026-10-12', 'screenshots', 'portfolio-mobile')));
const { chromium, devices } = createRequire(path.join(ROOT, 'package.json'))('@playwright/test');
fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });
const fx = (f) => path.join(ROOT, 'tests', 'fixtures', f);

// ---- the site as published + the fresh app under app/, with _redirects and _headers
const STAGE = fs.existsSync(path.join(SITE, '.stage')) ? path.join(SITE, '.stage') : SITE, siteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waraq-site-'));
fs.cpSync(STAGE, siteDir, { recursive: true, filter: (s) => !/[\\/](app|publish|tools|\.git)$/.test(s) && !/[\\/](publish|\.git)[\\/]/.test(s) && !(fs.statSync(s).isFile() && fs.statSync(s).size > 5 * 1024 * 1024) });
fs.cpSync(DIST, path.join(siteDir, 'app'), { recursive: true });
const lines = (f) => (fs.existsSync(path.join(STAGE, f)) ? fs.readFileSync(path.join(STAGE, f), 'utf8').split(/\r?\n/) : []);
const esc = (x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
const redirects = lines('_redirects').filter((l) => l.trim() && !l.startsWith('#')).map((l) => l.trim().split(/\s+/)).map(([from, to, st]) => ({ re: new RegExp('^' + esc(from).replace(/\*/g, '(.*)').replace(':splat', '$1') + '$'), to, status: +(st ?? 301) }));
const blocks = []; { let cur = null; for (const l of lines('_headers')) { if (!l.trim() || l.startsWith('#')) continue; if (/^\S/.test(l)) { cur = { re: new RegExp('^' + esc(l.trim()).replace(/\*/g, '.*') + '$'), h: [] }; blocks.push(cur); } else { const i = l.indexOf(':'); cur?.h.push([l.slice(0, i).trim(), l.slice(i + 1).trim()]); } } }
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.traineddata': 'application/octet-stream', '.gz': 'application/gzip' };
const server = http.createServer((req, res) => {
  let url = decodeURIComponent((req.url ?? '/').split('?')[0]); const rd = redirects.find((r) => r.re.test(url));
  if (rd) { if (rd.status === 301 || rd.status === 302) { res.statusCode = rd.status; res.setHeader('location', rd.to); return res.end(); } url = url.replace(rd.re, rd.to); }
  if (!path.extname(url) && !url.endsWith('/') && fs.existsSync(path.join(siteDir, url + '.html'))) url += '.html';
  let file = path.join(siteDir, url.endsWith('/') ? url + 'index.html' : url), st = 200;
  if (!file.startsWith(siteDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { st = 404; file = path.join(siteDir, '404.html'); if (!fs.existsSync(file)) { res.statusCode = 404; return res.end('Not found'); } }
  for (const b of blocks) if (b.re.test(url)) for (const [k, v] of b.h) res.setHeader(k, v);
  res.statusCode = st; res.setHeader('content-type', MIME[path.extname(file)] ?? 'application/octet-stream'); res.end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const APP = `http://127.0.0.1:${server.address().port}/app/`, BASE = new URL(APP).origin;
const strings = new Function('return {' + fs.readFileSync(path.join(ROOT, 'src/lib/i18n.svelte.ts'), 'utf8').split('const strings = {')[1].split('} satisfies')[0] + '}')();

// ---- what to measure after every step
function measure() {
  const vw = innerWidth, vh = innerHeight, vis = (e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0'; };
  const sel = 'button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=radio], [role=menuitem], summary';
  const nm = (e) => (e.getAttribute('aria-label') || e.getAttribute('title') || e.innerText || e.id || e.className || e.tagName).toString().replace(/\s+/g, ' ').trim().slice(0, 32);
  const all = [...document.querySelectorAll(sel)].filter(vis);
  // a control inside a sideways-scrolling strip is reachable by scrolling it: still reported, flagged
  const strip = (e) => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if ((o === 'auto' || o === 'scroll') && p.scrollWidth > p.clientWidth + 1) return true; } return false; };
  const outside = all.filter((e) => { const r = e.getBoundingClientRect(); return r.right > vw + 1 || r.left < -1; }).map((e) => ({ name: nm(e), x: Math.round(e.getBoundingClientRect().left), w: Math.round(e.getBoundingClientRect().width), scrollable: strip(e) }));
  const small = all.filter((e) => { const r = e.getBoundingClientRect(); return (r.width < 44 || r.height < 44) && r.left >= -1 && r.right <= vw + 1 && !(e.type === "checkbox" || e.type === "radio"); }).map((e) => ({ name: nm(e), w: Math.round(e.getBoundingClientRect().width), h: Math.round(e.getBoundingClientRect().height) }));
  const cut = [...document.querySelectorAll('h1, h2, h3, label, span, p, strong, .title, .name, button')].filter((e) => vis(e) && e.children.length === 0 && e.scrollWidth > e.clientWidth + 2 && ['hidden', 'clip'].includes(getComputedStyle(e).overflowX) && getComputedStyle(e).textOverflow !== 'ellipsis').map((e) => nm(e));
  return { vw, vh, hscroll: document.documentElement.scrollWidth > vw + 1 ? document.documentElement.scrollWidth - vw : 0, outside, smallCount: small.length, small: small.slice(0, 8), cut: cut.slice(0, 6), cells: [...document.querySelectorAll('.cell')].filter(vis).map((e) => Math.round(e.getBoundingClientRect().width)), side: (() => { const s = document.querySelector('.side'); if (!s || !vis(s)) return null; const r = s.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; })() };
}

const LIST = [['iPhone SE', 'iPhone SE'], ['iPhone 14', 'iPhone 14'], ['iPad (gen 7) portrait', 'iPad (gen 7)'], ['iPad (gen 7) landscape', 'iPad (gen 7) landscape'], ['iPad Pro 11 landscape', 'iPad Pro 11 landscape']];
const only = arg('--devices', '').split(',').filter(Boolean), todo = LIST.filter(([n]) => !only.length || only.includes(n));
const results = []; let shotN = 0;
const slug = (s) => s.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 40);
const browser = await chromium.launch({ channel: 'msedge' });
const must = (c, msg) => { if (!c) throw new Error(msg); };
const norm = (s) => s.normalize('NFKC').replace(/\s+/g, ' ').trim();

for (const [label, key] of todo) for (const lang of ['en', 'ar']) {
  const { defaultBrowserType, ...dev } = devices[key], t = (k) => strings[k][lang === 'ar' ? 1 : 0];
  const ctx = await browser.newContext({ ...dev, locale: lang === 'ar' ? 'ar-SA' : 'en-US', acceptDownloads: true });
  await ctx.addInitScript(([l]) => { try { if (!sessionStorage.getItem('pm-init')) { localStorage.setItem('waraq-lang', l); sessionStorage.setItem('pm-init', '1'); } } catch {} }, [lang]);
  const P = await ctx.newPage(), errors = []; let pdf, waraq;
  P.on('console', (msg) => { if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) errors.push(msg.text().slice(0, 140)); });
  P.on('pageerror', (e) => errors.push('pageerror: ' + String(e.message).slice(0, 120)));
  P.on('response', (r) => { if (r.status() >= 400 && !/brand-mark/.test(r.url())) errors.push(`${r.status()} ${r.url().replace(BASE, '')}`); });
  const vp = P.viewportSize();
  /** one step: act, then measure; `fn` may throw (the step failed) */
  async function step(name, fn, o = {}) {
    let status = 'pass', note = '';
    try { note = (await fn()) ?? ''; } catch (e) { status = e.soft ? 'NOTE' : 'FAIL'; note = String(e.message).split('\n')[0].slice(0, 200); }
    await P.waitForTimeout(350);
    let mz = {}; try { mz = await P.evaluate(measure); } catch (e) { mz = { err: String(e.message).slice(0, 80) }; }
    const f = `${String(++shotN).padStart(3, '0')}-${slug(label)}-${lang}-${slug(name)}.png`; await P.screenshot({ path: path.join(OUT, 'shots', f) }).catch(() => {});
    const errs = errors.splice(0);
    results.push({ device: label, lang, step: name, status, note, shot: 'shots/' + f, vw: mz.vw, vh: mz.vh, hscroll: mz.hscroll, outside: mz.outside, smallCount: mz.smallCount, small: mz.small, cut: mz.cut, cells: mz.cells, side: mz.side, errors: errs });
    console.log(`${status === 'pass' ? 'ok  ' : status} [${label} ${lang}] ${name}${note ? ' — ' + note : ''} | outside ${mz.outside?.length ?? '?'} small ${mz.smallCount ?? '?'} hscroll ${mz.hscroll ?? '?'}${errs.length ? ' ERR ' + errs[0] : ''}`);
    return status === 'pass';
  }
  const tap = async (loc) => { await loc.scrollIntoViewIfNeeded().catch(() => {}); await loc.tap(); };
  const typeInto = async (loc, text) => { await tap(loc); await P.keyboard.press('Control+a'); await P.keyboard.type(text, { delay: 10 }); };
  const download = async (click) => { const [d] = await Promise.all([P.waitForEvent('download', { timeout: 90_000 }), click()]); return new Uint8Array(fs.readFileSync(await d.path())); };
  const chooser = async (click, files) => { const [c] = await Promise.all([P.waitForEvent('filechooser', { timeout: 15_000 }), click()]); await c.setFiles(files); };
  const cdp = await ctx.newCDPSession(P);
  const touchDrag = async (from, to, hold = 0) => { const pt = (x, y) => [{ x, y, id: 1 }]; await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(from.x, from.y) }); if (hold) await P.waitForTimeout(hold); for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(from.x + ((to.x - from.x) * i) / 8, from.y + ((to.y - from.y) * i) / 8) }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };

  await P.goto(APP); await P.locator('.start').waitFor({ timeout: 60_000 });
  await step('start screen', async () => `${vp.width}x${vp.height}`);
  await step('New portfolio (tap)', async () => { await tap(P.getByRole('button', { name: t('newPortfolio') })); await P.locator('.empty, .sec').first().waitFor({ timeout: 30_000 }); });
  await step('add two PDFs as sections', async () => { await chooser(() => tap(P.getByRole('button', { name: t('addSection') }).first()), [fx('three.pdf'), fx('small.pdf')]); await P.waitForFunction(() => document.querySelectorAll('.sec').length === 2, null, { timeout: 30_000 }); });
  await step('rename the first section (tap, type)', async () => { await typeInto(P.locator('.sec .title').first(), lang === 'ar' ? 'الأسبوع الأول' : 'Week one'); must((await P.locator('.sec .title').first().inputValue()).length > 3, 'title not typed'); });
  await step('reorder: Move section down / up buttons', async () => { const first = async () => (await P.locator('.sec .title').first().inputValue()); const a = await first(); await tap(P.getByRole('button', { name: t('moveDown') }).first()); await P.waitForTimeout(400); const b = await first(); must(a !== b, 'order did not change after Move down'); await tap(P.getByRole('button', { name: t('moveUp') }).nth(1)); await P.waitForTimeout(400); must((await first()) === a, 'Move up did not restore'); });
  await step('reorder: touch drag of a section handle', async () => {
    const handles = P.locator('.sec [title="' + t('dragSection') + '"], .sec .grab, .sec [aria-label="' + t('dragSection') + '"]'); const n = await handles.count(); must(n >= 2, 'no drag handles found (' + n + ')');
    await handles.nth(1).scrollIntoViewIfNeeded(); const h1 = await handles.nth(1).boundingBox(), h0 = await handles.nth(0).boundingBox(); const before = await P.locator('.sec .title').evaluateAll((e) => e.map((x) => x.value));
    await touchDrag({ x: h1.x + h1.width / 2, y: h1.y + h1.height / 2 }, { x: h0.x + h0.width / 2, y: h0.y + 2 }, 700); await P.waitForTimeout(500); const after = await P.locator('.sec .title').evaluateAll((e) => e.map((x) => x.value)); if (JSON.stringify(before) === JSON.stringify(after)) throw Object.assign(new Error('a long-press touch drag of the grip (HTML5 drag and drop, draggable=true) did not reorder; emulated touch cannot start HTML5 drag, real iOS Safari needs a long press: not verifiable here, the Move up / down buttons work'), { soft: true });
  });
  await step('divider page with a typed note', async () => { await tap(P.locator('.sec').first().getByRole('button', { name: t('divider') })); await typeInto(P.locator('.paper textarea.note'), lang === 'ar' ? 'مقدمة المقرر' : 'Course introduction'); });
  await step('add a photo to a section', async () => { await chooser(() => tap(P.locator('.sec').nth(1).getByRole('button', { name: t('addPages') })), fx('photo.png')); await P.waitForTimeout(1200); must((await P.locator('.cell').count()) >= 5, 'cells ' + (await P.locator('.cell').count())); });
  await step('page grid: cards visible and usable', async () => { const w = await P.locator('.cell').evaluateAll((e) => e.filter((x) => x.offsetParent).map((x) => Math.round(x.getBoundingClientRect().width))); must(w.length >= 4, 'cards visible: ' + w.length); must(Math.min(...w) >= 60, 'a card is only ' + Math.min(...w) + ' px wide'); return `${w.length} cards, ${Math.min(...w)}-${Math.max(...w)} px`; });
  await step('cover page: switch on, title, names, supervisor', async () => {
    { const sw = P.locator('.side .group').nth(1).locator('input[type=checkbox]'); if (!(await sw.isChecked())) await tap(sw); } await typeInto(P.getByLabel(t('coverTitle'), { exact: true }), lang === 'ar' ? 'تصميم ١٠١' : 'Design 101'); await typeInto(P.getByLabel(t('coverNames')), lang === 'ar' ? 'عبدالله\nسارة' : 'Abdullah\nSara'); await typeInto(P.getByLabel(t('coverSupervisor'), { exact: true }), lang === 'ar' ? 'د. أحمد' : 'Dr Ahmed');
  });
  await step('cover page: logo, design Band, a colour', async () => { await chooser(() => tap(P.getByRole('button', { name: t('logoCenter'), exact: true }).first()), fx('photo.png')); await tap(P.getByRole('radio', { name: t('design_band') })); await tap(P.locator('.colours .dot').nth(1)); });
  await step('contents page and page numbers', async () => { const toc = P.getByLabel(t('tocSwitch')); if (await toc.count() && !(await toc.first().isChecked().catch(() => true))) await tap(toc.first()); const num = P.getByRole('radio', { name: t('numbersAll') }); if (await num.count()) await tap(num.first()); });
  await step('Export PDF (download, open with MuPDF)', async () => {
    pdf = await download(() => tap(P.getByRole('button', { name: t('exportPdf') }))); const d = m.Document.openDocument(pdf, 'application/pdf'); let txt = '', links = 0; for (let i = 0; i < d.countPages(); i++) { const pg = d.loadPage(i); txt += pg.toStructuredText('preserve-whitespace').asText(); links += pg.getLinks().length; }
    must(norm(txt).includes(lang === 'ar' ? 'تصميم' : 'Design 101'), 'cover title missing'); must(norm(txt).includes(lang === 'ar' ? 'المحتويات' : 'Contents'), 'contents page missing'); return `${d.countPages()} pages, ${links} links`;
  });
  await step('Save .waraq (download)', async () => { waraq = await download(() => tap(P.getByRole('button', { name: t('saveWaraq') }))); must(waraq.length > 1000, 'file too small'); });
  await step('Close, then reopen the portfolio from Recent (tap)', async () => { await tap(P.getByRole('button', { name: t('close') }).first()); await P.locator('.recent .card').first().waitFor({ timeout: 15_000 }); await tap(P.locator('.recent .card', { hasText: t('portfolio') }).first()); await P.locator('.sec').first().waitFor({ timeout: 20_000 }); must((await P.locator('.sec').count()) === 2, 'sections ' + (await P.locator('.sec').count())); });
  await ctx.close();
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
}
await browser.close(); server.close(); fs.rmSync(siteDir, { recursive: true, force: true });
console.log(`\n${results.filter((r) => r.status === 'pass').length} steps pass, ${results.filter((r) => r.status !== 'pass').length} fail, ${results.length} total`);
