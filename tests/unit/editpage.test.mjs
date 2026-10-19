// Self-check of the page editor's engine side with the real engine build:  node --test tests/unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import * as hb from 'harfbuzzjs';
import { editPage, pageObjects } from '../../src/lib/engine/editpage.ts';
import { fontAt, pick, shape, shaper } from '../../src/lib/engine/ownfont.ts';
import { arabicDoc, FULL, SUB } from '../arabic-pdf.mjs';

const read = (f) => fs.readFileSync(new URL('../fixtures/' + f, import.meta.url));
const file = (f) => new Uint8Array(fs.readFileSync(new URL('../../public/fonts/' + f, import.meta.url)));
const font = (f) => new m.Font(f, file(f + '.ttf'));
const own = { hb, file };
const fonts = { regular: font('Tajawal-Regular'), bold: font('Tajawal-Bold') };
const src = () => new m.PDFDocument(read('edit.pdf'));
const photo = read('photo.png'); // 400 x 300
// the edited page saved and opened again, as Organize and Portfolio get it
const apply = (edits, doc = src(), lift = false) => {
  const bytes = editPage(m, doc, 0, edits, [photo], () => fonts, lift, own).saveToBuffer('garbage=compact').asUint8Array().slice();
  return m.Document.openDocument(bytes, 'application/pdf').loadPage(0);
};
const near = (a, b) => ['x', 'y', 'w', 'h'].every((k) => Math.abs(a[k] - b[k]) < 0.5);
const ink = [0.137, 0.235, 0.212];

test('what is on the page: its lines of text and its photos with their boxes', () => {
  const o = pageObjects(src().loadPage(0));
  assert.deepEqual(o.lines.map((l) => [l.text, Math.round(l.size)]), [['Old heading', 24], ['Keep this line', 12]]);
  assert.ok(near(o.images[0], { x: 72, y: 242, w: 200, h: 100 }) && near(o.images[1], { x: 350, y: 242, w: 100, h: 100 }));
});

test('added text is real, extractable Arabic and English text', () => {
  const page = apply([
    { kind: 'text', text: 'مرحبا بالعالم', x: 300, y: 600, w: 220, h: 40, size: 20, color: ink, bold: true, align: 'right' },
    { kind: 'text', text: 'Hello Waraq, a second line wraps here', x: 72, y: 650, w: 180, h: 40, size: 14, color: [0, 0, 0], bold: false, align: 'left' },
  ]);
  const text = page.toStructuredText().asText();
  assert.match(text, /مرحبا بالعالم/);
  assert.match(text, /Hello Waraq, a second.*\n.*wraps here/); // wrapped at the box width
  assert.match(text, /Old heading/); // the page's own text is untouched
  const arabic = pageObjects(page).lines.find((l) => l.rtl);
  assert.ok(arabic.x + arabic.w <= 520.5 && arabic.x + arabic.w > 500, 'right-aligned to the box edge'); // 300 + 220
  assert.ok(Math.abs(arabic.y + arabic.h - 600 - 20 * 1.25) < 6, 'first line sits at the top of the box');
});

test('a new photo goes exactly into its box, keeping its shape', () => {
  const o = pageObjects(apply([{ kind: 'photo', photo: 0, x: 300, y: 600, w: 200, h: 200 }]));
  assert.equal(o.images.length, 3);
  assert.ok(near(o.images[2], { x: 300, y: 625, w: 200, h: 150 }), JSON.stringify(o.images[2])); // 4:3 inside a square
});

test('existing photos: moved and resized, replaced, deleted', () => {
  const from0 = { x: 72, y: 242, w: 200, h: 100 }, from1 = { x: 350, y: 242, w: 100, h: 100 };
  let o = pageObjects(apply([{ kind: 'image', index: 0, from: from0, x: 100, y: 500, w: 100, h: 50 }]));
  assert.equal(o.images.length, 2);
  assert.ok(o.images.some((b) => near(b, { x: 100, y: 500, w: 100, h: 50 })) && o.images.some((b) => near(b, from1)) && !o.images.some((b) => near(b, from0)));

  o = pageObjects(apply([{ kind: 'image', index: 1, from: from1, ...from1, photo: 0 }]));
  assert.ok(o.images.some((b) => near(b, { x: 350, y: 254.5, w: 100, h: 75 })) && o.images.some((b) => near(b, from0)));

  o = pageObjects(apply([{ kind: 'image', index: 0, from: from0, ...from0, removed: true }]));
  assert.equal(o.images.length, 1);
  assert.ok(near(o.images[0], from1));
});

test('a replaced line: the old text is gone, the new text is in its place, the next line stays', () => {
  const old = pageObjects(src().loadPage(0)).lines[0];
  const page = apply([{ kind: 'text', from: old, text: 'عنوان جديد', x: old.x, y: old.y, w: 300, h: old.h, size: 24, color: ink, bold: false, align: 'left' }]);
  const text = page.toStructuredText().asText();
  assert.doesNotMatch(text, /Old heading/);
  assert.match(text, /عنوان جديد/);
  assert.match(text, /Keep this line/);
  assert.equal(pageObjects(page).images.length, 2);
});

