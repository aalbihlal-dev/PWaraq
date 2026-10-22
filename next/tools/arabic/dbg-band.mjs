// debug: redact one rectangle on page 1 and list the lines that lose text.  node tools/arabic/dbg-band.mjs in.pdf x y w h
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import fs from 'node:fs';
const [, , f, x, y, w, h] = process.argv, d = new m.PDFDocument(new Uint8Array(fs.readFileSync(f))), p = d.loadPage(0);
const txt = (pg) => pg.toStructuredText('preserve-whitespace').asText().split('\n');
const before = txt(p); p.createAnnotation('Redact').setRect([+x, +y, +x + +w, +y + +h]); p.applyRedactions(false, 0, 0, 0);
const after = new Set(txt(p)); console.log(before.filter((l) => l.trim() && !after.has(l)).map((l) => 'CHANGED: ' + l.slice(0, 70)).join('\n') || 'nothing');
