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

// --- UAX #9 (bidi.ts): brackets, mixed lines, and the way back from a page's visual order (the page editor) ---
import { shown, logical, levels } from '../../src/lib/engine/bidi.ts';
const cp = (s) => [...s].map((c) => c.codePointAt(0));
const str = (cs) => String.fromCodePoint(...cs);

test('brackets and punctuation between two directions take the paragraph direction; a bracket pair stays a pair', () => {
  assert.deepEqual(show('البند 3 (Section A) قبل'), ['R:) قبل', 'L:Section A', 'R:(', 'L:3', 'R:البند']);
  assert.deepEqual(show('انظر ملف PDF.'), ['R:.', 'L:PDF', 'R:انظر ملف']); // the full stop ends the Arabic line at the left
  assert.deepEqual(show('This agreement (اتفاقية) is binding.'), ['L:This agreement (', 'R:اتفاقية', 'L:) is binding.']);
  assert.deepEqual(show('قبل ٢٠٢٦/٠٦/٣٠؛ انظر'), ['R:؛ انظر', 'L:٢٠٢٦/٠٦/٣٠', 'R:قبل']); // a date with slashes is one number
});

test('what a page shows comes back as reading order: numbers, Latin words, brackets, harakat', () => {
  for (const t of ['السلام عليكم ورحمة الله وبركاته،', 'العميل: شركة الأفق (Horizon Trading LLC)', 'تاريخ الاستحقاق: ٣٠ يونيو ٢٠٢٦',
    'مُراجَعة البند 3 (Section A) قبل ٢٠٢٦/٠٦/٣٠؛ انظر ملف PDF.', 'استخدم برنامج Waraq (الإصدار 1.0) لتحرير ملفات PDF بسهولة؛ راجع «الدليل» ص. 12-14.',
    'نفيدكم بأن اللجنة اعتمدت التقرير النهائي للمشروع بتاريخ 15/03/2026، ونأمل التكرم بالاطلاع والإفادة.', 'المبلغ الإجمالي: ٤٬٥٠٠٫٧٥ ر.س — Total: SAR 4,500.75',
    'رقم الفاتورة: INV-2026-00981', '10/05/1448 هـ', 'إِنَّ اللُّغَةَ العَرَبِيَّةَ لُغَةٌ غَنِيَّةٌ', 'The Arabic text (النص العربي) below is binding.']) {
    assert.equal(str(logical(shown(cp(t)))), t);
  }
});

test('levels: a Latin word inside Arabic sits one level up, its digits with it', () => {
  assert.deepEqual(levels(cp('مبنى Building C')), [1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2]);
  assert.deepEqual(levels(cp('abc ١٢٣')), [0, 0, 0, 0, 2, 2, 2]); // Arabic-Indic digits in a Latin line keep their order
});
