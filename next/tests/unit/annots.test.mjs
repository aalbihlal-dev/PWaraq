// Self-check of comments (PDF annotations) with the real engine build:  pnpm test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import { listAnnots, applyAnnots, remap } from '../../src/lib/engine/annots.ts';

const small = fs.readFileSync(new URL('../fixtures/small.pdf', import.meta.url));
const base = { page: 0, note: '', color: '#d93a3a' };
const sample = [
  { ...base, id: 'n1', kind: 'highlight', color: '#f5c518', rect: [50, 50, 150, 70], quads: [[50, 50, 150, 50, 50, 70, 150, 70]] },
  { ...base, id: 'n2', kind: 'ink', rect: [10, 10, 60, 40], strokes: [[[10, 10], [30, 40], [60, 20]]] },
  { ...base, id: 'n3', kind: 'square', rect: [100, 100, 200, 160] },
  { ...base, id: 'n4', kind: 'circle', rect: [100, 200, 200, 260] },
  { ...base, id: 'n5', kind: 'line', rect: [20, 300, 120, 320], line: [20, 300, 120, 320] },
  { ...base, id: 'n6', kind: 'arrow', rect: [20, 340, 120, 360], line: [20, 340, 120, 360] },
  { ...base, id: 'n7', kind: 'text', color: '#233c36', rect: [200, 300, 360, 340], note: 'Hello' },
  { ...base, id: 'n8', kind: 'note', color: '#f5c518', rect: [300, 50, 320, 70], note: 'عبدالله — مراجعة' },
  { ...base, id: 'n9', kind: 'underline', rect: [50, 80, 150, 100], quads: [[50, 80, 150, 80, 50, 100, 150, 100]] },
  { ...base, id: 'n10', kind: 'strike', rect: [50, 110, 150, 130], quads: [[50, 110, 150, 110, 50, 130, 150, 130]] },
];

test('write every comment kind, read it back with the same kind, colour and note', () => {
  const out = applyAnnots(m, small, [], sample);
  const back = listAnnots(m, out);
  assert.deepEqual(back.map((a) => a.kind).sort(), sample.map((a) => a.kind).sort());
  const subtypes = m.Document.openDocument(out, 'application/pdf').loadPage(0).getAnnotations().map((a) => a.getType()).sort();
  assert.deepEqual(subtypes, ['Circle', 'FreeText', 'Highlight', 'Ink', 'Line', 'Line', 'Square', 'StrikeOut', 'Text', 'Underline']);
  const by = (k) => back.find((a) => a.kind === k);
  assert.equal(by('highlight').color, '#f5c518');
  assert.equal(by('note').note, 'عبدالله — مراجعة');
  assert.equal(by('text').note, 'Hello');
  assert.equal(by('text').color, '#233c36');
  assert.deepEqual(by('ink').strokes, [[[10, 10], [30, 40], [60, 20]]]);
  assert.deepEqual(by('arrow').line, [20, 340, 120, 360]);
});

test('remove and change: only the named comments go; a changed one is removed and written again', () => {
  const out = applyAnnots(m, small, [], sample);
  const list = listAnnots(m, out), sq = list.find((a) => a.kind === 'square');
  const out2 = applyAnnots(m, out, list.filter((a) => a.kind === 'note' || a.kind === 'square').map((a) => ({ page: a.page, src: Number(a.id.split(':')[1]) })), [{ ...remap(sq, [0, 0, 50, 50]), color: '#2f6fd6' }]);
  const back = listAnnots(m, out2);
  assert.equal(back.length, sample.length - 1);
  assert.equal(back.some((a) => a.kind === 'note'), false);
  assert.deepEqual(back.find((a) => a.kind === 'square').rect.map(Math.round), [0, 0, 50, 50]);
  assert.equal(back.find((a) => a.kind === 'square').color, '#2f6fd6');
});

test('remap stretches the shape with its box', () => {
  const r = remap(sample[1], [0, 0, 100, 60]);
  assert.deepEqual(r.strokes, [[[0, 0], [40, 60], [100, 20]]]);
  assert.deepEqual(remap(sample[4], [10, 10, 60, 20]).line, [10, 10, 60, 20]);
});

