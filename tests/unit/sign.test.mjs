// Self-check of signing mode with the real engine build:  node --test tests/unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import { findSpots, placeSet, setEdits, signPdf, formatDate } from '../../src/lib/engine/sign.ts';
import { autoThreshold, cleanSignature, INKS } from '../../src/lib/signature.ts';
import { pageObjects } from '../../src/lib/engine/editpage.ts';

const read = (f) => fs.readFileSync(new URL('../fixtures/' + f, import.meta.url));
const font = (f) => new m.Font(f, fs.readFileSync(new URL('../../public/fonts/' + f + '.ttf', import.meta.url)));
const fonts = { regular: font('Tajawal-Regular'), bold: font('Tajawal-Bold') };
const spots = (f) => { const d = m.Document.openDocument(read(f), 'application/pdf'); return [...Array(d.countPages())].flatMap((_, i) => findSpots(d.loadPage(i), i)); };
const inside = (a, b, tol = 1) => a.x >= b.x - tol && a.y >= b.y - tol && a.x + a.w <= b.x + b.w + tol && a.y + a.h <= b.y + b.h + tol;

// the signature photo: paper with noise and a shadow, dark blue strokes from x 60..300, y ~53..122
const photo = () => { const p = new m.Image(read('signature-photo.png')).toPixmap(), w = p.getWidth(), h = p.getHeight(), rgb = p.getPixels(), d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) { d[j] = rgb[i]; d[j + 1] = rgb[i + 1]; d[j + 2] = rgb[i + 2]; d[j + 3] = 255; } return { data: d, width: w, height: h }; };

test('background removal: paper transparent, ink kept and recoloured, cropped to the ink', () => {
  const src = photo(), t = autoThreshold(src);
  assert.ok(t > 60 && t < 190, 'threshold between ink (~40) and paper (~200): ' + t);
  const out = cleanSignature(src, t, INKS.blueColour);
  assert.ok(Math.abs(out.width - 245) <= 4 && Math.abs(out.height - 73) <= 6, `cropped to the ink: ${out.width} x ${out.height}`);
  let paper = 0, ink = 0, other = 0;
  for (let i = 3; i < out.data.length; i += 4) out.data[i] === 0 ? paper++ : out.data[i] === 255 ? ink++ : other++;
  assert.ok(ink > 1500 && paper > ink, `ink ${ink}, paper ${paper}`);
  assert.ok(other < ink / 2, 'only the edges are half transparent');
  const at = out.data.findIndex((v, i) => i % 4 === 3 && v === 255) - 3;
  assert.deepEqual([...out.data.slice(at, at + 3)], [...INKS.blueColour]);
  // a higher threshold keeps more (the slider), an empty picture gives a 1 x 1 transparent one
  assert.ok(cleanSignature(src, 255, INKS.black).width === src.width);
  assert.equal(cleanSignature({ data: new Uint8ClampedArray(16).fill(255), width: 2, height: 2 }, 128, INKS.black).width, 1);
});

test('spots in English: "Signature: ____" and "Date: ____" on page 1, an empty signature field on page 2', () => {
  const s = spots('sign-en.pdf');
  assert.deepEqual(s.map((x) => [x.page, x.kind, !!x.field]), [[0, 'sign', false], [0, 'date', false], [1, 'sign', true]]);
  const [sig, date, field] = s;
  assert.ok(sig.x > sig.label.x + sig.label.w - 2 && sig.w > 100, 'the blank after the label: ' + JSON.stringify(sig));
  assert.ok(Math.abs(sig.y + sig.h - 646) < 3 && date.x > 370, JSON.stringify(date));
  assert.deepEqual([field.x, field.y, field.w, field.h].map(Math.round), [72, 572, 200, 50]);
  // words in sentences are not spots
  const doc = new m.PDFDocument(), f = doc.addSimpleFont(new m.Font('Helvetica'));
  doc.insertPage(-1, doc.addPage([0, 0, 595, 842], 0, { Font: { F1: f } }, 'BT /F1 12 Tf 72 700 Td (This agreement was signed on the date written in the first part.) Tj ET'));
  assert.deepEqual(findSpots(doc.loadPage(0), 0), []);
});

test('spots in Arabic: «الاسم والتوقيع: ____» and «التاريخ: ____» on page 2, the blank to the left', () => {
  const s = spots('sign-ar.pdf');
  assert.deepEqual(s.map((x) => [x.page, x.kind, x.rtl]), [[1, 'sign', true], [1, 'date', true]]);
  const [sig, date] = s;
  assert.ok(sig.x + sig.w <= sig.label.x + 2 && sig.w > 100, JSON.stringify(sig));
  assert.ok(sig.label.w > 60, 'the whole «الاسم والتوقيع» is the label: ' + sig.label.w);
  assert.ok(Math.abs(date.y - 641) < 3 && date.x + date.w <= date.label.x + 2, JSON.stringify(date));
});

