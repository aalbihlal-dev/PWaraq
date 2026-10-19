// Self-check of the invisible text layer with the real engine build:  pnpm test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import { addTextLayer } from '../../src/lib/engine/ocr.ts';

const scan = fs.readFileSync(new URL('../fixtures/scan.pdf', import.meta.url));
const font = (f) => new m.Font(f, fs.readFileSync(new URL('../../public/fonts/' + f + '.ttf', import.meta.url)));
const fonts = { regular: font('Tajawal-Regular'), bold: font('Tajawal-Bold') };
const open = (b) => m.Document.openDocument(b, 'application/pdf');
const pixels = (b) => open(b).loadPage(0).toPixmap(m.Matrix.identity, m.ColorSpace.DeviceRGB, false).getPixels();

test('text layer: search and copy find English and Arabic words, nothing changes on the page, the words sit where the picture shows them', () => {
  assert.equal(open(scan).loadPage(0).toStructuredText().asText().trim(), '');
  const k = 3; // the picture was drawn at 3 pixels per point; the page is 595 x 400
  const out = addTextLayer(m, scan, [{ page: 0, scale: k, words: [
    { text: 'Invoice', x0: 60 * k, y0: 85 * k, x1: 170 * k, y1: 115 * k },
    { text: 'فاتورة', x0: 400 * k, y0: 230 * k, x1: 535 * k, y1: 270 * k },
    { text: '  ', x0: 0, y0: 0, x1: 10, y1: 10 },
  ] }], fonts);
  const page = open(out).loadPage(0), text = page.toStructuredText().asText();
  assert.match(text, /Invoice/);
  assert.match(text, /فاتورة/);
  const hit = page.search('Invoice')[0][0]; // a quad: x of its left edge and y of its top, in points
  assert.ok(Math.abs(hit[0] - 60) < 6 && hit[1] > 80 && hit[1] < 120, 'found at ' + hit);
  assert.equal(page.search('فاتورة').length, 1);
  assert.deepEqual(Buffer.from(pixels(out)), Buffer.from(pixels(scan))); // invisible: every pixel is as before
});
