// Second opinion on the saved pages of audit-edit.mjs, in headless Edge (1366×768): pdf.js (../waraq/dist/vendor, the
// reader Waraq 0.3 ships) opens each file, reads the text back and renders the new line; the browser draws the intended
// string in the very font bytes the line was written with (reference); the three pictures (MuPDF, pdf.js, reference)
// are compared by ink overlap, and a side-by-side strip per edit is written for the report.
//   node tools/arabic/audit-browser.mjs [--out tests/audit-arabic/out]
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { chromium } from '@playwright/test';
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';

const ROOT = path.join(import.meta.dirname, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = path.resolve(ROOT, arg('--out', 'tests/audit-arabic/out')), VENDOR = path.join(ROOT, '..', 'waraq', 'dist', 'vendor');
const data = JSON.parse(fs.readFileSync(path.join(OUT, 'results.json'), 'utf8'));
fs.mkdirSync(path.join(OUT, 'strip'), { recursive: true });

const PAGE = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff">
<script type="module">
import * as pdfjs from '/vendor/pdf.min.mjs';
pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.mjs';
const faces = new Map();
async function face(file) { if (!faces.has(file)) { const f = new FontFace('ref-' + file, 'url(/out/fonts/' + file + ')'); await f.load(); document.fonts.add(f); faces.set(file, true); } return 'ref-' + file; }
const png = (c) => c.toDataURL('image/png');
window.audit = async (r) => {
  const out = { pdfjs: {} };
  try {
    const t0 = performance.now(), doc = await pdfjs.getDocument({ url: '/out/' + r.id + '.pdf', useSystemFonts: false, disableFontFace: false }).promise;
    const page = await doc.getPage(1), vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    out.pdfjs.text = tc.items.map((i) => i.str).join(' ');
    // the items of the new line: transform[5] is the baseline in PDF space (y up)
    const base = vp.height - r.before.base;
    out.pdfjs.line = tc.items.filter((i) => Math.abs(i.transform[5] - base) < r.before.size * 0.6 && i.str.trim()).map((i) => i.str).join(' ');
    if (r.newLineBox) {
      const [x0, y0, x1, y1] = r.newLineBox, s = 4, c = document.createElement('canvas');
      c.width = Math.round((x1 - x0) * s); c.height = Math.round((y1 - y0) * s);
      const v = page.getViewport({ scale: s, offsetX: -x0 * s, offsetY: -y0 * s });
      await page.render({ canvasContext: c.getContext('2d'), viewport: v, background: '#fff' }).promise;
      out.pdfjs.png = png(c);
    }
    out.pdfjs.ms = Math.round(performance.now() - t0);
    await doc.destroy();
  } catch (e) { out.pdfjs.error = String(e?.message ?? e); }
  // reference: the intended text in the same font bytes, same size, at 4× — as the browser (HarfBuzz + Skia) shapes it
  try {
    const fam = await face(r.font.file), s = 4, size = r.edit.size * s, c = document.createElement('canvas'), ctx = c.getContext('2d');
    ctx.font = (r.font.bold && r.drawn?.fakeBold ? 'bold ' : '') + size + 'px "' + fam + '"';
    const w = Math.ceil(ctx.measureText(r.intended).width) + 2 * size;
    c.width = w; c.height = Math.ceil(size * 2.2);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.font = (r.font.bold && r.drawn?.fakeBold ? 'bold ' : '') + size + 'px "' + fam + '"'; ctx.fillStyle = '#000'; ctx.direction = r.before.rtl ? 'rtl' : 'ltr'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(r.intended, size, Math.round(size * 1.4));
    out.ref = { png: png(c), width: ctx.measureText(r.intended).width / s };
  } catch (e) { out.ref = { error: String(e?.message ?? e) }; }
  return out;
};
window.strip = async (urls, labels) => { // before / MuPDF / pdf.js / reference, one under the other, labelled
  const imgs = await Promise.all(urls.map((u) => new Promise((res) => { if (!u) return res(null); const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = u; })));
  const W = Math.min(1400, Math.max(...imgs.map((i) => i?.width ?? 0), 300)), rows = imgs.map((i) => i ? Math.round(i.height * Math.min(1, W / i.width)) + 18 : 30);
  const c = document.createElement('canvas'); c.width = W; c.height = rows.reduce((a, b) => a + b, 0);
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  let y = 0;
  imgs.forEach((i, k) => { ctx.fillStyle = '#15775d'; ctx.font = '12px Segoe UI'; ctx.textAlign = 'left'; ctx.direction = 'ltr'; ctx.fillText(labels[k], 4, y + 13); y += 18; if (i) { const sc = Math.min(1, W / i.width); ctx.drawImage(i, 0, y, i.width * sc, i.height * sc); y += Math.round(i.height * sc); } else { ctx.fillStyle = '#999'; ctx.fillText('(none)', 4, y + 10); y += 12; } });
  return png(c);
};
window.ready = true;
</script>`;
const MIME = { '.pdf': 'application/pdf', '.mjs': 'text/javascript', '.js': 'text/javascript', '.png': 'image/png', '.ttf': 'font/ttf', '.otf': 'font/otf', '.html': 'text/html' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const f = u === '/' ? null : u.startsWith('/vendor/') ? path.join(VENDOR, u.slice(8)) : u.startsWith('/out/') ? path.join(OUT, u.slice(5)) : null;
  if (!f) { res.setHeader('content-type', 'text/html; charset=utf-8'); return res.end(PAGE); }
  if (!fs.existsSync(f)) { res.statusCode = 404; return res.end(); }
  res.setHeader('content-type', MIME[path.extname(f)] ?? 'application/octet-stream'); res.end(fs.readFileSync(f));
}).listen(0);
const port = server.address().port;

// ---- ink comparison (PNG → pixels with MuPDF) ----
function ink(png) {
  const img = new m.Image(png), pix = img.toPixmap(), w = pix.getWidth(), h = pix.getHeight(), n = pix.getNumberOfComponents(), p = pix.getPixels();
  const dark = new Uint8Array(w * h);
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * n; if (p[i] < 140 || p[i + 1] < 140 || p[i + 2] < 140) { dark[y * w + x] = 1; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
  pix.destroy(); img.destroy();
  if (x1 < 0) return null;
  return { dark, w, h, box: [x0, y0, x1 + 1, y1 + 1] };
}
/** Overlap (intersection / union) of two ink pictures scaled to the same height, at the best horizontal shift. */
function overlap(a, b) {
  if (!a || !b) return { iou: 0, widthRatio: 0 };
  const H = 40, ah = a.box[3] - a.box[1], bh = b.box[3] - b.box[1], ka = H / ah, kb = H / bh;
  const aw = Math.round((a.box[2] - a.box[0]) * ka), bw = Math.round((b.box[2] - b.box[0]) * kb);
  const sample = (s, k, w) => { const o = new Uint8Array(w * H); for (let y = 0; y < H; y++) for (let x = 0; x < w; x++) { const sx = s.box[0] + Math.floor(x / k), sy = s.box[1] + Math.floor(y / k); o[y * w + x] = s.dark[sy * s.w + sx]; } return o; };
  const A = sample(a, ka, aw), B = sample(b, kb, bw);
  let best = 0;
  for (let shift = -Math.round(Math.abs(aw - bw) / 2) - 2; shift <= Math.round(Math.abs(aw - bw) / 2) + 2; shift++) {
    let inter = 0, union = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < Math.max(aw, bw); x++) { const va = x < aw ? A[y * aw + x] : 0, xb = x - shift, vb = xb >= 0 && xb < bw ? B[y * bw + xb] : 0; inter += va & vb; union += va | vb; }
    best = Math.max(best, union ? inter / union : 0);
  }
  return { iou: +best.toFixed(3), widthRatio: +((a.box[2] - a.box[0]) / ka / ((b.box[2] - b.box[0]) / kb) * (ah / bh)).toFixed(3) };
}
const fromDataUrl = (u) => new Uint8Array(Buffer.from(u.split(',')[1], 'base64'));

const browser = await chromium.launch({ channel: 'msedge' }), page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
page.on('console', (msg) => { if (msg.type() === 'warning' || msg.type() === 'error') (page._warnings ??= []).push(msg.text().slice(0, 160)); });
await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => window.ready);
const out = {};
let n = 0;
for (const r of data.results) {
  if (r.error || !r.font) continue;
  page._warnings = [];
  const res = await page.evaluate((r) => window.audit(r), r);
  res.pdfjs.warnings = [...new Set(page._warnings)].slice(0, 3);
  const norm = (s) => s.normalize('NFKC').replace(/\s+/g, ' ').trim();
  res.pdfjs.pageHas = !!res.pdfjs.text && norm(res.pdfjs.text).includes(norm(r.intended));
  res.pdfjs.lineOk = !!res.pdfjs.line && norm(res.pdfjs.line) === norm(r.intended);
  // pdf.js gives one item per text object; letters in reading order with the spaces dropped is what a fair copy would give
  const letters = (s) => norm(s).replace(/\s+/g, '');
  res.pdfjs.lettersOk = !!res.pdfjs.line && letters(res.pdfjs.line) === letters(r.intended);
  res.pdfjs.lettersReversed = !!res.pdfjs.line && [...letters(res.pdfjs.line)].reverse().join('') === letters(r.intended);
  res.pdfjs.junk = res.pdfjs.line ? [...new Set([...res.pdfjs.line].filter((c) => !/[\s؀-ۿݐ-ݿﭐ-ﻼA-Za-z0-9\p{P}\p{S}]/u.test(c)))].join('') : '';
  // ink comparison: MuPDF's new line vs the reference, vs pdf.js
  const mupdfPng = fs.existsSync(path.join(OUT, 'img', r.id + '-newline.png')) ? fs.readFileSync(path.join(OUT, 'img', r.id + '-newline.png')) : null;
  const inkM = mupdfPng ? ink(new Uint8Array(mupdfPng)) : null, inkRef = res.ref?.png ? ink(fromDataUrl(res.ref.png)) : null, inkJ = res.pdfjs.png ? ink(fromDataUrl(res.pdfjs.png)) : null;
  res.compare = { mupdfVsRef: overlap(inkM, inkRef), pdfjsVsRef: overlap(inkJ, inkRef), mupdfVsPdfjs: overlap(inkM, inkJ), inkMupdf: !!inkM, inkPdfjs: !!inkJ, refWidth: res.ref?.width, lineWidth: r.after?.w };
  if (res.pdfjs.png) fs.writeFileSync(path.join(OUT, 'img', r.id + '-pdfjs.png'), fromDataUrl(res.pdfjs.png));
  if (res.ref?.png) fs.writeFileSync(path.join(OUT, 'img', r.id + '-ref.png'), fromDataUrl(res.ref.png));
  const pdfium = fs.existsSync(path.join(OUT, 'img', r.id + '-pdfium.png'));
  const strip = await page.evaluate(({ urls, labels }) => window.strip(urls, labels), {
    urls: [`/out/img/${r.id}-before.png`, `/out/img/${r.id}-mupdf.png`, res.pdfjs.png ?? null, pdfium ? `/out/img/${r.id}-pdfium.png` : null, res.ref?.png ?? null],
    labels: ['before (MuPDF)', 'after — MuPDF (Waraq)', 'after — pdf.js (new line)', 'after — PDFium (new line)', 'reference — browser, same font bytes'] });
  fs.writeFileSync(path.join(OUT, 'strip', r.id + '.png'), fromDataUrl(strip));
  delete res.pdfjs.png; delete res.ref?.png;
  out[r.id] = res;
  if (++n % 100 === 0) console.log(n, 'done');
}
fs.writeFileSync(path.join(OUT, 'browser.json'), JSON.stringify(out, null, 1));
await browser.close(); server.close();
const vals = Object.values(out);
console.log(`${vals.length} checked in pdf.js: opens ${vals.filter((v) => !v.pdfjs.error).length}, page has text ${vals.filter((v) => v.pdfjs.pageHas).length}, line exact ${vals.filter((v) => v.pdfjs.lineOk).length}, ink vs reference ≥ 0.6: ${vals.filter((v) => v.compare.mupdfVsRef.iou >= 0.6).length}`);
