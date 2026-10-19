// Self-checks of the Portfolio page designs (cover, section pages, paper) with the real engine:  pnpm test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import { assemble } from '../../src/lib/engine/assemble.ts';
import { DESIGNS, COLOURS } from '../../src/lib/engine/designs.ts';

const font = (f) => new m.Font(f, fs.readFileSync(new URL('../../public/fonts/' + f + '.ttf', import.meta.url)));
const fonts = { regular: font('Tajawal-Regular'), bold: font('Tajawal-Bold') };
const logo = new m.Pixmap(m.ColorSpace.DeviceRGB, [0, 0, 200, 100], false); logo.clear(60);
const png = logo.asPNG(), src = { doc: m.Document.openDocument(png, 'image/png'), bytes: png };
const A4 = { w: 595, h: 842 };
const out = (dir) => new URL(`../../test-results/${dir}`, import.meta.url);

test('every design: cover with three logos, names and supervisor; section page with logos, header and note', () => {
  fs.mkdirSync(out('designs'), { recursive: true });
  for (const [i, design] of DESIGNS.entries()) {
    const color = COLOURS[i % COLOURS.length];
    const bytes = assemble(m, () => src, { items: [
      { cover: { ...A4, design, color, rtl: true, title: 'مقرر التصميم ١٠١', subtitle: 'الفصل الأول 2026', names: ['عبدالله', 'Sara Ali'], supervisor: 'د. أحمد', supervisorLabel: 'إشراف:', logos: { left: 1, center: 1, right: 1 } } },
      { divider: { ...A4, design, color, rtl: true, label: 'القسم 1', title: 'الأسبوع الأول', note: 'ملاحظة', logos: { left: 1, right: 1 }, header: { title: 'مقرر التصميم', name: 'عبدالله', size: 'small' } } },
      { divider: { ...A4, design, color, rtl: false, label: 'Section 2', title: 'Week 2', header: { title: 'Design 101', name: 'Abdullah', size: 'big' } }, rotate: 90 },
    ] }, () => fonts);
    const doc = m.Document.openDocument(bytes, 'application/pdf');
    assert.equal(doc.countPages(), 3);
    const cover = doc.loadPage(0).toStructuredText().asText();
    for (const s of ['مقرر التصميم', 'عبدالله', 'Sara Ali', 'إشراف: د. أحمد']) assert.ok(cover.includes(s), `${design}: ${s} in ${cover}`);
    const json = JSON.parse(doc.loadPage(0).toStructuredText('preserve-images').asJSON());
    assert.equal(json.blocks.filter((b) => b.type === 'image').length, 3, design + ': three logos');
    assert.match(doc.loadPage(1).toStructuredText().asText(), /الأسبوع الأول/);
    assert.match(doc.loadPage(1).toStructuredText().asText(), /مقرر التصميم/);
    assert.equal(doc.asPDF().findPage(2).get('Rotate').asNumber(), 90);
    for (const i of [0, 1]) fs.writeFileSync(out(`designs/${design}-${i}.png`), doc.loadPage(i).toPixmap(m.Matrix.scale(0.6, 0.6), m.ColorSpace.DeviceRGB, false).asPNG());
  }
});

test('paper pages: lined, grid and dotted pages have their lines; plain stays empty', () => {
  const bytes = assemble(m, () => src, { items: ['plain', 'lined', 'grid', 'dotted'].map((paper) => ({ blank: true, fit: A4, paper })) }, () => fonts);
  const doc = m.Document.openDocument(bytes, 'application/pdf');
  const ink = (i) => { const p = doc.loadPage(i).toPixmap(m.Matrix.scale(0.5, 0.5), m.ColorSpace.DeviceGray, false).getPixels(); let n = 0; for (const v of p) if (v < 250) n++; return n; };
  assert.equal(ink(0), 0);
  for (const i of [1, 2, 3]) assert.ok(ink(i) > 500, 'paper ' + i);
  fs.writeFileSync(out('designs/paper-lined.png'), doc.loadPage(1).toPixmap(m.Matrix.scale(0.6, 0.6), m.ColorSpace.DeviceRGB, false).asPNG());
});

test('photo cover: across the top or over the whole page, text stays real and readable', () => {
  const photo = new m.Pixmap(m.ColorSpace.DeviceRGB, [0, 0, 1200, 800], false);
  const px = photo.getPixels(); for (let i = 0; i < px.length; i += 3) { px[i] = (i / 3) % 1200 / 5; px[i + 1] = 120; px[i + 2] = 200; }
  const jpg = photo.asJPEG(80), pic = { doc: m.Document.openDocument(jpg, 'image/jpeg'), bytes: jpg };
  for (const place of ['top', 'full']) {
    const bytes = assemble(m, (id) => (id === 2 ? pic : src), { items: [{ cover: { ...A4, design: 'classic', color: '#1f3a5f', rtl: false, title: 'Design 101', names: ['Abdullah'],
      supervisor: 'Dr Ahmed', supervisorLabel: 'Supervisor:', logos: { center: 1 }, photo: { doc: 2, place } } }] }, () => fonts);
    const doc = m.Document.openDocument(bytes, 'application/pdf'), text = doc.loadPage(0).toStructuredText().asText();
    for (const s of ['Design 101', 'Abdullah', 'Supervisor: Dr Ahmed']) assert.ok(text.includes(s), place + ': ' + s);
    const imgs = JSON.parse(doc.loadPage(0).toStructuredText('preserve-images').asJSON()).blocks.filter((b) => b.type === 'image');
    assert.equal(imgs.length, 2, place + ': photo + logo');
    fs.writeFileSync(out(`designs/photo-${place}.png`), doc.loadPage(0).toPixmap(m.Matrix.scale(0.6, 0.6), m.ColorSpace.DeviceRGB, false).asPNG());
  }
});
