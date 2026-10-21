// Typed signature: the canvas recipe of Sign.svelte (italic 700 160px Tajawal, 1400x320) for Arabic names -> PNG
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module'; import { pathToFileURL } from 'node:url';
import { ROOT, SHOTS, T } from './lib.mjs';
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('@playwright/test');
const names = ['عبدالله محمد الأحمد', T.tashkeel, 'محمد Al-Ahmad ٢٠٢٦', T.persian, 'ب', 'لا', 'عبدالله محمد الأحمد الحربي الشمري الدوسري القحطاني الغامدي'];
const tj = pathToFileURL(path.join(ROOT, 'public/fonts/Tajawal-Bold.ttf')).href;
const html = `<meta charset=utf-8><style>@font-face{font-family:Tajawal;font-weight:700;src:url(${tj})}body{margin:8px;background:#fff}</style><body></body>`;
const b = await chromium.launch({ channel: 'msedge', headless: true }), p = await b.newPage({ viewport: { width: 1420, height: 1500 } });
const tmp = path.join(process.env.TEMP, 'typed-sig.html'); fs.writeFileSync(tmp, html); await p.goto(pathToFileURL(tmp).href); await p.evaluate(() => document.fonts.load('700 160px Tajawal'));
await p.evaluate((names) => { for (const t of names) { const c = document.createElement('canvas'); c.width = 1400; c.height = 200; c.style.cssText = 'display:block;border-bottom:1px solid #ccc'; const x = c.getContext('2d'); x.font = 'italic 700 160px Tajawal'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(t.trim(), 700, 100, 1360); document.body.append(c); } }, names);
fs.mkdirSync(path.join(SHOTS, 'sign'), { recursive: true });
await p.screenshot({ path: path.join(SHOTS, 'sign', 'typed-signature-canvas.png'), fullPage: true }); await b.close(); console.log('ok');
