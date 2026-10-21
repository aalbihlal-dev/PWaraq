// Self-check of the model-text-to-word-box alignment:  pnpm test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { align, alignBlocks } from '../../src/lib/ocr-align.ts';

const w = (text, x0, x1, y0 = 100, y1 = 130) => ({ text, x0, x1, y0, y1 });

test('the same words are paired even where one is misread or missed', () => {
  assert.deepEqual(align(['a', 'bb', 'ccc', 'dd'], ['a', 'bX', 'dd']), [[0, 0], [1, 1], [3, 2]]); // ccc was missed
  assert.deepEqual(align(['مرحبا', 'بكم', 'في'], ['مرحبا', 'بكم', 'اي', 'في']), [[0, 0], [1, 1], [2, 3]]); // اي is junk
});

test('the model corrects the words, Tesseract keeps the positions: a right-to-left line', () => {
  // Tesseract read "مرحبا يكم في هذا" (one word wrong) with boxes from the right; the model knows the truth
  const tess = [{ confidence: 50, words: [w('مرحبا', 500, 580), w('يكم', 420, 490), w('في', 380, 410), w('هذا', 300, 370)] }];
  const out = alignBlocks([{ text: 'مرحبا بكم في هذا', x0: 280, y0: 90, x1: 600, y1: 140 }], tess);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].words.map((x) => x.text), ['مرحبا', 'بكم', 'في', 'هذا']);
  assert.deepEqual(out[0].words.map((x) => [x.x0, x.x1]), [[500, 580], [420, 490], [380, 410], [300, 370]]); // every word on its own box
});

test('a word the model found and Tesseract did not gets the free stretch between its neighbours', () => {
  const tess = [{ confidence: 50, words: [w('مرحبا', 500, 580), w('في', 300, 330)] }];
  const out = alignBlocks([{ text: 'مرحبا بكم جميعا في', x0: 280, y0: 90, x1: 600, y1: 140 }], tess);
  const words = out[0].words;
  assert.deepEqual(words.map((x) => x.text), ['مرحبا', 'بكم', 'جميعا', 'في']);
  assert.ok(words[1].x1 <= 500 + 1 && words[1].x0 > words[2].x1 - 1, 'the new words sit between, right to left');
  assert.ok(words[2].x0 >= 330 - 1 && words[2].x1 < words[1].x0 + 1);
});

test('two blocks take their own lines; a line no block claims is dropped; a block with no lines still gets a line', () => {
  const tess = [{ confidence: 50, words: [w('اول', 400, 450, 100, 130)] }, { confidence: 50, words: [w('ثان', 400, 450, 300, 330)] }, { confidence: 20, words: [w('12', 100, 120, 700, 730)] }];
  const out = alignBlocks([{ text: 'اول', x0: 380, y0: 90, x1: 470, y1: 140 }, { text: 'ثان', x0: 380, y0: 290, x1: 470, y1: 340 }, { text: 'ثالث رابع', x0: 100, y0: 500, x1: 500, y1: 560 }], tess);
  assert.deepEqual(out.map((l) => l.words.map((x) => x.text).join(' ')), ['اول', 'ثان', 'ثالث رابع']);
  assert.ok(out[2].words[0].x0 > out[2].words[1].x0, 'the Arabic block reads right to left'); // first word at the right
});

test('a left-to-right line is filled left to right', () => {
  const out = alignBlocks([{ text: 'Invoice number 4821', x0: 50, y0: 90, x1: 400, y1: 140 }], [{ confidence: 40, words: [w('Invoice', 60, 170), w('4821', 300, 360)] }]);
  const words = out[0].words;
  assert.deepEqual(words.map((x) => x.text), ['Invoice', 'number', '4821']);
  assert.ok(words[1].x0 >= 170 - 1 && words[1].x1 <= 300 + 1);
});
