// debug: which face each run of a replaced line gets, and what the Latin glyphs of the PDF's own font are.  node tools/arabic/dbg-latin.mjs file.pdf
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import fs from 'node:fs';
import { own } from './lib.mjs';
import { fontAt } from '../../src/lib/engine/ownfont.ts';
import { pageObjects } from '../../src/lib/engine/editpage.ts';
import { getFace, shapeRun } from '../../src/lib/engine/fontstore.ts';
import { runs as bidiRuns } from '../../src/lib/engine/bidi.ts';
const d = new m.PDFDocument(new Uint8Array(fs.readFileSync(process.argv[2]))), p = d.loadPage(0);
const l = pageObjects(p).lines.find((x) => /Waraq|Section/.test(x.text)); console.log(JSON.stringify(l?.text));
const f = fontAt(p, { x: l.x, y: l.y, w: l.w, h: l.h }), hint = { name: f.getName(), bytes: f.getBuffer().asUint8Array().slice() };
const text = 'استخدم Waraq (الإصدار 1.0) PDF ص. 12';
for (const run of bidiRuns([...text].map((c) => c.codePointAt(0)))) {
  const cs = run.cs, script = cs.some((c) => c >= 0x600 && c <= 0x6ff) ? 'arab' : 'latn', r = getFace(own, hint, script, cs);
  const sh = shapeRun(own.hb, r.face, run, 10);
  console.log(JSON.stringify(String.fromCodePoint(...cs)), '->', r.face.name, r.face.source, r.reason, 'glyphs', sh.glyphs.map((g) => g.gid).join(','));
}
fs.writeFileSync(process.env.DUMP ?? 'own-font.ttf', hint.bytes); // the PDF's own font program, to open with fontTools
