// Self-check of the OCR picture clean-up and the pass merge:  pnpm test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import { clean, rotate, skew, stretch, levels, noise, unturn } from '../../src/lib/ocr-clean.ts';
import { mergePasses } from '../../src/lib/ocr.ts';

// the clean letter page of the test set, drawn at 200 dpi
const page = () => {
  const doc = m.Document.openDocument(fs.readFileSync(new URL('../fixtures/ocr/01-letter-naskh-300.pdf', import.meta.url)), 'application/pdf');
  const pix = doc.loadPage(0).toPixmap(m.Matrix.scale(200 / 72, 200 / 72), m.ColorSpace.DeviceGray, false);
  return { w: pix.getWidth(), h: pix.getHeight(), px: new Uint8Array(pix.getPixels()) };
};
const ink = (g) => { const { t } = levels(g); let n = 0; for (const v of g.px) if (v < t) n++; return n; };

test('a straight, crisp page is left alone', () => {
  const g = page(), before = new Uint8Array(g.px);
  const { gray, angle, grain } = clean(g);
  assert.equal(angle, 0);
  assert.ok(grain < 5, 'grain ' + grain);
  assert.equal(Buffer.compare(gray.px, before), 0);
});

test('a tilted page is straightened: the tilt is found within 0.3° and turned back', () => {
  const g = page(), tilted = rotate(g, 2);
  const found = skew(tilted);
  assert.ok(Math.abs(found + 2) < 0.3, 'found ' + found); // turned by +2, so -2 straightens it
  const again = skew(rotate(tilted, found)); // straight now
  assert.ok(Math.abs(again) < 0.3, 'after straightening: ' + again);
});

test('a faded, grainy copy is stretched back to black on white and smoothed; the text stays', () => {
  const g = page(), words = ink(g);
  let s = 11; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < g.px.length; i++) g.px[i] = Math.min(255, Math.max(0, 70 + g.px[i] * 120 / 255 + (rnd() - 0.5) * 40)); // ink ~70, paper ~190, grain
  assert.ok(noise(g, levels(g).t) > 5);
  const { gray, grain } = clean(g);
  assert.ok(grain > 5);
  const hist = new Uint32Array(256); for (const v of gray.px) hist[v]++;
  let light = 0; for (let v = 240; v < 256; v++) light += hist[v];
  assert.ok(light > gray.px.length * 0.5, 'paper is white again');
  assert.ok(Math.abs(ink(gray) - words) / words < 0.3, 'about as much ink as before: ' + ink(gray) + ' vs ' + words);
});

test('stretch does nothing to a page that is already black on white', () => {
  const g = page(), before = new Uint8Array(g.px);
  assert.equal(Buffer.compare(stretch(g).px, before), 0);
});

test('a box found on the straightened picture goes back to where it is on the tilted one', () => {
  // the picture was straightened by a quarter turn about its centre (500, 500): what `rotate` put at (150, 110) came from (110, 850)
  const b = unturn({ x0: 100, y0: 100, x1: 200, y1: 120 }, 90, 1000, 1000);
  assert.ok(Math.abs((b.x0 + b.x1) / 2 - 110) < 1 && Math.abs((b.y0 + b.y1) / 2 - 850) < 1, JSON.stringify(b));
  assert.equal(b.x1 - b.x0, 100);
});

test('two passes merge by position: the surer line wins, lines only one pass saw are kept, top to bottom', () => {
  const line = (text, y, confidence) => ({ confidence, words: [{ text, x0: 10, y0: y, x1: 200, y1: y + 20 }] });
  const out = mergePasses([line('ara-1', 0, 90), line('ara-2', 50, 60), line('ara-3', 100, 70)], [line('eng-2', 52, 80), line('eng-4', 150, 85)]);
  assert.deepEqual(out.map((l) => l.words[0].text), ['ara-1', 'eng-2', 'ara-3', 'eng-4']);
});
