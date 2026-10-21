// pdf.js (the copy Waraq 0.3.3 ships, ../waraq/dist/vendor) in Edge: renders pages to PNG and reads the text it extracts;
// and Edge's built-in PDF viewer (PDFium) as a screenshot, plus what Ctrl+A / Ctrl+C copies from it.
// usage: node tools/arabic/browser.mjs <name> [pdfjs|edge|both] [scale]
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { ROOT, OUT, SHOTS } from './lib.mjs';

const name = process.argv[2], mode = process.argv[3] ?? 'both', scale = +(process.argv[4] ?? 1.4);
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('@playwright/test');
const vendor = path.resolve(ROOT, '../waraq/dist/vendor'), res = path.join(ROOT, 'tests/audit-arabic/results'), shots = path.join(SHOTS, name);
fs.mkdirSync(shots, { recursive: true }); fs.mkdirSync(res, { recursive: true });
const pad = (n) => String(n).padStart(2, '0');

const mime = { '.mjs': 'text/javascript', '.js': 'text/javascript', '.pdf': 'application/pdf', '.html': 'text/html' };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  const f = u.startsWith('/vendor/') ? path.join(vendor, u.slice(8)) : u.startsWith('/pdf/') ? path.join(OUT, u.slice(5)) : null;
  if (u === '/') { r.setHeader('content-type', 'text/html'); return r.end('<!doctype html><meta charset=utf-8><body>'); }
  if (!f || !fs.existsSync(f)) { r.statusCode = 404; return r.end(); }
  r.setHeader('content-type', mime[path.extname(f)] ?? 'application/octet-stream'); r.end(fs.readFileSync(f));
}).listen(0);
const port = server.address().port, base = `http://127.0.0.1:${port}`;

const browser = await chromium.launch({ channel: 'msedge', headless: mode === 'pdfjs', args: ['--window-size=900,1250'] });
try {
  if (mode !== 'edge') {
    const page = await browser.newPage({ viewport: { width: 1000, height: 1000 } });
    await page.goto(base + '/');
    const out = await page.evaluate(async ({ base, name, scale }) => {
      const pdfjs = await import(base + '/vendor/pdf.min.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc = base + '/vendor/pdf.worker.min.mjs';
      const doc = await pdfjs.getDocument({ url: `${base}/pdf/${name}.pdf` }).promise, texts = [], pngs = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const p = await doc.getPage(i), vp = p.getViewport({ scale }), c = document.createElement('canvas');
        c.width = vp.width; c.height = vp.height;
        await p.render({ canvasContext: c.getContext('2d'), viewport: vp, background: 'white' }).promise;
        pngs.push(c.toDataURL('image/png'));
        const tc = await p.getTextContent();
        // pdf.js text items: join the way the viewer's copy does (hasEOL -> newline)
        texts.push(tc.items.map((it) => it.str + (it.hasEOL ? '\n' : '')).join(''));
      }
      return { texts, pngs };
    }, { base, name, scale });
    out.pngs.forEach((d, i) => fs.writeFileSync(path.join(shots, `pdfjs-p${pad(i)}.png`), Buffer.from(d.split(',')[1], 'base64')));
    fs.writeFileSync(path.join(res, `${name}.pdfjs.json`), JSON.stringify(out.texts, null, 1));
    console.log('pdf.js', out.texts.length, 'pages');
    await page.close();
  }
  if (mode !== 'pdfjs') {
    // Edge's viewer needs a headed window (file:// URL; #page=N shows page N at the top)
    const ctx = await browser.newContext({ viewport: null, permissions: ['clipboard-read', 'clipboard-write'] });
    const clip = await ctx.newPage();
    await clip.goto(base + '/');
    const n = JSON.parse(fs.readFileSync(path.join(OUT, `manifest-${name}.json`), 'utf8')).length, copied = [];
    for (let i = 0; i < n; i++) {
      const pdfPage = await ctx.newPage();
      await pdfPage.goto(pathToFileURL(path.join(OUT, name + '.pdf')).href + `#page=${i + 1}&toolbar=0&navpanes=0&view=Fit`);
      await pdfPage.waitForTimeout(2200);
      await pdfPage.screenshot({ path: path.join(shots, `edge-p${pad(i)}.png`) });
      if (i === 0) { // Ctrl+A in the viewer selects the whole document: copied once
        await pdfPage.mouse.click(40, 600); await pdfPage.keyboard.press('Control+a'); await pdfPage.keyboard.press('Control+c'); await pdfPage.waitForTimeout(400);
        await clip.bringToFront();
        copied.push(await clip.evaluate(() => navigator.clipboard.readText().catch((e) => 'ERR ' + e)));
      }
      await pdfPage.close();
    }
    fs.writeFileSync(path.join(res, `${name}.edgecopy.json`), JSON.stringify(copied, null, 1));
    console.log('edge viewer', n, 'pages');
  }
} finally { await browser.close(); server.close(); }
