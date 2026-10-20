// Translation check: every key the code uses exists in English and Arabic, every key is used, and the {placeholders} match.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../src/', import.meta.url));
const files = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : /\.(svelte|ts)$/.test(e.name) ? [path.join(dir, e.name)] : []));
const table = path.join(root, 'lib', 'i18n.svelte.ts');
const source = fs.readFileSync(table, 'utf8');

// key: ['English', 'Arabic']  (single-quoted strings)
const str = String.raw`'((?:[^'\\]|\\.)*)'`;
const defs = [...source.matchAll(new RegExp(String.raw`(?:^|[\s,{])(\w+): \[${str}, ${str}\]`, 'g'))].map((m) => ({ key: m[1], en: m[2], ar: m[3] }));
const table_ = source.slice(source.indexOf('const strings = {'), source.indexOf('} satisfies'));

test('every entry of the table is read (no entry hides from the check)', () => {
  const lines = table_.split('\n').filter((l) => /^\s+\w+: \[/.test(l)).length;
  assert.ok(defs.length >= lines && defs.length > 100, `read ${defs.length} entries`);
  const keys = defs.map((d) => d.key);
  assert.deepEqual(keys.filter((k, i) => keys.indexOf(k) !== i), [], 'duplicate keys');
});

const others = files(root).filter((f) => f !== table).map((f) => fs.readFileSync(f, 'utf8'));
const code = others.join('\n');

test('every t(key) in the code exists in the table, English and Arabic', () => {
  const have = new Set(defs.map((d) => d.key));
  const used = [...code.matchAll(/\bt\(\s*['"`]([\w.-]+)['"`]\s*[,)]/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(used)].filter((k) => !have.has(k)), [], 'used but not defined');
  assert.deepEqual(defs.filter((d) => !d.en.trim() || !d.ar.trim()).map((d) => d.key), [], 'empty in one language');
});

test('every key of the table is used somewhere in the code', () => {
  // a key counts as used when its name appears as a quoted word (t('x'), or a list such as tasks = ['view', ...] read with t(task)),
  // or when it is built from a prefix ('design_' + name)
  const prefixes = [...code.matchAll(/['"`](\w+_)(?:['"`]\s*\+|\$\{)/g)].map((m) => m[1]);
  const unused = defs.filter((d) => !new RegExp(`['"\`]${d.key}['"\`]`).test(code) && !prefixes.some((p) => d.key.startsWith(p))).map((d) => d.key);
  assert.deepEqual(unused, [], 'defined but never used');
});

test('placeholders such as {name} are the same in English and Arabic', () => {
  const holes = (s) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
  assert.deepEqual(defs.filter((d) => holes(d.en) !== holes(d.ar)).map((d) => d.key), []);
});
