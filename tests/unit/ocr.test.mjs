// Self-check of the invisible text layer with the real engine build:  pnpm test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import { addTextLayer, layerWords, stripInvisible } from '../../src/lib/engine/ocr.ts';
import { unturn, countRules, unevenness } from '../../src/lib/ocr-clean.ts';
import { plausible, upright } from '../../src/lib/ocr.ts';

const scan = fs.readFileSync(new URL('../fixtures/scan.pdf', import.meta.url));
const font = (f) => new m.Font(f, fs.readFileSync(new URL('../../public/fonts/' + f + '.ttf', import.meta.url)));
const fonts = { regular: font('Tajawal-Regular'), bold: font('Tajawal-Bold') };
const open = (b) => m.Document.openDocument(b, 'application/pdf');
const pixels = (b) => open(b).loadPage(0).toPixmap(m.Matrix.identity, m.ColorSpace.DeviceRGB, false).getPixels();

test('text layer: search and copy find English and Arabic words, nothing changes on the page, the words sit where the picture shows them', () => {
  assert.equal(open(scan).loadPage(0).toStructuredText().asText().trim(), '');
  const k = 3; // the picture was drawn at 3 pixels per point; the page is 595 x 400
  const out = addTextLayer(m, scan, [{ page: 0, scale: k, lines: [
    { words: [{ text: 'Invoice', x0: 60 * k, y0: 85 * k, x1: 170 * k, y1: 115 * k }, { text: 'number', x0: 180 * k, y0: 85 * k, x1: 260 * k, y1: 115 * k }] },
    { words: [{ text: 'مرحبا', x0: 450 * k, y0: 230 * k, x1: 535 * k, y1: 270 * k }, { text: 'بكم', x0: 390 * k, y0: 230 * k, x1: 440 * k, y1: 270 * k }, { text: 'في', x0: 350 * k, y0: 230 * k, x1: 380 * k, y1: 270 * k }] },
    { words: [{ text: '  ', x0: 0, y0: 0, x1: 10, y1: 10 }] },
  ] }], fonts);
  const page = open(out).loadPage(0), text = page.toStructuredText().asText();
  assert.match(text, /Invoice number/);
  assert.match(text, /مرحبا بكم في/); // one printed line copies as one line, words joined in reading order
  const hit = page.search('Invoice')[0][0]; // a quad: x of its left edge and y of its top, in points
  assert.ok(hit[0] > 55 && hit[0] < 120 && hit[1] > 80 && hit[1] < 120, 'found at ' + hit); // inside its box 60..170
  assert.equal(page.search('بكم').length, 1);
  const ar = page.search('بكم')[0][0]; // the hit sits on that word's own box (390..440), not elsewhere on the line
  assert.ok(ar[0] > 385 && ar[2] < 445, 'found at ' + ar);
  assert.deepEqual(Buffer.from(pixels(out)), Buffer.from(pixels(scan))); // invisible: every pixel is as before
  assert.equal(open(out).countPages(), 1); // the same page, nothing added
  // every word's box, as selection sees it, covers at least 60 % of the box it was recognised in
  const given = { Invoice: [60, 85, 170, 115], number: [180, 85, 260, 115], 'مرحبا': [450, 230, 535, 270], 'بكم': [390, 230, 440, 270], 'في': [350, 230, 380, 270] };
  const words = layerWords(m, out, 0);
  assert.equal(words.length, 5, words.map((w) => w.text).join(' '));
  for (const w of words) {
    const [x0, y0, x1, y1] = given[w.text], cover = Math.max(0, Math.min(x1, w.x1) - Math.max(x0, w.x0)) * Math.max(0, Math.min(y1, w.y1) - Math.max(y0, w.y0)) / ((x1 - x0) * (y1 - y0));
    assert.ok(cover >= 0.6, `${w.text} covers ${cover.toFixed(2)} of its box`);
  }
});

test('a layer read on a straightened picture is turned back: each word lands where it is printed on the tilted page', () => {
  const k = 3, w = 595 * k, h = 400 * k, angle = 10; // the picture was turned 10° to read it
  const words = [{ text: 'Invoice', x0: 60 * k, y0: 85 * k, x1: 150 * k, y1: 115 * k }, { text: 'number', x0: 160 * k, y0: 85 * k, x1: 250 * k, y1: 115 * k }, { text: 'مرحبا', x0: 450 * k, y0: 230 * k, x1: 535 * k, y1: 270 * k }];
  const out = addTextLayer(m, scan, [{ page: 0, scale: k, lines: [{ words: words.slice(0, 2) }, { words: words.slice(2) }], tilt: { angle, w, h } }], fonts);
  const layer = layerWords(m, out, 0);
  for (const g of words) {
    const want = unturn(g, angle, w, h), cx = (want.x0 + want.x1) / 2 / k, cy = (want.y0 + want.y1) / 2 / k; // where the word is on the page
    const got = layer.find((l) => l.text === g.text);
    assert.ok(got, g.text);
    const dx = (got.x0 + got.x1) / 2 - cx, dy = (got.y0 + got.y1) / 2 - cy;
    assert.ok(Math.hypot(dx, dy) < 4, `${g.text} is ${Math.hypot(dx, dy).toFixed(1)} pt off (${dx.toFixed(1)}, ${dy.toFixed(1)})`);
  }
  assert.match(open(out).loadPage(0).toStructuredText().asText(), /Invoice number/);
});

