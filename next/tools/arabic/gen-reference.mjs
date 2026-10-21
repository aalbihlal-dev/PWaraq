// Control: the same scenarios printed to PDF by Edge itself (HTML + Tajawal) — what a good producer's output looks like to
// MuPDF / pdf.js / PDFium, so a consumer's own limits can be told from Waraq's defects. -> tests/fixtures/arabic-create/reference.pdf
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module'; import { pathToFileURL } from 'node:url';
import { ROOT, OUT, T } from './lib.mjs';
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('@playwright/test');
const ks = ['pure', 'mixed', 'indic', 'tashkeel', 'lamalef', 'parens', 'persian', 'latin', 'one'];
const font = pathToFileURL(path.join(ROOT, 'public/fonts/Tajawal-Regular.ttf')).href, nas = pathToFileURL(path.join(ROOT, 'public/fonts/NotoNaskhArabic-Regular.ttf')).href;
const html = `<meta charset=utf-8><style>@font-face{font-family:Tj;src:url(${font})}@font-face{font-family:Nk;src:url(${nas})}body{font:16px Tj,Nk;margin:40px}div{margin:0 0 24px;direction:rtl;text-align:right}</style>` + ks.map((k) => `<div>${T[k]}</div>`).join('');
const b = await chromium.launch({ channel: 'msedge', headless: true }), p = await b.newPage();
await p.setContent(html); await p.evaluate(() => document.fonts.ready); await p.pdf({ path: path.join(OUT, 'reference.pdf'), format: 'A4' });
await b.close();
fs.writeFileSync(path.join(OUT, 'manifest-reference.json'), JSON.stringify([{ writer: 'reference', file: 'reference.pdf', page: 0, label: 'edge-print', expect: ks.map((k) => T[k]) }], null, 1));
console.log('reference.pdf', fs.statSync(path.join(OUT, 'reference.pdf')).size);
