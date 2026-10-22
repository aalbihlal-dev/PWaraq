// debug: print the ToUnicode CMaps of a PDF.  node tools/arabic/dbg-tounicode.mjs file.pdf
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import fs from 'node:fs';
const d = new m.PDFDocument(new Uint8Array(fs.readFileSync(process.argv[2])));
for (let i = 1; i < d.countObjects(); i++) { const o = d.newIndirect(i, 0); if (!o.isStream()) continue; const s = o.readStream().asString(); if (/beginbfchar|beginbfrange/.test(s)) console.log('obj', i, s.slice(0, +(process.argv[3] ?? 1500))); }