test('a sheet scanned sideways: read after a quarter turn, the words land where they are printed on the page', () => {
  const k = 3, w = 595 * k, h = 400 * k; // the picture was turned 90 degrees clockwise to read it: the read picture is h x w
  const words = [{ text: 'Invoice', x0: 300, y0: 200, x1: 390, y1: 230 }, { text: 'مرحبا', x0: 700, y0: 1200, x1: 790, y1: 1240 }]; // boxes on the turned picture
  const out = addTextLayer(m, scan, [{ page: 0, scale: k, lines: [{ words: [words[0]] }, { words: [words[1]] }], tilt: { angle: 0, w, h, quarter: 1 } }], fonts);
  const layer = layerWords(m, out, 0);
  for (const g of words) {
    const want = unturn(g, 0, w, h, 1), cx = (want.x0 + want.x1) / 2 / k, cy = (want.y0 + want.y1) / 2 / k, got = layer.find((l) => l.text === g.text);
    assert.ok(got, g.text);
    const d = Math.hypot((got.x0 + got.x1) / 2 - cx, (got.y0 + got.y1) / 2 - cy);
    assert.ok(d < 4, `${g.text} is ${d.toFixed(1)} pt off (want ${cx.toFixed(0)}, ${cy.toFixed(0)}; got ${((got.x0 + got.x1) / 2).toFixed(0)}, ${((got.y0 + got.y1) / 2).toFixed(0)})`);
    assert.ok(cx > 0 && cx < 595 && cy > 0 && cy < 400, 'on the page');
  }
});

test('a hybrid PDF: the wrong invisible layer from before is removed when the page is read again, visible text stays', () => {
  const k = 3, wrong = addTextLayer(m, scan, [{ page: 0, scale: k, lines: [{ words: [{ text: 'WRONGWORD', x0: 60 * k, y0: 85 * k, x1: 170 * k, y1: 115 * k }] }] }], fonts);
  assert.match(open(wrong).loadPage(0).toStructuredText().asText(), /WRONGWORD/);
  const right = addTextLayer(m, wrong, [{ page: 0, scale: k, lines: [{ words: [{ text: 'Invoice', x0: 60 * k, y0: 85 * k, x1: 170 * k, y1: 115 * k }] }] }], fonts);
  const text = open(right).loadPage(0).toStructuredText().asText();
  assert.match(text, /Invoice/);
  assert.doesNotMatch(text, /WRONGWORD/);
  assert.deepEqual(Buffer.from(pixels(right)), Buffer.from(pixels(scan)));
  // visible text is kept: a page that has a real heading
  const three = fs.readFileSync(new URL('../fixtures/three.pdf', import.meta.url)), d = open(three).asPDF();
  stripInvisible(d.findPage(0));
  assert.match(d.loadPage(0).toStructuredText().asText(), /Page one/);
});

test('clean-up helpers: ruled lines are counted, thick bands and short strokes are not; a shaded photo counts as uneven', () => {
  const w = 400, h = 300, px = new Uint8Array(w * h).fill(255);
  for (let x = 20; x < 380; x++) px[150 * w + x] = 0; // a table border
  for (let x = 100; x < 130; x++) px[80 * w + x] = 0; // a short dash
  for (let y = 20; y < 280; y++) px[y * w + 200] = 0; // a column border
  assert.deepEqual(countRules({ w, h, px }), { across: 1, down: 1 }); // the border across, the border down; the short dash is neither
  const text = new Uint8Array(w * h).fill(255); for (let y = 148; y < 160; y++) for (let x = 20; x < 380; x++) text[y * w + x] = 0; // a thick dark band: a line of joined letters, not a rule
  assert.deepEqual(countRules({ w, h, px: text }), { across: 0, down: 0 });
  const flat = { w, h, px: new Uint8Array(w * h).fill(240) }, shaded = { w, h, px: new Uint8Array(w * h).map((_, i) => 255 - Math.floor((i % w) / 4)) };
  assert.ok(unevenness(flat) < 30); assert.ok(unevenness(shaded) > 30);
});

test('plausible words: Arabic with the article and the commonest short words count, rubbish does not', () => {
  const lines = [{ words: ['القراءة', 'في', 'المكتبة', 'xqzv', 'والكتب', 'the', 'كتاب'].map((text) => ({ text, x0: 0, x1: 1, y0: 0, y1: 1 })) }];
  assert.equal(plausible(lines), 5); // القراءة في المكتبة والكتب the
});

test('upright: the sheet belongs to the first of the best pair of neighbouring orientations, and only a clear win turns it', async () => {
  // a grey picture whose corner pixel marks how it was turned (1 at the top left when untouched); the fake reader reads the page
  // well at the right way up and one turn on from it (as Tesseract does), badly elsewhere
  const g = { w: 8, h: 6, px: new Uint8Array(48) }; for (const i of [0, 1, 8, 9]) g.px[i] = 255; // 2 x 2: it survives the half-size copy
  const orientation = (x) => { const i = x.px.indexOf(255), cx = i % x.w, cy = Math.floor(i / x.w); return cx < x.w / 2 ? (cy < x.h / 2 ? 0 : 3) : (cy < x.h / 2 ? 1 : 2); };
  const reader = (needs, words = 20) => async (x) => { const n = [needs, (needs + 1) % 4].includes(orientation(x)) ? words : 1; return [{ confidence: 90, words: Array.from({ length: n }, () => ({ text: 'القراءة', x0: 0, x1: 1, y0: 0, y1: 1 })) }]; };
  for (const needs of [0, 1, 2, 3]) assert.equal((await upright(reader(needs), g, 100)).quarter, needs, 'a sheet that needs ' + needs);
  assert.equal((await upright(reader(2, 2), g, 100)).quarter, 0); // a sparse page (a couple of words) is never turned
});