test('the set is placed at the right boxes: signature on the blank, date on the date blank, same spacing', () => {
  const set = { ratio: 3, name: 'Abdullah', date: '19/10/2026' };
  const [sig, date, field] = spots('sign-en.pdf');
  const a = placeSet(set, sig, date);
  assert.ok(a.sig.x >= sig.x - 1 && a.sig.x + a.sig.w <= sig.x + sig.w + 1, 'within the blank');
  assert.ok(a.sig.y + a.sig.h > sig.y + sig.h - 2 && a.sig.y < sig.y + sig.h, 'sits on the line');
  assert.ok(inside(a.date, { ...date, h: date.h + 4 }) || a.date.x === date.x, 'date on the date blank: ' + JSON.stringify(a.date));
  assert.ok(a.name.y >= a.sig.y + a.sig.h, 'name under the signature');
  const b = placeSet(set, field);
  assert.ok(inside(b.sig, field), 'inside the signature field: ' + JSON.stringify(b.sig));
  // without a date spot the date keeps the fixed distance under the name, the same for every file
  const c = placeSet(set, { ...sig, y: sig.y + 100 }), d = placeSet(set, sig);
  assert.equal(+(c.date.y - c.sig.y).toFixed(3), +(d.date.y - d.sig.y).toFixed(3));
});

test('signed PDF: the PNG keeps its transparency, the date is real text, links and fields stay', () => {
  const set = { ratio: 3, name: 'عبدالله', date: formatDate(new Date(2026, 9, 19), 'gregory', 'numeric', 'ar') };
  assert.equal(set.date, '19/10/2026');
  // the signature: blue strokes on transparent paper
  const ink = cleanSignature(photo(), 150, INKS.blueColour), pix = new m.Pixmap(m.ColorSpace.DeviceRGB, [0, 0, ink.width, ink.height], true), px = pix.getPixels();
  px.set(ink.data);
  const png = pix.asPNG();
  const [sig, date] = spots('sign-ar.pdf'), p = placeSet({ ...set, ratio: ink.width / ink.height }, sig, date);
  const bytes = signPdf(m, read('sign-ar.pdf'), [{ page: 1, edits: setEdits(set, p, [0.08, 0.25, 0.63]) }], [png], () => fonts);
  const doc = m.Document.openDocument(bytes, 'application/pdf');
  assert.equal(doc.countPages(), 2);
  const page = doc.loadPage(1), text = page.toStructuredText().asText();
  assert.match(text, /19\/10\/2026/); assert.match(text, /عبدالله/); assert.match(text, /التوقيع/);
  assert.equal(pageObjects(page).images.length, 1);
  // the signature's paper is transparent: inside its box the page is mostly still white, and what was drawn there
  // before (the blank's underscores) still shows
  const k = 2, render = (pg) => { const x = pg.toPixmap(m.Matrix.scale(k, k), m.ColorSpace.DeviceRGB, false); return { W: x.getWidth(), s: x.getPixels().slice() }; }; // a copy: the pixels live in engine memory
  const before = render(m.Document.openDocument(read('sign-ar.pdf'), 'application/pdf').loadPage(1)), after = render(page);
  let white = 0, all = 0, was = 0, kept = 0;
  for (let y = Math.ceil(p.sig.y * k); y < (p.sig.y + p.sig.h) * k; y++) for (let x = Math.ceil(p.sig.x * k); x < (p.sig.x + p.sig.w) * k; x++) {
    const i = (y * after.W + x) * 3; all++;
    if (after.s[i] > 240 && after.s[i + 2] > 240) white++;
    if (before.s[i] < 120) { was++; if (after.s[i] < 200) kept++; }
  }
  assert.ok(white > all * 0.5, `white ${white} of ${all}`);
  assert.ok(was > 20 && kept >= was * 0.95, `underscores ${was}, still drawn ${kept}`);
  // a page with a link and a form field keeps them
  const en = signPdf(m, read('sign-en.pdf'), [{ page: 0, edits: setEdits(set, placeSet(set, spots('sign-en.pdf')[0])) }], [png], () => fonts);
  const d2 = m.Document.openDocument(en, 'application/pdf').asPDF();
  assert.equal(d2.loadPage(1).getWidgets().length, 1);
  assert.match(d2.loadPage(0).toStructuredText().asText(), /Signature: _+[\s\S]*19\/10\/2026/);
  // signed again later (another date): the first date and the page's own Arabic still read as text
  const again = signPdf(m, bytes, [{ page: 1, edits: setEdits({ ...set, date: '20/10/2026' }, placeSet(set, { ...sig, y: sig.y + 120 })) }], [png], () => fonts);
  const t2 = m.Document.openDocument(again, 'application/pdf').loadPage(1).toStructuredText().asText();
  assert.match(t2, /19\/10\/2026/); assert.match(t2, /20\/10\/2026/); assert.match(t2, /التوقيع/);
});

