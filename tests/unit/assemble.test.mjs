// Self-check of page assembly with the real engine build:  node --test tests/unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import { assemble } from '../../src/lib/engine/assemble.ts';

const small = fs.readFileSync(new URL('../fixtures/small.pdf', import.meta.url));
const pix = new m.Pixmap(m.ColorSpace.DeviceRGB, [0, 0, 300, 150], false);
pix.clear(200);
const png = pix.asPNG();
const sources = new Map([
  [1, { doc: m.Document.openDocument(small, 'application/pdf'), bytes: small }],
  [2, { doc: m.Document.openDocument(png, 'image/png'), bytes: png }],
]);

test('pages are copied in order, turned, image fills the neighbour size, numbers and bookmarks added', () => {
  const pages = sources.get(1).doc.countPages();
  const bytes = assemble(m, (id) => sources.get(id), {
    items: [{ doc: 1, page: 0, rotate: 90 }, { doc: 2, page: 0, fit: { w: 595, h: 842 } }, { doc: 1, page: 0, rotate: -90 }],
    bookmarks: [{ title: 'الأسبوع 1', at: 0 }, { title: 'Week 2', at: 1 }],
    numbers: true,
  });
  const out = m.Document.openDocument(bytes, 'application/pdf');
  assert.equal(out.countPages(), 3);
  assert.equal(out.asPDF().findPage(0).get('Rotate').asNumber(), 90);
  assert.equal(out.asPDF().findPage(2).get('Rotate').asNumber(), 270);
  assert.deepEqual(out.loadPage(1).getBounds().map(Math.round), [0, 0, 595, 842]);
  assert.deepEqual(out.loadOutline().map((o) => [o.title, o.page]), [['الأسبوع 1', 0], ['Week 2', 1]]);
  for (let i = 0; i < 3; i++) assert.match(out.loadPage(i).toStructuredText().asText(), new RegExp(`(^|\\s)${i + 1}\\s*$`));
  assert.ok(pages >= 1);
});

test('divider and contents pages: real Arabic text, rows link to their page, numbers on one section only', async () => {
  const font = (f) => new m.Font(f, fs.readFileSync(new URL('../../public/fonts/' + f + '.ttf', import.meta.url)));
  const fonts = { regular: font('Tajawal-Regular'), bold: font('Tajawal-Bold') };
  const A4 = { w: 595, h: 842 };
  const bytes = assemble(m, (id) => sources.get(id), {
    items: [
      { toc: { ...A4, heading: 'المحتويات', rtl: true, entries: [{ title: 'الأسبوع الأول: مقدمة', number: 2, to: 1 }, { title: 'Week 2 (lab)', number: 4, to: 3 }] } },
      { divider: { ...A4, label: 'القسم 1', title: 'الأسبوع الأول: مقدمة', note: 'سلام عليكم' } },
      { doc: 1, page: 0 },
      { divider: { ...A4, label: 'Section 2', title: 'Week 2 (lab)' } },
      { blank: true, fit: A4 },
    ],
    numbers: [3, 4],
  }, () => fonts);
  const out = m.Document.openDocument(bytes, 'application/pdf');
  assert.equal(out.countPages(), 5);
  const text = (i) => out.loadPage(i).toStructuredText().asText();
  assert.match(text(1), /الأسبوع الأول: مقدمة/);
  assert.match(text(1), /سلام عليكم/);
  assert.match(text(0), /Week 2 \(lab\)/);
  const links = out.loadPage(0).getLinks().map((l) => out.resolveLink(l));
  assert.deepEqual(links, [1, 3]);
  assert.match(text(3), /\b1\s*$/);
  assert.match(text(4), /^\s*2\s*$/);
  for (let i = 0; i < 2; i++) fs.writeFileSync(new URL(`../../test-results/textpage-${i}.png`, import.meta.url), out.loadPage(i).toPixmap(m.Matrix.scale(1, 1), m.ColorSpace.DeviceRGB, false).asPNG());
});
