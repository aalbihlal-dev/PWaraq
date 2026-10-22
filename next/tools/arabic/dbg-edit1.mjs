// debug: replace the Nth lifted line of a PDF with "x" and list the OTHER lines whose text changed.  node tools/arabic/dbg-edit1.mjs in.pdf n
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import fs from 'node:fs';
import { own, fonts } from './lib.mjs';
import { editPage, pageObjects, BASELINE } from '../../src/lib/engine/editpage.ts';
const bytes = new Uint8Array(fs.readFileSync(process.argv[2])), n = +process.argv[3], page = new m.PDFDocument(bytes).loadPage(0), lines = pageObjects(page).lines, l = lines[n];
const edit = { kind: 'text', from: { x: l.x, y: l.y, w: l.w, h: l.h }, text: 'x', size: l.size, color: [...l.color], bold: l.bold, align: 'right', x: l.x, y: l.base - BASELINE * l.size, w: l.w, h: l.h };
const out = editPage(m, new m.PDFDocument(bytes), 0, [edit], [], () => fonts(), false, own), saved = out.saveToBuffer('garbage=compact').asUint8Array().slice();
const after = new Set(pageObjects(m.Document.openDocument(saved, 'application/pdf').loadPage(0)).lines.map((x) => x.text));
console.log('edited', JSON.stringify(l.text.slice(0, 30)), '\n' + lines.filter((x) => x !== l && !after.has(x.text)).map((x) => 'CHANGED ' + x.text.slice(0, 50)).join('\n'));
