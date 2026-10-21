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
