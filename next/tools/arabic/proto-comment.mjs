// PROTOTYPE (not app code): a FreeText comment whose /AP is written by Waraq's own Arabic text writer (embedded Tajawal,
// wrapped, right-aligned for Arabic) after MuPDF has made its Helvetica one. -> tests/fixtures/arabic-create/proto-comment.pdf
import fs from 'node:fs'; import path from 'node:path';
import { m, OUT, fonts, writeOut } from './lib.mjs';
import { pageWriter, measure, wrap } from '../../src/lib/engine/textpage.ts';
const F = fonts(), bytes = new Uint8Array(fs.readFileSync(path.join(OUT, 'comment.pdf')));
const doc = m.Document.openDocument(bytes, 'application/pdf').asPDF(), writer = pageWriter(m, doc, F);
let n = 0;
for (let i = 0; i < doc.countPages(); i++) {
  const page = doc.loadPage(i);
  for (const a of page.getAnnotations()) {
    if (a.getType() !== 'FreeText' || !/[؀-ۿ]/.test(a.getContents())) continue;
    const text = a.getContents(), [x0, y0, x1, y1] = a.getRect(), W = x1 - x0, H = y1 - y0, size = 12, rgb = a.getDefaultAppearance().color ?? [0, 0, 0];
    const rows = wrap((t) => measure(F.regular, t, size), text, W - 8), rtl = /[؀-ۿ]/.test(text[0]) || /^[^A-Za-z]*[؀-ۿ]/.test(text);
    const ops = writer.draw({ w: W, h: H, lines: rows.map((t, k) => ({ text: t, size, color: rgb, x: rtl ? W - 4 : 4, align: rtl ? 'right' : 'left', y: 4 + size * (0.95 + k * 1.2) })) });
    // the AP's own coordinates: BBox = the rectangle in the page's space, so no matrix is needed
    const ap = doc.addStream(ops, { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, W, H], Resources: { Font: writer.fonts } });
    a.getObject().put('AP', { N: ap }); n++;
  }
  page.destroy();
}
writer.finish();
const out = doc.saveToBuffer('garbage=compact').asUint8Array().slice(); writeOut('proto-comment.pdf', out);
fs.copyFileSync(path.join(OUT, 'manifest-comment.json'), path.join(OUT, 'manifest-proto-comment.json'));
console.log('patched', n, 'text boxes;', out.length, 'bytes');
