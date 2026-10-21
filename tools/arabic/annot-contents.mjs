// What pdf.js (and MuPDF) read as the /Contents of each comment: the note text that readers show in popups / comment lists.
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http'; import { createRequire } from 'node:module';
import { ROOT, OUT, T, m } from './lib.mjs';
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('@playwright/test');
const vendor = path.resolve(ROOT, '../waraq/dist/vendor');
const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url); if (u.includes('favicon')) { r.statusCode = 404; return r.end(); } const f = u === '/' ? null : u.startsWith('/v/') ? path.join(vendor, u.slice(3)) : path.join(OUT, u.slice(1)); if (!f) { r.setHeader('content-type', 'text/html'); return r.end('<meta charset=utf-8>'); } r.setHeader('content-type', u.endsWith('.mjs') ? 'text/javascript' : 'application/pdf'); r.end(fs.readFileSync(f)); }).listen(0);
const base = 'http://127.0.0.1:' + srv.address().port, b = await chromium.launch({ channel: 'msedge', headless: true }), p = await b.newPage(); await p.goto(base + '/');
const got = await p.evaluate(async (base) => { const pdfjs = await import(base + '/v/pdf.min.mjs'); pdfjs.GlobalWorkerOptions.workerSrc = base + '/v/pdf.worker.min.mjs'; const d = await pdfjs.getDocument(base + '/comment.pdf').promise; const out = []; for (let i = 1; i <= d.numPages; i++) for (const a of await (await d.getPage(i)).getAnnotations()) out.push([i - 1, a.subtype, a.contentsObj?.str ?? a.contents ?? '']); return out; }, base);
await b.close(); srv.close();
const man = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest-comment.json'), 'utf8'));
const want = new Set(man.flatMap((x) => [...x.expect, ...x.notes]));
let ok = 0, bad = []; for (const [pg, st, s] of got) { if (want.has(s)) ok++; else bad.push([pg, st, s.slice(0, 30)]); }
console.log('pdf.js annotations:', got.length, 'contents exactly as written:', ok, 'other:', JSON.stringify(bad.slice(0, 5)));
