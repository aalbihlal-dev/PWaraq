// Self-check of certificate signatures with the real engine build:  node --test tests/unit
// A PDF signed with an ID made here verifies; one changed byte is caught; a second signature keeps the first valid; a
// protected file signs and stays protected; an existing empty field is signed into; .pfx files (modern and legacy)
// open; and, when OpenSSL is on this PC, it verifies our CMS and we verify one it made.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import { makeId, parseCert, buildCms, verifyCms, covered, pdfDate, fromPdfDate, hasSignatures, willBreakSignatures, hex } from '../../src/lib/engine/pades.ts';
import { openPfx } from '../../src/lib/engine/pfx.ts';
import { prepareSignature, listSignatures } from '../../src/lib/engine/signcert.ts';
import { findSpots, placeSet, setEdits } from '../../src/lib/engine/sign.ts';
import { protect } from '../../src/lib/engine/tools.ts';

const read = (f) => new Uint8Array(fs.readFileSync(new URL('../fixtures/' + f, import.meta.url)));
const font = (f) => new m.Font(f, fs.readFileSync(new URL('../../public/fonts/' + f + '.ttf', import.meta.url)));
const fonts = { regular: font('Tajawal-Regular'), bold: font('Tajawal-Bold') };
const photo = read('photo.png');
const set = { ratio: 2.5, name: 'عبدالله', date: '21/10/2026' };
const mk = async (spec) => ({ ...(await makeId(spec)), alg: spec.alg });
const importKey = (id) => crypto.subtle.importKey('pkcs8', id.key, id.alg === 'rsa' ? { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' } : { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);

/** `bytes` signed by `id` at `spot` (seen coordinates), as the app does it: prepare in the engine, CMS in the main thread. */
async function sign(bytes, id, spot, { password = '', field, drawn, time = new Date() } = {}) {
  const placed = placeSet(set, spot), edits = setEdits(set, placed, [0, 0, 0.5]);
  const boxes = [placed.sig, placed.name, placed.date].filter(Boolean);
  const x = Math.min(...boxes.map((b) => b.x)), y = Math.min(...boxes.map((b) => b.y));
  const rect = { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y };
  const plan = { page: spot.page ?? 0, rect, field, edits, name: parseCert(id.cert).name, reason: 'Approved', time: pdfDate(time), room: id.cert.length + 2048, drawn };
  const p = prepareSignature(m, bytes, password, plan, [photo], () => fonts);
  const { ranges } = covered(p.bytes, p.byteRange), digest = new Uint8Array(await crypto.subtle.digest('SHA-256', Buffer.concat(ranges)));
  const cms = await buildCms({ key: await importKey(id), cert: id.cert, alg: id.alg }, digest);
  assert.ok(cms.length <= plan.room, 'the CMS fits the room');
  p.bytes.set(new TextEncoder().encode(hex(cms)), p.contentsAt);
  return p.bytes;
}
/** Every signature in `bytes` checked. */
async function verify(bytes, password = '') {
  const out = [];
  for (const s of listSignatures(m, bytes, password)) { const c = covered(bytes, s.byteRange); out.push({ ...s, ...c, check: await verifyCms(s.contents, c.ranges) }); }
  return out;
}

test('an ID made here signs a PDF; the signature verifies and covers the whole file; the file still opens', async () => {
  const id = await mk({ name: 'Abdullah', email: 'a@example.com', alg: 'rsa', years: 3 });
  const spot = { page: 0, x: 100, y: 600, w: 160, h: 14, rtl: false };
  const signed = await sign(read('small.pdf'), id, spot, { time: new Date('2026-10-21T10:00:00Z') });
  assert.ok(hasSignatures(signed) && !hasSignatures(read('small.pdf')));
  const [s, ...rest] = await verify(signed);
  assert.equal(rest.length, 0);
  assert.equal(s.field, 'Waraq Signature 1'); assert.equal(s.page, 0); assert.equal(s.name, 'Abdullah'); assert.equal(s.reason, 'Approved');
  assert.equal(fromPdfDate(s.time).toISOString(), '2026-10-21T10:00:00.000Z');
  assert.equal(s.subFilter, 'ETSI.CAdES.detached');
  assert.ok(s.whole, 'reaches the end of the file');
  assert.deepEqual([s.check.ok, s.check.digestOk, s.check.signatureOk, s.check.certValid, s.check.certSelfOk, s.check.cert.selfSigned], [true, true, true, true, true, true]);
  assert.equal(s.check.cert.email, 'a@example.com');
  // the original bytes are untouched (incremental update) and the page shows the appearance
  assert.deepEqual(signed.subarray(0, read('small.pdf').length), read('small.pdf'));
  const doc = m.Document.openDocument(signed, 'application/pdf'), pg = doc.loadPage(0);
  assert.equal(pg.getWidgets().filter((w) => w.getFieldType() === 'signature').length, 1);
  // the appearance: the picture and two lines of real text (name, date) in a form XObject; it renders (blue text)
  const ap = pg.getWidgets()[0].getObject().get('AP').get('N'), ops = new TextDecoder().decode(ap.readStream().asUint8Array());
  assert.equal((ops.match(/ Tj/g) ?? []).length, 2); assert.ok(ops.includes('/WqI0 Do') && ap.get('Resources').get('Font').isDictionary());
  const pix = pg.toPixmap(m.Matrix.identity, m.ColorSpace.DeviceRGB, false), px = pix.getPixels();
  let blue = 0; for (let i = 0; i < px.length; i += 3) if (px[i] < 100 && px[i + 1] < 100 && px[i + 2] > 80) blue++;
  assert.ok(blue > 50, 'the appearance is drawn: ' + blue);
});

test('one changed byte: the signature no longer verifies; a change appended after signing is seen', async () => {
  const id = await mk({ name: 'Abdullah', alg: 'p256', years: 1 });
  const signed = await sign(read('small.pdf'), id, { page: 0, x: 100, y: 600, w: 160, h: 14, rtl: false });
  const broken = signed.slice(); broken[200] ^= 1;
  const [s] = await verify(broken);
  assert.equal(s.check.digestOk, false); assert.equal(s.check.ok, false); assert.equal(s.check.signatureOk, true);
  // a later change written as another increment: the signature itself is fine but does not reach the end
  const doc = new m.PDFDocument(signed); doc.getTrailer().get('Root').put('Lang', doc.newString('ar'));
  const later = doc.saveToBuffer('incremental').asUint8Array().slice();
  const [t] = await verify(later);
  assert.equal(t.check.ok, true); assert.equal(t.whole, false);
  assert.ok(willBreakSignatures(signed, broken) && !willBreakSignatures(signed, later) && !willBreakSignatures(read('small.pdf'), broken));
});

test('a second signature keeps the first one valid; both are listed in page order', async () => {
  const a = await mk({ name: 'First', alg: 'rsa', years: 1 }), b = await mk({ name: 'Second', alg: 'p256', years: 1 });
  const once = await sign(read('three.pdf'), a, { page: 0, x: 60, y: 700, w: 160, h: 14, rtl: false });
  const twice = await sign(once, b, { page: 2, x: 60, y: 700, w: 160, h: 14, rtl: true });
  assert.deepEqual(twice.subarray(0, once.length), once);
  const list = await verify(twice);
  assert.deepEqual(list.map((s) => [s.name, s.page, s.field, s.check.ok, s.whole]), [['First', 0, 'Waraq Signature 1', true, false], ['Second', 2, 'Waraq Signature 2', true, true]]);
});

test('a protected file: signed with its password, still protected, the signature verifies', async () => {
  const id = await mk({ name: 'Abdullah', alg: 'rsa', years: 1 });
  const locked = protect(m, read('small.pdf'), 'pw', true, false);
  const signed = await sign(locked, id, { page: 0, x: 100, y: 600, w: 160, h: 14, rtl: false }, { password: 'pw' });
  const doc = new m.PDFDocument(signed);
  assert.ok(doc.needsPassword() && doc.authenticatePassword('pw'));
  const [s] = await verify(signed, 'pw');
  assert.ok(s.check.ok && s.whole);
  assert.equal(s.name, 'Abdullah', 'strings of the update are encrypted and read back');
  await assert.rejects(verify(signed, 'bad'), /WRONG_PASSWORD/);
});

test('an existing empty signature field is signed into; other placed sets are drawn first and covered', async () => {
  const id = await mk({ name: 'Abdullah', alg: 'rsa', years: 1 });
  const d = m.Document.openDocument(read('sign-en.pdf'), 'application/pdf');
  const spots = [...Array(d.countPages())].flatMap((_, i) => findSpots(d.loadPage(i), i)), field = spots.find((s) => s.field);
  assert.ok(field?.name, 'the fixture has an empty signature field with a name');
  const other = spots.find((s) => s.kind === 'sign' && !s.field);
  const drawn = [{ page: other.page, edits: setEdits(set, placeSet(set, other), [0, 0, 0]) }];
  const signed = await sign(read('sign-en.pdf'), id, field, { field: field.name, drawn });
  const [s] = await verify(signed);
  assert.equal(s.field, field.name); assert.equal(s.page, field.page); assert.ok(s.check.ok && s.whole);
  const out = m.Document.openDocument(signed, 'application/pdf');
  assert.equal(out.loadPage(field.page).getWidgets().filter((w) => w.getFieldType() === 'signature').length, 1, 'no second field was made');
  assert.ok(out.loadPage(other.page).toStructuredText().asText().includes('21/10/2026'), 'the drawn set is in the page');
  assert.equal(findSpots(out.loadPage(field.page), field.page).filter((x) => x.field).length, 0, 'the field is no longer empty');
});

test('.pfx import: modern (AES), legacy (3DES + RC2-40) and EC files open; a wrong password is told apart', async () => {
  for (const [f, alg] of [['modern.pfx', 'rsa'], ['legacy.pfx', 'rsa'], ['ec.pfx', 'p256']]) {
    const o = await openPfx(read('certsign/' + f), 'secret'), c = parseCert(o.cert);
    assert.equal(o.alg, alg, f); assert.ok(c.name.endsWith('Signer'), f);
    await crypto.subtle.importKey('pkcs8', o.key, alg === 'rsa' ? { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' } : { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  }
  await assert.rejects(openPfx(read('certsign/modern.pfx'), 'nope'), /WRONG_PASSWORD/);
  await assert.rejects(openPfx(read('certsign/legacy.pfx'), 'nope'), /WRONG_PASSWORD/);
});

// OpenSSL, when this PC has it: it verifies our CMS, and we verify a signature it made
const openssl = ['openssl', 'C:/Program Files/Git/mingw64/bin/openssl.exe', 'C:/Program Files/Git/usr/bin/openssl.exe'].find((x) => spawnSync(x, ['version']).status === 0);
test('cross-check with OpenSSL', { skip: !openssl && 'openssl not on this PC' }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waraq-certsign-'));
  const run = (args) => { const r = spawnSync(openssl, args, { cwd: dir, encoding: 'utf8' }); return r.status === 0 ? 'ok' : r.stderr; };
  const id = await mk({ name: 'Abdullah', alg: 'rsa', years: 1 });
  const signed = await sign(read('small.pdf'), id, { page: 0, x: 100, y: 600, w: 160, h: 14, rtl: false });
  const [s] = await verify(signed);
  fs.writeFileSync(path.join(dir, 'ours.der'), s.contents); fs.writeFileSync(path.join(dir, 'ours.bin'), Buffer.concat(s.ranges));
  assert.equal(run(['cms', '-verify', '-noverify', '-binary', '-inform', 'DER', '-in', 'ours.der', '-content', 'ours.bin', '-out', 'ours.out']), 'ok');
  // theirs: the same placeholder file, the CMS made by OpenSSL with the fixture certificate, verified by us
  const plan = { page: 0, rect: { x: 100, y: 560, w: 160, h: 60 }, edits: [], name: 'Test Signer', time: pdfDate(new Date()), room: 4096 };
  const p = prepareSignature(m, read('small.pdf'), '', plan, [], () => fonts), c = covered(p.bytes, p.byteRange);
  fs.writeFileSync(path.join(dir, 'theirs.bin'), Buffer.concat(c.ranges));
  fs.copyFileSync(new URL('../fixtures/certsign/c.pem', import.meta.url), path.join(dir, 'c.pem')); fs.copyFileSync(new URL('../fixtures/certsign/k.pem', import.meta.url), path.join(dir, 'k.pem'));
  assert.equal(run(['cms', '-sign', '-binary', '-md', 'sha256', '-signer', 'c.pem', '-inkey', 'k.pem', '-in', 'theirs.bin', '-outform', 'DER', '-out', 'theirs.der', '-nosmimecap']), 'ok');
  const cms = new Uint8Array(fs.readFileSync(path.join(dir, 'theirs.der')));
  p.bytes.set(new TextEncoder().encode(hex(cms)), p.contentsAt);
  const [t] = await verify(p.bytes);
  assert.equal(t.name, 'Test Signer'); assert.ok(t.check.ok && t.check.digestOk && t.check.signatureOk && t.whole);
  assert.equal(t.check.cert.email, 't@example.com');
  fs.rmSync(dir, { recursive: true, force: true });
});
