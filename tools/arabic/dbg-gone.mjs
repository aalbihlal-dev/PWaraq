// debug: lines of a page before and after one audit edit (what vanished).  node tools/arabic/dbg-gone.mjs fixture.pdf edited.pdf
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import fs from 'node:fs';
import { pageObjects } from '../../src/lib/engine/editpage.ts';
const show = (f) => pageObjects(new m.PDFDocument(new Uint8Array(fs.readFileSync(f))).loadPage(0)).lines.map((l) => `${[l.x, l.y, l.w, l.h, l.base].map((v) => Math.round(v)).join(',')}  ${l.text.slice(0, 40)}`);
console.log('BEFORE\n' + show(process.argv[2]).join('\n') + '\nAFTER\n' + show(process.argv[3]).join('\n'));