test('the editor background: only what the edits take away is gone', () => {
  const old = pageObjects(src().loadPage(0)).lines[0];
  const page = apply([
    { kind: 'text', from: old, text: 'New', x: 0, y: 0, w: 100, h: 20, size: 12, color: ink, bold: false, align: 'left' },
    { kind: 'image', index: 1, from: { x: 350, y: 242, w: 100, h: 100 }, x: 0, y: 0, w: 50, h: 50 },
  ], src(), true);
  assert.doesNotMatch(page.toStructuredText().asText(), /Old heading|New/);
  assert.equal(pageObjects(page).images.length, 1);
});

test('on a turned page the new text still reads left to right as the page is seen', () => {
  const doc = src();
  doc.findPage(0).put('Rotate', 90);
  const page = apply([{ kind: 'text', text: 'Turned page note', x: 100, y: 100, w: 300, h: 30, size: 16, color: ink, bold: false, align: 'left' }], doc);
  const line = pageObjects(page).lines.find((l) => l.text === 'Turned page note');
  assert.ok(line && line.w > line.h, 'horizontal');
  assert.ok(Math.abs(line.x - 100) < 1);
  fs.writeFileSync(new URL('../../test-results/editpage-turned.png', import.meta.url), page.toPixmap(m.Matrix.identity, m.ColorSpace.DeviceRGB, false).asPNG());
});

const replace = (text, bold = false) => {
  const line = pageObjects(arabicDoc().loadPage(0)).lines[0];
  return { line, page: apply([{ kind: 'text', from: line, text, x: line.x - 100, y: line.y, w: line.w + 100, h: line.h, size: line.size, color: line.color, bold, align: 'right' }], arabicDoc()) };
};
const embedded = (page, y) => fontAt(page, { x: 0, y: y - 30, w: 595, h: 40 });

test('a replaced Arabic line keeps its own embedded font, joins and extracts as normal Arabic', () => {
  const { line, page } = replace('عليكم السلام');
  assert.equal(line.font, 'NotoNaskhArabic');
  assert.equal(pick(hb, embedded(arabicDoc().loadPage(0), 100), 'عليكم السلام', false, file).using, null);
  const f = embedded(page, line.base);
  assert.match(f.getName(), /NotoNaskhArabic/);
  assert.equal(f.getBuffer().asUint8Array().length, SUB.length, 'the PDF’s own subset, not a bundled font');
  const text = page.toStructuredText().asText();
  assert.match(text, /عليكم السلام/);
  assert.doesNotMatch(text, /[ﭐ-﻿]/,'no presentation forms in the copied text');
  // joined: the word's glyphs are the font's initial/medial/final shapes, not its isolated letters
  const s = shaper(hb, 'sub', SUB), joined = shape(hb, s, 'عليكم', 24).glyphs.map((g) => g.gid);
  const isolated = [...'عليكم'].map((c) => s.font.nominalGlyph(c.codePointAt(0)));
  assert.ok(joined.every((g) => !isolated.includes(g)), JSON.stringify({ joined, isolated }));
  const c = page.getObject().get('Contents'), contents = (c.isArray() ? [...Array(c.length).keys()].map((i) => c.get(i)) : [c]).map((x) => x.readStream().asString()).join(' ');
  for (const g of joined) assert.ok(contents.includes('<' + g.toString(16).padStart(4, '0') + '>'), 'glyph ' + g + ' written');
  fs.writeFileSync(new URL('../../test-results/editpage-own-font.png', import.meta.url), page.toPixmap(m.Matrix.scale(2, 2), m.ColorSpace.DeviceRGB, false).asPNG());
});

test('harakat stay: a fatha in the new text is drawn above its letter and copies back', () => {
  const { page } = replace('عَليكم السلام');
  assert.match(page.toStructuredText().asText(), /عَليكم السلام/);
  const s = shaper(hb, 'sub', SUB), [g] = shape(hb, s, 'عَ', 24).glyphs.filter((g) => g.uni[0] === 0x64e);
  assert.ok(g && g.gid && s.font.glyphToPath(g.gid), 'the fatha is a real glyph of the subset');
});

test('letters the subset lacks: the full bundled font is used and the missing letters are reported', () => {
  const p = pick(hb, embedded(arabicDoc().loadPage(0), 100), 'جديد عليكم', false, file);
  assert.deepEqual(p.missing.sort(), ['ج', 'د']);
  assert.equal(p.using, 'Noto Naskh Arabic'); // the same family, whole
  const { line, page } = replace('جديد عليكم');
  assert.match(page.toStructuredText().asText(), /جديد عليكم/);
  assert.equal(embedded(page, line.base).getBuffer().asUint8Array().length, FULL.length);
  // a font Waraq does not have: the closest bundled one (here a sans line in Helvetica, not embedded)
  const helv = pick(hb, fontAt(src().loadPage(0), pageObjects(src().loadPage(0)).lines[0]), 'عنوان', true, file);
  assert.equal(helv.using, 'Noto Sans Arabic Bold');
});
