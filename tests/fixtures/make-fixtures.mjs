// Makes the test files: three.pdf (pages "Page one/two/three", A4), photo.png and edit.pdf.  node tests/fixtures/make-fixtures.mjs
import fs from 'node:fs';
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import { assemble } from '../../src/lib/engine/assemble.ts';

const here = (f) => new URL(f, import.meta.url);
const font = (f) => new m.Font(f, fs.readFileSync(here('../../public/fonts/' + f + '.ttf')));
const fonts = { regular: font('Tajawal-Regular'), bold: font('Tajawal-Bold') };
const page = (title) => ({ divider: { w: 595, h: 842, label: 'Waraq test', title } });
fs.writeFileSync(here('three.pdf'), assemble(m, null, { items: ['Page one', 'Page two', 'Page three'].map(page) }, () => fonts));
const pix = new m.Pixmap(m.ColorSpace.DeviceRGB, [0, 0, 400, 300], false);
pix.clear(180);
fs.writeFileSync(here('photo.png'), pix.asPNG());

// edit.pdf: a page to edit — two lines of text (Helvetica) and two photos (red 200x100, green 100x100), A4
{
  const doc = new m.PDFDocument(), helv = doc.addSimpleFont(new m.Font('Helvetica'));
  const photo = (r, g, b, w, h) => { const p = new m.Pixmap(m.ColorSpace.DeviceRGB, [0, 0, w, h], false), s = p.getPixels(); for (let i = 0; i < s.length; i += 3) { s[i] = r; s[i + 1] = g; s[i + 2] = b; } return doc.addImage(new m.Image(p)); };
  const ops = 'BT /F1 24 Tf 72 760 Td (Old heading) Tj ET BT /F1 12 Tf 72 730 Td (Keep this line) Tj ET q 200 0 0 100 72 500 cm /Im0 Do Q q 100 0 0 100 350 500 cm /Im1 Do Q';
  doc.insertPage(-1, doc.addPage([0, 0, 595, 842], 0, { Font: { F1: helv }, XObject: { Im0: photo(200, 60, 60, 200, 100), Im1: photo(60, 160, 90, 100, 100) } }, ops));
  fs.writeFileSync(here('edit.pdf'), doc.saveToBuffer('compress').asUint8Array());
}
