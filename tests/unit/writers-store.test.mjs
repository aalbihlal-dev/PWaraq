// Every writer that puts Arabic into a PDF goes through the font service (fontstore.ts, HarfBuzz): tashkeel kept, Persian / Urdu letters
// drawn, lam-alef read back right, the faces cut down to the letters used. The same texts through the old writer fail the first two.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import { withStore, withoutStore } from './store.mjs';
import { editPage } from '../../src/lib/engine/editpage.ts';
import { fillForm, listFields } from '../../src/lib/engine/forms.ts';
import { applyAnnots } from '../../src/lib/engine/annots.ts';
import { watermark, pageNumbers } from '../../src/lib/engine/tools.ts';
import { assemble } from '../../src/lib/engine/assemble.ts';

const TASH = 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ', BARE = 'بسم الله الرحمن الرحيم', PERSIAN = 'پژوهش چگونه گفتگو', LAM = 'لا إله إلا الله';
const blank = () => { const d = new m.PDFDocument(); d.insertPage(-1, d.addPage([0, 0, 595, 842], 0, {}, '')); return d; };
const bytes = (d) => d.saveToBuffer('garbage=compact').asUint8Array().slice();
const page = (b) => m.Document.openDocument(b, 'application/pdf').loadPage(0);
const ink = (b) => { const x = page(b).toPixmap(m.Matrix.scale(2, 2), m.ColorSpace.DeviceGray, false), px = x.getPixels(); let n = 0; for (let i = 0; i < px.length; i++) if (px[i] < 140) n++; return n; };
const text = (b) => page(b).toStructuredText().asText();
const fontsIn = (b) => { const d = m.Document.openDocument(b, 'application/pdf').asPDF(), out = []; for (let i = 1; i < d.countObjects(); i++) { try { const o = d.newIndirect(i, 0); if (o.isDictionary() && o.get('Type').toString() === '/FontDescriptor') out.push(o.get('FontFile2').readStream().asUint8Array().length); } catch {} } return out; };

// each family: the file with `t` written by it, using fonts `f`
const writers = {
  'page editor text': (t, f) => bytes(editPage(m, blank(), 0, [{ kind: 'text', text: t, x: 60, y: 60, w: 475, h: 30, size: 20, color: [0, 0, 0], bold: false, align: 'right' }], [], () => f)),
  'comment text box': (t, f) => { const d = m.Document.openDocument(applyAnnots(m, bytes(blank()), [], [{ id: 'a', page: 0, kind: 'text', color: '#000000', note: t, rect: [60, 60, 535, 100] }], f), 'application/pdf').asPDF(); d.bake(true, false); return bytes(d); }, // baked into the page so its text can be read
  'watermark': (t, f) => { const d = blank(); watermark(m, d, f, [0], { text: t, opacity: 1, angle: 0, size: 30, color: [0, 0, 0] }); return bytes(d); },
  'page number': (t, f) => { const d = blank(); pageNumbers(m, d, [0], { digits: 'arab', total: true }, f); return bytes(d); },
  'cover and contents (portfolio)': (t, f) => { const d0 = m.Document.openDocument(bytes(blank()), 'application/pdf');
    return assemble(m, () => ({ doc: d0, bytes: bytes(blank()) }), { items: [{ cover: { w: 595, h: 842, design: 'classic', rtl: true, title: t, subtitle: '', names: [], supervisor: '', supervisorLabel: '', logos: {} } }] }, () => f); },
};

for (const [name, make] of Object.entries(writers)) {
  if (name === 'page number') continue;
  test(`${name}: tashkeel are drawn, Persian letters are drawn, lam-alef reads back, the faces are cut down`, () => {
    const f = withStore(), marked = ink(make(TASH, f)), bare = ink(make(BARE, f));
    assert.ok(marked > bare * 1.03, `harakat add ink: ${marked} vs ${bare}`);
    const old = ink(make(TASH, withoutStore()));
    assert.ok(old < marked, `the old writer drew no harakat: ${old} vs ${marked}`);
    const persian = text(make(PERSIAN, f));
    for (const c of 'پژگچ') assert.ok(persian.includes(c), `${c} missing in ${JSON.stringify(persian)}`);
    assert.ok(text(make(LAM, f)).includes('لا إله إلا الله'), JSON.stringify(text(make(LAM, f))));
    for (const size of fontsIn(make(TASH + ' ' + PERSIAN, f))) assert.ok(size < 60_000, `an embedded face of ${size} bytes: not cut down`);
  });
}

