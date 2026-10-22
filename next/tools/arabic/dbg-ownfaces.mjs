// debug: for every corpus PDF, is the font of its first Arabic line usable as the replaced line's own face?  node tools/arabic/dbg-ownfaces.mjs
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import fs from 'node:fs';
import { own } from './lib.mjs';
import { fontAt } from '../../src/lib/engine/ownfont.ts';
import { pageObjects } from '../../src/lib/engine/editpage.ts';
import { createFace } from '../../src/lib/engine/fontstore.ts';
const dir = 'tests/fixtures/arabic/', out = [];
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.pdf'))) {
  try {
    const p = new m.PDFDocument(new Uint8Array(fs.readFileSync(dir + f))).loadPage(0), l = pageObjects(p).lines.find((x) => x.rtl); if (!l) continue;
    const ft = fontAt(p, { x: l.x, y: l.y, w: l.w, h: l.h }), b = ft?.getBuffer()?.asUint8Array().slice();
    out.push(`${createFace(own.hb, ft.getName(), b, { source: 'pdf' }) ? 'usable' : 'NOT'}  ${f}`);
  } catch (e) { out.push('error ' + f + ' ' + e.message.slice(0, 40)); }
}
console.log(out.filter((x) => !x.startsWith('usable')).join('\n'), '\nusable', out.filter((x) => x.startsWith('usable')).length, 'of', out.length);
