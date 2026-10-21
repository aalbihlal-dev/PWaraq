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
