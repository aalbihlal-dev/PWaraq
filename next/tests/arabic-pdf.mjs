// A test PDF whose Arabic lines are in an embedded subset font (used by tests/unit/editpage and tests/e2e/editor).
import fs from 'node:fs';
import * as m from '../engine/mupdf-wasm/dist/mupdf.js';
import * as hb from 'harfbuzzjs';
import { shapedWriter, shaper } from '../src/lib/engine/ownfont.ts';

// A PDF whose Arabic line is in an embedded *subset* of Noto Naskh Arabic (only the letters it uses, like Word makes
// them; cut with HarfBuzz's own subsetter, which keeps the font's letter-shape rules for those letters).
function subset(bytes, text) {
  const x = new WebAssembly.Instance(new WebAssembly.Module(fs.readFileSync(new URL('../node_modules/harfbuzzjs/dist/harfbuzz-subset.wasm', import.meta.url)))).exports;
  const ptr = x.malloc(bytes.length);
  new Uint8Array(x.memory.buffer).set(bytes, ptr);
  const blob = x.hb_blob_create(ptr, bytes.length, 2, 0, 0), face = x.hb_face_create(blob, 0), input = x.hb_subset_input_create_or_fail();
  const set = x.hb_subset_input_unicode_set(input);
  for (const c of text) x.hb_set_add(set, c.codePointAt(0));
  const out = x.hb_face_reference_blob(x.hb_subset_or_fail(face, input)), at = x.hb_blob_get_data(out, 0);
  return new Uint8Array(x.memory.buffer).slice(at, at + x.hb_blob_get_length(out));
}
export const LINE = 'السلام عليكم', FULL = new Uint8Array(fs.readFileSync(new URL('../public/fonts/NotoNaskhArabic-Regular.ttf', import.meta.url))), SUB = subset(FULL, LINE + ' َ');
export function arabicDoc() {
  const doc = new m.PDFDocument(), w = shapedWriter(m, hb, doc), s = shaper(hb, 'NotoNaskhArabic', SUB);
  const ops = w.draw(s, { text: LINE, x: 500, y: 100, size: 24, color: [0, 0, 0], align: 'right' }, 842)
    + w.draw(s, { text: 'عليكم', x: 500, y: 160, size: 24, color: [0, 0, 0], align: 'right' }, 842);
  w.finish();
  doc.insertPage(-1, doc.addPage([0, 0, 595, 842], 0, { Font: w.fonts }, ops));
  return new m.PDFDocument(doc.saveToBuffer('garbage=compact').asUint8Array().slice());
}
