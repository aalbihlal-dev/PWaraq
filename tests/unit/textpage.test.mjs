// Self-check of the text writer's direction runs:  pnpm test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runs, visual } from '../../src/lib/engine/textpage.ts';

const show = (text) => runs(text).map((r) => (r.rtl ? 'R:' : 'L:') + String.fromCodePoint(...r.cs).trim());

test('numbers inside Arabic keep their digit order: Western, Arabic-Indic, with thousands separators', () => {
  assert.deepEqual(show('في 31 ديسمبر 2025'), ['L:2025', 'R:ديسمبر', 'L:31', 'R:في']);
  assert.deepEqual(show('في ٣١ ديسمبر ٢٠٢٥'), ['L:٢٠٢٥', 'R:ديسمبر', 'L:٣١', 'R:في']); // was one run per digit, drawn reversed
  assert.deepEqual(show('المبلغ ١٬٢٥٠٬٠٠٠ ريال'), ['R:ريال', 'L:١٬٢٥٠٬٠٠٠', 'R:المبلغ']);
  assert.deepEqual(show('Total 4,500.75 SAR'), ['L:Total 4,500.75 SAR']);
});

test('a line that starts with a number takes its direction from the first letter, not from the digit', () => {
  assert.deepEqual(show('10/05/1448 هـ'), ['R:هـ', 'L:10/05/1448']); // right-to-left line: the number stands at the start (right)
  assert.deepEqual(show('٢٠٢٦/١٠/٢١ التاريخ'), ['R:التاريخ', 'L:٢٠٢٦/١٠/٢١']);
  assert.deepEqual(show('2026 Report'), ['L:2026 Report']); // a Latin line stays left to right
  assert.deepEqual(show('١٢٣'), ['L:١٢٣']); // digits alone: one left-to-right run, in order
});

test('Arabic-Indic and Persian digits come out in order from visual(): letters of the number are not reversed', () => {
  const text = (s) => visual(s).map((g) => String.fromCodePoint(...g.uni)).join('');
  assert.equal(text('٠١٢٣٤٥٦٧٨٩'), '٠١٢٣٤٥٦٧٨٩');
  assert.ok(text('رقم ۱۲۳').startsWith('۱۲۳')); // visual order left to right: the number first, in order, then the word
});
