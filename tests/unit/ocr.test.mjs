// Self-check of the invisible text layer with the real engine build:  pnpm test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import { addTextLayer, layerWords } from '../../src/lib/engine/ocr.ts';
import { unturn } from '../../src/lib/ocr-clean.ts';

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