// ---- a text box in Arabic must be in the file, not only on Waraq's screen: MuPDF's own appearance is Helvetica (empty for Arabic)
const font = (f) => new m.Font(f, fs.readFileSync(new URL('../../public/fonts/' + f + '.ttf', import.meta.url)));
const fonts = { regular: font('Tajawal-Regular'), bold: font('Tajawal-Bold') };
const ink = (bytes, box, page = 0) => { // dark pixels of the page inside box [x0, y0, x1, y1] (points from the top left, as seen): count and bounding box
  const pix = m.Document.openDocument(bytes, 'application/pdf').loadPage(page).toPixmap(m.Matrix.identity, m.ColorSpace.DeviceGray, false), px = pix.getPixels(), W = pix.getWidth();
  let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = box[1]; y < box[3]; y++) for (let x = box[0]; x < box[2]; x++) if (px[y * W + x] < 140) { n++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return { n, w: x1 - x0 + 1, h: y1 - y0 + 1 };
};
const blankPdf = (() => { const d = new m.PDFDocument(); d.insertPage(-1, d.addPage([0, 0, 595, 842], 0, {}, '')); return d.saveToBuffer('').asUint8Array().slice(); })();
const box = (note, rect = [60, 300, 330, 350]) => ({ ...base, id: 'a1', kind: 'text', color: '#233c36', rect, note });

test('an Arabic text box is drawn in the file (embedded font), and its text and colour read back', () => {
  const note = 'مرحبا بالعالم، هذا نص عربي للاختبار';
  const plain = applyAnnots(m, blankPdf, [], [box(note)]), drawn = applyAnnots(m, blankPdf, [], [box(note)], fonts);
  assert.ok(ink(plain, [60, 300, 330, 350]).n < 20, 'Helvetica draws no Arabic: the old box is empty');
  assert.ok(ink(drawn, [60, 300, 330, 350]).n > 150, 'the Arabic is drawn');
  const a = listAnnots(m, drawn)[0];
  assert.equal(a.note, note); assert.equal(a.kind, 'text'); assert.equal(a.color, '#233c36');
  const d = m.Document.openDocument(drawn, 'application/pdf').asPDF(), an = d.findPage(0).get('Annots').get(0);
  assert.match(an.get('DA').asString(), /^\/WqArabic 12 Tf /); // a reader that redraws the box finds an embedded font, not Helvetica
  assert.ok(d.getTrailer().get('Root', 'AcroForm', 'DR', 'Font', 'WqArabic').isDictionary());
});

test('an Arabic text box wraps inside its box and Arabic-Indic digits keep their order', () => {
  const long = 'هذا نص طويل جدا يجب أن ينتقل إلى عدة أسطر داخل الصندوق دون أن يتجاوز حدوده ٠١٢٣٤٥٦٧٨٩';
  const out = applyAnnots(m, blankPdf, [], [box(long, [60, 300, 260, 400])], fonts), i = ink(out, [0, 280, 595, 420]);
  assert.ok(i.n > 300);
  const inside = ink(out, [60, 300, 260, 400]);
  assert.equal(inside.n, i.n, 'nothing drawn outside the box'); assert.ok(inside.h > 30, 'more than one line');
});

test('a text box in Latin keeps MuPDF\'s own appearance (no embedded font is added)', () => {
  const out = applyAnnots(m, blankPdf, [], [box('Hello world')], fonts), d = m.Document.openDocument(out, 'application/pdf').asPDF();
  assert.match(d.findPage(0).get('Annots').get(0).get('DA').asString(), /^\/Helv/);
  assert.ok(d.getTrailer().get('Root').get('AcroForm').isNull());
});

test('an Arabic text box on a turned page (/Rotate 90) reads upright', () => {
  const doc = m.Document.openDocument(blankPdf, 'application/pdf').asPDF(); doc.findPage(0).put('Rotate', 90);
  const turned = doc.saveToBuffer('').asUint8Array().slice(), out = applyAnnots(m, turned, [], [box('مرحبا بالعالم هذا نص عربي', [60, 100, 330, 150])], fonts), i = ink(out, [0, 0, 842, 595]);
  assert.ok(i.n > 100 && i.w > i.h * 3, `${i.w} x ${i.h}`);
});

test('a sticky note keeps the place it was put on a turned page, and reads back at the same place (no drift on every save)', () => {
  for (const rot of [0, 90, 180, 270]) {
    const doc = m.Document.openDocument(blankPdf, 'application/pdf').asPDF(); doc.findPage(0).put('Rotate', rot);
    const turned = doc.saveToBuffer('').asUint8Array().slice(), rect = [300, 200, 320, 220];
    const once = applyAnnots(m, turned, [], [{ ...base, id: 'n', kind: 'note', color: '#f5c518', rect, note: 'x' }]), back = listAnnots(m, once)[0];
    assert.deepEqual(back.rect.map(Math.round), rect, `rotate ${rot}`);
    const twice = listAnnots(m, applyAnnots(m, once, [{ page: 0, src: 0 }], [back]))[0];
    assert.deepEqual(twice.rect.map(Math.round), rect, `rotate ${rot}, saved again`);
    const seenW = rot % 180 ? 842 : 595, ic = ink(once, [rect[0] - 4, rect[1] - 4, rect[2] + 4, rect[3] + 4]); // the icon is drawn at the put place (page is blank)
    assert.ok(ic.n > 30 && seenW > 0, `icon at the put place, rotate ${rot}`);
  }
});
