// Self-check of form filling with the real engine build:  pnpm test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import { listFields, fillForm } from '../../src/lib/engine/forms.ts';

const form = fs.readFileSync(new URL('../fixtures/form.pdf', import.meta.url));
const font = (f) => new m.Font(f, fs.readFileSync(new URL('../../public/fonts/' + f + '.ttf', import.meta.url)));
const fonts = { regular: font('Tajawal-Regular'), bold: font('Tajawal-Bold') };
const by = (fields, name, on) => fields.find((f) => f.name === name && (!on || f.on === on));

test('list: text, read-only text, checkbox, a radio group (two options) and a combo box', () => {
  const f = listFields(m, form);
  assert.deepEqual(f.map((x) => [x.name, x.type]), [['name', 'text'], ['city', 'text'], ['agree', 'checkbox'], ['size', 'radio'], ['size', 'radio'], ['country', 'choice']]);
  assert.equal(by(f, 'city').readOnly, true);
  assert.equal(by(f, 'city').value, 'Cairo');
  assert.deepEqual(f.filter((x) => x.type === 'radio').map((x) => x.on), ['small', 'large']);
  assert.deepEqual(by(f, 'country').options, ['Egypt', 'Saudi Arabia', 'Oman']);
});

test('fill: values are saved, Arabic text is kept as real text, the form stays fillable; read-only fields are not changed', () => {
  const f = listFields(m, form), id = (n, on) => by(f, n, on).id;
  const out = fillForm(m, form, { [id('name')]: 'عبدالله', [id('city')]: 'Giza', [id('agree')]: true, [id('size', 'large')]: true, [id('country')]: 'Oman' }, false, fonts);
  const g = listFields(m, out);
  assert.equal(by(g, 'name').value, 'عبدالله');
  assert.equal(by(g, 'city').value, 'Cairo');
  assert.equal(by(g, 'agree').checked, true);
  assert.deepEqual(g.filter((x) => x.type === 'radio').map((x) => x.checked), [false, true]);
  assert.equal(by(g, 'country').value, 'Oman');
  // the Arabic answer is drawn (a picture of it exists), and the fields are still there to change
  const again = fillForm(m, out, { [id('agree')]: false }, false, fonts);
  assert.equal(by(listFields(m, again), 'agree').checked, false);
  assert.equal(by(listFields(m, again), 'name').value, 'عبدالله');
});

test('flatten: the answers become page content and the fields are gone', () => {
  const f = listFields(m, form);
  const out = fillForm(m, form, { [by(f, 'name').id]: 'Sami', [by(f, 'agree').id]: true }, true, fonts);
  assert.equal(listFields(m, out).length, 0);
  assert.match(m.Document.openDocument(out, 'application/pdf').loadPage(0).toStructuredText().asText(), /Sami/);
});

test('Arabic answers are drawn in the field (dark pixels appear where the field is)', () => {
  const f = listFields(m, form), dark = (b) => {
    const pix = m.Document.openDocument(b, 'application/pdf').loadPage(0).toPixmap(m.Matrix.identity, m.ColorSpace.DeviceGray, false), px = pix.getPixels(), w = pix.getWidth();
    let n = 0; for (let y = 120; y < 142; y++) for (let x = 72; x < 300; x++) if (px[y * w + x] < 128) n++; return n;
  };
  assert.equal(dark(form), 0);
  assert.ok(dark(fillForm(m, form, { [by(f, 'name').id]: 'مرحبا بالعالم' }, false, fonts)) > 40);
});

test('a long Arabic answer in a multiline field wraps onto more lines instead of running off the edge', () => {
  // the "name" field made multiline and 80 pt tall (top at y 120 on the page as seen, 228 pt wide)
  const d = m.Document.openDocument(form, 'application/pdf').asPDF(), name = d.findPage(0).get('Annots').get(0);
  name.put('Ff', 4096); name.put('Rect', [72, 642, 300, 722]);
  const tall = d.saveToBuffer('').asUint8Array().slice(), id = by(listFields(m, tall), 'name').id;
  assert.equal(by(listFields(m, tall), 'name').multiline, true);
  const answer = 'هذه إجابة طويلة جدا عن السؤال تحتاج إلى أكثر من سطر واحد داخل الحقل';
  const out = fillForm(m, tall, { [id]: answer }, false, fonts);
  assert.equal(by(listFields(m, out), 'name').value, answer);
  const pix = m.Document.openDocument(out, 'application/pdf').loadPage(0).toPixmap(m.Matrix.identity, m.ColorSpace.DeviceGray, false), px = pix.getPixels(), w = pix.getWidth();
  const dark = (top, bottom) => { let n = 0; for (let y = top; y < bottom; y++) for (let x = 72; x < 300; x++) if (px[y * w + x] < 128) n++; return n; };
  assert.ok(dark(122, 137) > 40, 'first line');
  assert.ok(dark(138, 153) > 40, 'second line');
});

