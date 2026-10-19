// Makes the test files: three.pdf (pages "Page one/two/three", A4), photo.png and edit.pdf.  node tests/fixtures/make-fixtures.mjs
import fs from 'node:fs';
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import { assemble } from '../../src/lib/engine/assemble.ts';
import { pageWriter } from '../../src/lib/engine/textpage.ts';

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

// sign-en.pdf / sign-ar.pdf: forms that need signing (signing mode). English: page 1 has "Signature: ____  Date: ____",
// page 2 an empty signature form field. Arabic (written in Tajawal like Waraq's own pages): page 2 has
// "الاسم والتوقيع: ____" and "التاريخ: ____".
{
  const doc = new m.PDFDocument(), helv = doc.addSimpleFont(new m.Font('Helvetica'));
  const text = (ops) => doc.addPage([0, 0, 595, 842], 0, { Font: { F1: helv } }, ops);
  doc.insertPage(-1, text('BT /F1 18 Tf 72 760 Td (Service agreement) Tj ET BT /F1 12 Tf 72 730 Td (The parties agree to the terms below.) Tj ET' +
    ' BT /F1 12 Tf 72 200 Td (Signature: ____________________) Tj ET BT /F1 12 Tf 340 200 Td (Date: ______________) Tj ET'));
  const p2 = doc.addObject(text('BT /F1 12 Tf 72 300 Td (Approved by the manager) Tj ET'));
  doc.insertPage(-1, p2);
  const field = doc.addObject(doc.newDictionary());
  for (const [k, v] of [['Type', doc.newName('Annot')], ['Subtype', doc.newName('Widget')], ['FT', doc.newName('Sig')], ['T', doc.newString('Manager')],
    ['F', doc.newInteger(4)], ['Rect', doc.newArray()], ['P', doc.findPage(1)]]) field.put(k, v);
  [72, 220, 272, 270].forEach((v, i) => field.get('Rect').push(doc.newReal(v))); // 200 x 50 at y 220..270 (PDF space)
  doc.findPage(1).put('Annots', doc.newArray()); doc.findPage(1).get('Annots').push(field);
  const form = doc.newDictionary(); form.put('Fields', doc.newArray()); form.get('Fields').push(field);
  doc.getTrailer().get('Root').put('AcroForm', doc.addObject(form));
  fs.writeFileSync(here('sign-en.pdf'), doc.saveToBuffer('compress').asUint8Array());
}
{
  const out = new m.PDFDocument(), w = pageWriter(m, out, fonts), line = (text, y, size = 14) => ({ text, x: 523, y, size, align: 'right' });
  out.insertPage(-1, w.add({ w: 595, h: 842, lines: [line('عقد خدمة', 90, 22), line('يتفق الطرفان على الشروط أدناه.', 130)] }));
  out.insertPage(-1, w.add({ w: 595, h: 842, lines: [line('اعتماد المدير', 90, 22), line('الاسم والتوقيع: ____________________', 600), line('التاريخ: ______________', 650)] }));
  w.finish();
  fs.writeFileSync(here('sign-ar.pdf'), out.saveToBuffer('compress').asUint8Array());
}
// signature-photo.png: a phone photo of a signature — grey-beige paper with noise and a soft shadow, dark blue strokes
{
  const W = 360, H = 160, p = new m.Pixmap(m.ColorSpace.DeviceRGB, [0, 0, W, H], false), s = p.getPixels();
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3, shade = 200 + 25 * (x / W) - 20 * (y / H) + rnd() * 12;
    s[i] = shade; s[i + 1] = shade - 6; s[i + 2] = shade - 18;
  }
  // strokes: a wave from x 60..300 around y 80, 4 px thick, and a short underline at y 120
  const ink = (x, y) => { for (let dy = -2; dy <= 2; dy++) { const i = ((y + dy) * W + x) * 3; s[i] = 30; s[i + 1] = 40; s[i + 2] = 90; } };
  for (let x = 60; x <= 300; x++) ink(x, Math.round(80 + 25 * Math.sin(x / 18)));
  for (let x = 100; x <= 260; x++) ink(x, 120);
  fs.writeFileSync(here('signature-photo.png'), p.asPNG());
}
