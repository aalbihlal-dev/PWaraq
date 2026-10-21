// Document title as readers show it: Edge's PDF viewer (tab title) and pdf.js (info + XMP). usage: node tools/arabic/meta-readers.mjs <name>
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http'; import { createRequire } from 'node:module'; import { pathToFileURL } from 'node:url';
import { ROOT, OUT } from './lib.mjs';
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('@playwright/test'), name = process.argv[2] ?? 'portfolio', vendor = path.resolve(ROOT, '../waraq/dist/vendor');
const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url); if (u.includes('favicon')) { r.statusCode = 404; return r.end(); } if (u === '/') { r.setHeader('content-type', 'text/html'); return r.end('<meta charset=utf-8>'); } const f = u.startsWith('/v/') ? path.join(vendor, u.slice(3)) : path.join(OUT, u.slice(1)); r.setHeader('content-type', u.endsWith('.mjs') ? 'text/javascript' : 'application/pdf'); r.end(fs.readFileSync(f)); }).listen(0);
const base = 'http://127.0.0.1:' + srv.address().port, b = await chromium.launch({ channel: 'msedge', headless: false }), p = await b.newPage(); await p.goto(base + '/');
const js = await p.evaluate(async ({ base, name }) => { const pdfjs = await import(base + '/v/pdf.min.mjs'); pdfjs.GlobalWorkerOptions.workerSrc = base + '/v/pdf.worker.min.mjs'; const d = await pdfjs.getDocument(`${base}/${name}.pdf`).promise, md = await d.getMetadata(); return { infoTitle: md.info.Title, infoAuthor: md.info.Author, infoSubject: md.info.Subject, language: md.info.Language, displayDocTitle: md.contentDispositionFilename, xmpTitle: md.metadata?.get('dc:title'), xmpCreator: md.metadata?.get('dc:creator') }; }, { base, name });
console.log('pdf.js', JSON.stringify(js));
const v = await b.newPage(); await v.goto(pathToFileURL(path.join(OUT, name + '.pdf')).href); await v.waitForTimeout(3500);
console.log('Edge viewer tab title:', JSON.stringify(await v.title())); await b.close(); srv.close();
