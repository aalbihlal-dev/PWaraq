// PROTOTYPE (not app code): two-pass form fill — every value first, then each Arabic field's own appearance — and the flatten
// variants. Shows which order/flatten path keeps the Arabic. -> tests/fixtures/arabic-create/proto-forms*.pdf
import fs from 'node:fs'; import path from 'node:path';
import { m, T, OUT, fonts, writeOut } from './lib.mjs';
import { listFields } from '../../src/lib/engine/forms.ts';
import { pageWriter, measure, wrap } from '../../src/lib/engine/textpage.ts';
const blank = new Uint8Array(fs.readFileSync(path.join(OUT, 'forms-blank.pdf'))), F = fonts();
const f = listFields(m, blank), id = (n) => f.find((x) => x.name === n).id;
const answers = { [id('الاسم')]: 'عبدالله محمد الأحمد', [id('address')]: 'العنوان: الرياض ١٢٣٤٥', [id('notes')]: 'ملاحظات أولى\nملاحظات ثانية', [id('مدينة')]: 'مسقط' };
function fill(flat) {
  const doc = m.Document.openDocument(blank, 'application/pdf').asPDF(), writer = pageWriter(m, doc, F), todo = [];
  const page = doc.loadPage(0), ws = page.getWidgets(), rects = ws.map((w) => [...w.getRect()]), multis = ws.map((w) => (w.getFieldType() === 'text' ? w.isMultiline() : false));
  for (const [k, a] of Object.entries(answers)) { const w = ws[+k.split(':')[1]]; if (w.isChoice()) w.setChoiceValue(a); else w.setTextValue(a); todo.push([w, a]); } // pass 1: all values
  page.update(); // MuPDF rebuilds every changed field's appearance here; the Arabic pictures are put after it
  for (const [w, a] of todo) { const wi = ws.indexOf(w); // pass 2: the Arabic pictures, after MuPDF is done regenerating
    const [x0, y0, x1, y1] = rects[wi], W = x1 - x0, H = y1 - y0, size = Math.min(14, H * 0.62), multi = multis[wi];
    const rows = multi ? a.split('\n') : [a];
    const ops = writer.draw({ w: W, h: H, lines: rows.map((text, i) => ({ text, size: 12, x: W - 3, align: 'right', y: multi ? 3 + 12 * (0.9 + i * 1.25) : H / 2 + size * 0.33 })) });
    w.getObject().put('AP', { N: doc.addStream(ops, { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, W, H], Resources: { Font: writer.fonts } }) });
  }
  writer.finish();
  const keep = doc.saveToBuffer('garbage=compact').asUint8Array().slice();
  if (!flat) return keep;
  const d2 = m.Document.openDocument(keep, 'application/pdf').asPDF(); d2.bake(false, true); return d2.saveToBuffer('garbage=compact').asUint8Array().slice();
}
for (const [name, flat] of [['proto-forms', false], ['proto-forms-flat', true]]) {
  const b = fill(flat); writeOut(name + '.pdf', b);
  const pg = m.Document.openDocument(b, 'application/pdf').loadPage(0), pix = pg.toPixmap(m.Matrix.identity, m.ColorSpace.DeviceGray, false), px = pix.getPixels(), W = pix.getWidth();
  const dark = (y0, y1) => { let n = 0; for (let y = y0; y < y1; y++) for (let x = 60; x < 535; x++) if (px[y * W + x] < 128) n++; return n; };
  console.log(name, '| dark px: name field', dark(52, 82), 'address', dark(112, 142), 'notes', dark(162, 282), 'city(combo)', dark(347, 372));
  fs.writeFileSync(path.join(OUT, `manifest-${name}.json`), JSON.stringify([{ writer: name, file: name + '.pdf', page: 0, label: name, expect: Object.values(answers) }]));
}
