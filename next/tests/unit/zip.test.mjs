import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zip, unzip } from '../../src/lib/zip.ts';

test('zip round trip with an Arabic file name', () => {
  const files = { 'manifest.json': new TextEncoder().encode('{"a":1}'), 'files/الأسبوع 1.pdf': new Uint8Array([1, 2, 3, 255]) };
  const back = unzip(zip(files));
  assert.deepEqual(Object.keys(back), Object.keys(files));
  assert.deepEqual([...back['files/الأسبوع 1.pdf']], [1, 2, 3, 255]);
});
