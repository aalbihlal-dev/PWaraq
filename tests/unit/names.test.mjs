// Self-check of the free-name helper:  pnpm test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uniqueName, addUnique } from '../../src/lib/names.ts';

test('uniqueName: a free name stays, a taken one gets (2), (3) … before the extension', () => {
  const have = new Set(['a.pdf', 'a (2).pdf']);
  assert.equal(uniqueName(have, 'b.pdf'), 'b.pdf');
  assert.equal(uniqueName(have, 'a.pdf'), 'a (3).pdf');
  assert.equal(uniqueName(new Set(['تقرير.pdf']), 'تقرير.pdf'), 'تقرير (2).pdf');
  assert.equal(uniqueName(new Set(['README']), 'README'), 'README (2)');
  assert.equal(uniqueName(new Set(['.hidden']), '.hidden'), '.hidden (2)');
  assert.equal(uniqueName(new Set(['x.tar.gz']), 'x.tar.gz'), 'x.tar (2).gz');
});

test('uniqueName: many collisions and a name that already ends in a number', () => {
  const have = new Set();
  const seen = [];
  for (let i = 0; i < 120; i++) { const n = uniqueName(have, 'ملف.pdf'); assert.ok(!have.has(n)); have.add(n); seen.push(n); }
  assert.equal(seen[0], 'ملف.pdf'); assert.equal(seen[1], 'ملف (2).pdf'); assert.equal(seen[119], 'ملف (120).pdf');
  assert.equal(uniqueName(new Set(['a (2).pdf']), 'a (2).pdf'), 'a (2) (2).pdf');
});

test('addUnique: ZIP entries never replace each other', () => {
  const files = {};
  assert.deepEqual([addUnique(files, 'p.pdf', 1), addUnique(files, 'p.pdf', 2), addUnique(files, 'p.pdf', 3)], ['p.pdf', 'p (2).pdf', 'p (3).pdf']);
  assert.deepEqual(Object.values(files), [1, 2, 3]);
});

test('a long name keeps its end visible: the tail holds the extension and a few letters before it', async () => {
  const { splitName } = await import('../../src/lib/names.ts');
  assert.deepEqual(splitName('report.pdf'), ['report.pdf', '']);
  const long = 'x'.repeat(100) + '-final-version-2.pdf';
  const [head, tail] = splitName(long);
  assert.equal(head + tail, long);
  assert.ok(tail.endsWith('-2.pdf') && tail.length <= 18 && head.startsWith('xxxx'));
  const ar = 'تقرير الأسبوع الأول من مقرر التحليل الإنشائي والتصميم للمباني الخرسانية المسلحة.pdf';
  assert.ok(splitName(ar)[1].endsWith('.pdf') && splitName(ar).join('') === ar);
  assert.equal(splitName('a'.repeat(50) + '.verylongextension')[1].length, 18); // an odd long "extension" is not treated as one
});