test('session date: Gregorian and Hijri, numeric / long / ISO', () => {
  const d = new Date(2026, 9, 19);
  assert.equal(formatDate(d, 'gregory', 'iso', 'en'), '2026-10-19');
  assert.equal(formatDate(d, 'gregory', 'long', 'en'), '19 October 2026');
  assert.equal(formatDate(d, 'gregory', 'long', 'ar'), '19 أكتوبر 2026');
  assert.match(formatDate(d, 'islamic-umalqura', 'numeric', 'ar'), /^\d\d\/\d\d\/14\d\d هـ$/);
  assert.match(formatDate(d, 'islamic-umalqura', 'long', 'en'), /^\d+ .+ 14\d\d AH$/);
});

// ---- labels as other producers print them (MuPDF reads a right-to-left line in visual order: the colon can come first), bilingual labels, filled dates
const corpus = (f) => new Uint8Array(fs.readFileSync(new URL('../fixtures/arabic-create/base/' + f + '.pdf', import.meta.url)));
const spotsOf = (bytes) => { const d = m.Document.openDocument(bytes, 'application/pdf'), pg = d.loadPage(0); try { return findSpots(pg, 0); } finally { pg.destroy(); } };

test('a label with more words («ختم وتوقيع:») is found as a signature spot', () => {
  const s = spotsOf(corpus('invoice-a4')).filter((x) => x.kind === 'sign');
  assert.equal(s.length, 1); assert.ok(s[0].rtl && s[0].x > 250 && s[0].x < 360 && s[0].y > 495 && s[0].y < 530, JSON.stringify(s[0]));
});

test('«Signature / التوقيع:» and «Date / التاريخ:» are one spot each, not two', () => {
  const s = spotsOf(corpus('letter-letter')); assert.deepEqual(s.map((x) => x.kind).sort(), ['date', 'sign']);
});

test('a date label that already has its date gets no date spot; its signature line still gets a sign spot', () => {
  const s = spotsOf(corpus('letter-a4')); assert.deepEqual(s.map((x) => x.kind), ['sign']);
});

test('the date can be written with Arabic-Indic digits (Gregorian and Hijri, numeric, long, year first); the default stays 0-9', () => {
  const d = new Date(2026, 9, 21);
  assert.equal(formatDate(d, 'gregory', 'numeric', 'ar', 'arab'), '٢١/١٠/٢٠٢٦');
  assert.equal(formatDate(d, 'gregory', 'iso', 'ar', 'arab'), '٢٠٢٦-١٠-٢١');
  assert.equal(formatDate(d, 'gregory', 'long', 'ar', 'arab'), '٢١ أكتوبر ٢٠٢٦');
  assert.match(formatDate(d, 'islamic-umalqura', 'numeric', 'ar', 'arab'), /^[٠-٩]{2}\/[٠-٩]{2}\/[٠-٩]{4} هـ$/);
  assert.equal(formatDate(d, 'gregory', 'numeric', 'ar'), '21/10/2026');
  assert.equal(formatDate(d, 'gregory', 'numeric', 'en', 'arab'), '٢١/١٠/٢٠٢٦');
});

test('a long name is shrunk to its line and never runs over the date', () => {
  const ink = (bytes, b) => { const pix = m.Document.openDocument(bytes, 'application/pdf').loadPage(0).toPixmap(m.Matrix.scale(2, 2), m.ColorSpace.DeviceGray, false), px = pix.getPixels(), W = pix.getWidth(); let n = 0, x0 = 1e9, x1 = -1;
    for (let y = Math.floor(b.y * 2); y < Math.ceil((b.y + b.h) * 2); y++) for (let x = Math.floor(b.x * 2); x < Math.ceil((b.x + b.w) * 2); x++) if (px[y * W + x] < 140) { n++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); } return { n, w: (x1 - x0 + 1) / 2 }; };
  const blank = (() => { const d = new m.PDFDocument(); d.insertPage(-1, d.addPage([0, 0, 595, 842], 0, {}, '')); return d.saveToBuffer('').asUint8Array().slice(); })();
  const set = { ratio: 3, name: 'عبدالله محمد الأحمد الحربي الشمري الدوسري القحطاني الغامدي', date: '21/10/2026' }, p = placeSet(set, { x: 200, y: 300, w: 200, h: 16, rtl: true });
  const edits = setEdits(set, p), onlyDate = edits.filter((e) => e.kind === 'text' && e.text === set.date);
  const a = signPdf(m, blank, [{ page: 0, edits: edits.filter((e) => e.kind === 'text') }], [], () => fonts), b = signPdf(m, blank, [{ page: 0, edits: onlyDate }], [], () => fonts);
  assert.equal(ink(a, p.date).n, ink(b, p.date).n, 'the date box holds only the date');
  const nm = ink(a, { x: p.name.x - 20, y: p.name.y, w: p.name.w + 40, h: p.name.h + 1 });
  assert.ok(nm.n > 100 && nm.w <= p.name.w + 1, `name drawn on one line inside its box: ${nm.w} vs ${p.name.w}`);
});