test('forms: Arabic answers with harakat and Persian letters keep them, filled and flattened', () => {
  const d = new m.PDFDocument(); d.insertPage(-1, d.addPage([0, 0, 595, 842], 0, {}, ''));
  const p = d.findPage(0), w = d.addObject(d.newDictionary()), fields = d.newArray(), an = d.newArray();
  w.put('Type', d.newName('Annot')); w.put('Subtype', d.newName('Widget')); w.put('F', 4); w.put('P', p); w.put('Rect', [60, 760, 535, 790]); w.put('T', d.newString('n')); w.put('FT', d.newName('Tx')); w.put('DA', d.newString('/Helv 12 Tf 0 g'));
  fields.push(w); an.push(w); p.put('Annots', an); const af = d.newDictionary(); af.put('Fields', fields); d.getTrailer().get('Root').put('AcroForm', af);
  const blankForm = bytes(d), id = listFields(m, blankForm)[0].id;
  const a = ink(fillForm(m, blankForm, { [id]: TASH }, false, withStore())), b = ink(fillForm(m, blankForm, { [id]: BARE }, false, withStore()));
  assert.ok(a > b * 1.1, `${a} vs ${b}`);
  assert.ok(text(fillForm(m, blankForm, { [id]: PERSIAN }, true, withStore())).includes('پ'));
});

test('a line wider than its box gets a smaller font first (down to 70 %), horizontal scaling only for the rest', async () => {
  const { writer } = await import('../../src/lib/engine/fontstore.ts');
  const { store } = await import('./store.mjs'), doc = new m.PDFDocument(), w = writer(m, store, doc);
  const line = { text: 'هذا نص عربي طويل يجب أن يدخل الصندوق', x: 400, y: 100, size: 20, color: [0, 0, 0], align: 'right' }, width = w.measure(line);
  const size = (ops) => +/ Tf/.exec(ops).input.slice(0, /Tf/.exec(ops).index).trim().split(' ').pop(), tz = (ops) => +(/([\d.]+) Tz/.exec(ops)?.[1] ?? 100);
  const mild = w.draw({ ...line, fit: width * 0.85 }, 200), hard = w.draw({ ...line, fit: width * 0.4 }, 200);
  assert.ok(size(mild) < 20 && size(mild) >= 14 && tz(mild) === 100, 'a mild squeeze only shrinks the font');
  assert.ok(Math.abs(size(hard) - 14) < 0.01 && tz(hard) < 100, 'a hard squeeze stops at 70 % and scales the rest');
});

test("a PDF's own subset with only a glyph-index cmap ((1,0), codes are glyph numbers) is not a face: Latin typed into its line would draw the wrong glyphs", async () => {
  const fs = await import('node:fs'), { createFace } = await import('../../src/lib/engine/fontstore.ts'), { fontAt } = await import('../../src/lib/engine/ownfont.ts'), { pageObjects } = await import('../../src/lib/engine/editpage.ts'), { store } = await import('./store.mjs');
  const page = new m.PDFDocument(new Uint8Array(fs.readFileSync(new URL('./../fixtures/arabic/libreoffice-sakkal-majalla.pdf', import.meta.url)))).loadPage(0), l = pageObjects(page).lines.find((x) => x.rtl);
  const f = fontAt(page, { x: l.x, y: l.y, w: l.w, h: l.h });
  assert.equal(createFace(store.hb, f.getName(), f.getBuffer().asUint8Array().slice(), { source: 'pdf' }), null);
  assert.ok(createFace(store.hb, 'Tajawal', store.file('Tajawal-Regular.ttf'), { source: 'pdf' }), 'a font with a Unicode cmap is kept');
});
