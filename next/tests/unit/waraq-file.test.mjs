// A .waraq file from outside is untrusted: damaged, foreign, newer or hostile files get a plain refusal, never a crash or a write outside the folder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zip, unzip } from '../../src/lib/zip.ts';
import { parse, manifest, newPortfolio } from '../../src/lib/portfolio.ts';

const enc = (s) => new TextEncoder().encode(s);
const good = () => ({ app: 'waraq-portfolio', version: 1, id: 'abc123-x', name: 'الأسبوع الأول', created: 1, files: { f1: { name: 'ملف.pdf', mime: 'application/pdf' } }, sections: [{ id: 's', title: 'مقدمة', pages: [{ file: 'f1' }] }] });
const entries = (m = good(), extra = {}) => ({ 'manifest.json': enc(JSON.stringify(m)), 'files/f1': new Uint8Array([1, 2, 3]), ...extra });
const kind = (fn) => { try { fn(); } catch (e) { return e.kind ?? e.message; } return 'accepted'; };

test('a good portfolio with Arabic names is accepted, also after the zip round trip', () => {
  assert.equal(parse(unzip(zip(entries()))).name, 'الأسبوع الأول');
  const p = newPortfolio('دورة'); p.id = 'abc'; // the real writer's output passes
  assert.equal(parse({ 'manifest.json': enc(manifest(p)) }).id, 'abc');
  assert.equal(parse(unzip(zip(entries(good(), { 'files/ملف كبير.pdf': new Uint8Array([9]) })))).app, 'waraq-portfolio');
});

test('damaged and foreign files are refused as invalid', () => {
  const z = zip(entries());
  assert.throws(() => unzip(enc('this is not a zip file at all')), /zip/);
  assert.throws(() => unzip(z.slice(0, z.length - 30)), /zip/); // truncated: no directory
  const flipped = zip({ a: new Uint8Array([1, 2, 3]) }); flipped[31] ^= 0xff; // a byte of the stored file changes
  assert.throws(() => unzip(flipped), /checksum/);
  assert.equal(kind(() => parse({ 'files/f1': new Uint8Array([1]) })), 'invalid'); // no manifest
  assert.equal(kind(() => parse({ 'manifest.json': enc('{broken') })), 'invalid');
  assert.equal(kind(() => parse(entries({ ...good(), app: 'something-else' }))), 'invalid');
  assert.equal(kind(() => parse(entries({ ...good(), sections: 'x' }))), 'invalid');
  assert.equal(kind(() => parse(entries({ ...good(), version: 'one' }))), 'invalid');
});

test('a portfolio made by a newer Waraq says so', () => {
  assert.equal(kind(() => parse(entries({ ...good(), version: 2 }))), 'newer');
});

test('ids and entry names that could leave the folder are refused', () => {
  for (const id of ['../x', 'a/b', 'A', '', 'x'.repeat(65), 'C:\\x']) assert.equal(kind(() => parse(entries({ ...good(), id }))), 'invalid', 'id ' + id);
  assert.equal(kind(() => parse(entries({ ...good(), files: { '../evil': { name: 'a', mime: 'x' } } }))), 'invalid');
  for (const name of ['../evil', 'files/../../evil', 'files/..', 'files/a/b', 'files\\evil', 'C:/evil', 'C:\\evil', '/etc/passwd', 'files/C:evil', 'other/file', 'files/', 'files/a..b'])
    assert.equal(kind(() => parse(entries(good(), { [name]: new Uint8Array([1]) }))), 'invalid', 'entry ' + name);
});

test('a zip bomb is refused from its directory: too many entries, or sizes that add up to more than the limit', () => {
  const many = Object.fromEntries(Array.from({ length: 2001 }, (_, i) => ['files/f' + i, new Uint8Array(0)]));
  assert.throws(() => unzip(zip(many)), /too many/);
  const z = zip({ 'files/a': new Uint8Array(10), 'files/b': new Uint8Array(10) }), v = new DataView(z.buffer);
  for (let p = z.length - 22 - 2 * (46 + 7); p < z.length - 22; p += 46 + 7) v.setUint32(p + 20, 3 * 2 ** 30, true); // each entry claims 3 GB
  assert.throws(() => unzip(z), /bad zip/); // a size larger than the file itself
  assert.throws(() => unzip(zip({ 'files/a': new Uint8Array(100) }), { entries: 5, bytes: 50 }), /too large/);
});

test('a 200 MB portfolio round trip keeps every byte', { timeout: 120_000 }, () => {
  const big = new Uint8Array(100 * 2 ** 20).map((_, i) => (i * 31) & 255), big2 = big.slice().reverse();
  const back = unzip(zip(entries(good(), { 'files/f2': big, 'files/f3': big2 })));
  assert.equal(parse(back).id, 'abc123-x');
  assert.equal(back['files/f2'].length, big.length);
  assert.ok(Buffer.compare(back['files/f2'], big) === 0 && Buffer.compare(back['files/f3'], big2) === 0);
});