// ---- several answers, choices, flatten, NeedAppearances, turned pages: a form made here (fields with no appearance, as many forms are)
function makeForm({ rotate = 0, mkR = 0, needAppearances = false, rects } = {}) {
  const d = new m.PDFDocument(), helv = d.addObject(d.newDictionary());
  helv.put('Type', d.newName('Font')); helv.put('Subtype', d.newName('Type1')); helv.put('BaseFont', d.newName('Helvetica')); helv.put('Encoding', d.newName('WinAnsiEncoding'));
  d.insertPage(-1, d.addPage([0, 0, 595, 842], 0, {}, ''));
  const page = d.findPage(0), fields = d.newArray(), annots = d.newArray();
  if (rotate) page.put('Rotate', rotate);
  const specs = rects ?? [['name', 'Tx', [60, 760, 535, 790]], ['address', 'Tx', [60, 700, 535, 730]], ['city', 'Ch', [60, 640, 300, 665], 1 << 17, ['القاهرة', 'مسقط', 'Dubai']], ['list', 'Ch', [320, 560, 535, 660], 0, ['الأول', 'الثاني', 'Third']]];
  for (const [name, ft, rect, ff, opt] of specs) {
    const w = d.addObject(d.newDictionary());
    w.put('Type', d.newName('Annot')); w.put('Subtype', d.newName('Widget')); w.put('F', 4); w.put('P', page); w.put('Rect', rect); w.put('T', d.newString(name)); w.put('FT', d.newName(ft));
    w.put('DA', d.newString('/Helv 12 Tf 0 g')); if (ff) w.put('Ff', ff);
    if (opt) { const a = d.newArray(); opt.forEach((o) => a.push(d.newString(o))); w.put('Opt', a); }
    if (mkR) { const mk = d.newDictionary(); mk.put('R', mkR); w.put('MK', mk); }
    fields.push(w); annots.push(w);
  }
  page.put('Annots', annots);
  const af = d.newDictionary(), dr = d.newDictionary(), df = d.newDictionary(); df.put('Helv', helv); dr.put('Font', df);
  af.put('Fields', fields); af.put('DR', dr); af.put('DA', d.newString('/Helv 12 Tf 0 g')); if (needAppearances) af.put('NeedAppearances', true);
  d.getTrailer().get('Root').put('AcroForm', af);
  return d.saveToBuffer('').asUint8Array().slice();
}
const inkBox = (bytes, box) => { // dark pixels of page 0 inside box [x0, y0, x1, y1] (points from the top left, page as seen): count and bounding box
  const pix = m.Document.openDocument(bytes, 'application/pdf').loadPage(0).toPixmap(m.Matrix.identity, m.ColorSpace.DeviceGray, false), px = pix.getPixels(), W = pix.getWidth();
  let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = box[1]; y < box[3]; y++) for (let x = box[0]; x < box[2]; x++) if (px[y * W + x] < 140) { n++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return { n, w: x1 - x0 + 1, h: y1 - y0 + 1 };
};
const SEEN = { name: [62, 52, 533, 82], address: [62, 112, 533, 142], city: [62, 177, 298, 202], list: [322, 182, 533, 282] }; // the fields' boxes as seen (842 - y)
const ANSWERS = (f) => ({ [by(f, 'name').id]: 'عبدالله محمد الأحمد', [by(f, 'address').id]: 'الرياض، حي النخيل ١٢٣٤٥', [by(f, 'city').id]: 'مسقط', [by(f, 'list').id]: 'الثاني' });

test('several Arabic answers at once (text, text, combo box, list box) are all drawn, not only the last', () => {
  const blank = makeForm(), f = listFields(m, blank), out = fillForm(m, blank, ANSWERS(f), false, fonts);
  for (const k of Object.keys(SEEN)) assert.ok(inkBox(out, SEEN[k]).n > 40, k + ' has no picture');
  const g = listFields(m, out);
  assert.equal(by(g, 'name').value, 'عبدالله محمد الأحمد'); assert.equal(by(g, 'city').value, 'مسقط'); assert.equal(by(g, 'list').value, 'الثاني'); // real text kept
  assert.equal(g.length, 4); // still fillable
});

test('flatten keeps every Arabic answer as page content and removes the fields', () => {
  const blank = makeForm(), f = listFields(m, blank), out = fillForm(m, blank, ANSWERS(f), true, fonts);
  assert.equal(listFields(m, out).length, 0);
  for (const k of ['name', 'address', 'city']) assert.ok(inkBox(out, SEEN[k]).n > 40, k + ' lost when flattened');
});

test('a form that asks readers to rebuild appearances stops asking once every field has one', () => {
  const blank = makeForm({ needAppearances: true }), f = listFields(m, blank), out = fillForm(m, blank, ANSWERS(f), false, fonts);
  const af = m.Document.openDocument(out, 'application/pdf').asPDF().getTrailer().get('Root', 'AcroForm');
  assert.ok(af.get('NeedAppearances').isNull());
});

test('on a page that is turned (/Rotate 90, field /MK /R 90) the answer reads upright, along the field as it is seen', () => {
  // field as seen: 400 wide, 30 tall at (50, 50) on the 842 x 595 sheet; in the page's own space it is 30 wide, 400 tall
  const blank = makeForm({ rotate: 90, mkR: 90, rects: [['name', 'Tx', [50, 150, 80, 550]]] }), f = listFields(m, blank);
  const out = fillForm(m, blank, { [f[0].id]: 'عبدالله محمد الأحمد' }, false, fonts), ink = inkBox(out, [0, 0, 842, 595]);
  assert.ok(ink.n > 40, 'nothing drawn');
  assert.ok(ink.w > ink.h * 3, `turned: ${ink.w} x ${ink.h}`); // upright text is wide and short
});
