// Self-checks of the everyday tools with the real engine build:  pnpm test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import { assemble } from '../../src/lib/engine/assemble.ts';
import { compress, protect, unlock, guardOf, sealLikeSource } from '../../src/lib/engine/tools.ts';

const three = fs.readFileSync(new URL('../fixtures/three.pdf', import.meta.url));
const font = (f) => new m.Font(f, fs.readFileSync(new URL('../../public/fonts/' + f + '.ttf', import.meta.url)));
const fonts = { regular: font('Tajawal-Regular'), bold: font('Tajawal-Bold') };
const src = { doc: m.Document.openDocument(three, 'application/pdf'), bytes: three };
const open = (b) => m.Document.openDocument(b, 'application/pdf');

test('crop: the visible box follows the fractions of the page as seen, also on a turned page', () => {
  const out = open(assemble(m, () => src, { items: [{ doc: 1, page: 0, crop: [0.1, 0.2, 0.9, 0.7] }, { doc: 1, page: 0, rotate: 90, crop: [0, 0, 0.5, 1] }] }));
  // A4 595 x 842: seen = unrotated; left 10 %, top 20 %, right 90 %, bottom 70 %
  assert.deepEqual(out.loadPage(0).getBounds().map(Math.round), [0, 0, 476, 421]);
  assert.deepEqual(out.asPDF().findPage(0).get('CropBox').asJS().map(Math.round), [60, 253, 536, 674]);
  // turned a quarter clockwise: seen 842 x 595; the page's top is on the right, so the left half seen is its bottom half
  const b = out.loadPage(1).getBounds().map(Math.round);
  assert.deepEqual([b[2] - b[0], b[3] - b[1]], [421, 595]);
  assert.deepEqual(out.asPDF().findPage(1).get('CropBox').asJS().map(Math.round), [0, 0, 595, 421]);
});

test('page numbers: position, start and "n / N"; watermark: real Arabic text on every page', () => {
  const out = open(assemble(m, () => src, {
    items: [0, 1, 2].map((page) => ({ doc: 1, page })), numbers: true, numberStyle: { position: 'tr', start: 5, total: true },
    watermark: { text: 'مسودة DRAFT', opacity: 0.2 },
  }, () => fonts));
  for (let i = 0; i < 3; i++) {
    const text = out.loadPage(i).toStructuredText().asText();
    assert.match(text, new RegExp(`${5 + i} / 7`));
    assert.match(text, /مسودة/);
  }
  const top = JSON.parse(out.loadPage(0).toStructuredText().asJSON()).blocks.flatMap((b) => b.lines ?? []).find((l) => l.text.includes('5 / 7'));
  assert.ok(top.bbox.y < 40 && top.bbox.x > 450, 'number at the top right: ' + JSON.stringify(top.bbox));
});

test('compress: a large photo gets smaller, the page stays the same size and its text stays text', () => {
  const pix = new m.Pixmap(m.ColorSpace.DeviceRGB, [0, 0, 3000, 2000], false);
  const px = pix.getPixels(); for (let i = 0; i < px.length; i++) px[i] = (i * 2654435761) >>> 24; // noise: compresses badly as PNG
  const png = pix.asPNG(), photo = { doc: m.Document.openDocument(png, 'image/png'), bytes: png };
  const big = assemble(m, (id) => (id === 2 ? photo : src), { items: [{ doc: 1, page: 0 }, { doc: 2, page: 0, fit: { w: 595, h: 842 } }] });
  const small = compress(m, big, 'recommended');
  assert.ok(small.length < big.length * 0.5, `${big.length} -> ${small.length}`);
  const out = open(small);
  assert.equal(out.countPages(), 2);
  assert.deepEqual(out.loadPage(1).getBounds().map(Math.round), [0, 0, 595, 842]);
  assert.match(out.loadPage(0).toStructuredText().asText(), /Page one/);
});

test('protect and unlock: needs the password, opens with it, unlock removes it, a wrong one is refused', () => {
  const locked = protect(m, three, 'سر123', true, true); // nothing withheld, so the password can be removed again
  assert.equal(open(locked).needsPassword(), true);
  const d = open(locked); assert.ok(d.authenticatePassword('سر123'));
  assert.throws(() => unlock(m, locked, 'wrong'), /WRONG_PASSWORD/);
  const free = open(unlock(m, locked, 'سر123'));
  assert.equal(free.needsPassword(), false);
  assert.equal(free.countPages(), 3);
  assert.throws(() => protect(m, three, 'a,b'), /BAD_PASSWORD/);
});

test('font subsetting: a watermark embeds only the letters used, text stays real Arabic', () => {
  const out = assemble(m, () => src, { items: [{ doc: 1, page: 0 }], watermark: { text: 'مسودة DRAFT' } }, () => fonts);
  assert.ok(out.length < 150_000, 'both Tajawal weights are no longer embedded whole: ' + out.length);
  assert.match(open(out).loadPage(0).toStructuredText().asText(), /مسودة/);
});

// A file with a password and no-copy limits; owner password "own", user password "pw" (print only).
const locked = open(three).asPDF().saveToBuffer('encrypt=aes-256,user-password=pw,owner-password=own,permissions=' + ((1 << 2) | ~0xfff) + ',garbage').asUint8Array().slice();
const lockedSrc = () => { const doc = open(locked); assert.ok(doc.authenticatePassword('pw')); return { doc, bytes: locked }; };
const sameLimits = (b) => {
  const d = open(b);
  assert.ok(d.needsPassword(), 'not protected');
  assert.equal(d.authenticatePassword('wrong'), 0);
  assert.ok(d.authenticatePassword('pw') > 0);
  assert.equal(d.hasPermission('copy'), false);
  assert.equal(d.hasPermission('print'), true);
  const g = guardOf(m, b, 'pw');
  assert.equal(g.how, 'aes-256'); assert.equal(g.restricted, true); assert.equal(g.owner, false);
  assert.equal(d.countPages() > 0, true);
};

test('protection follows copies: extract and split keep the password, algorithm and limits', () => {
  const one = assemble(m, lockedSrc, { items: [{ doc: 1, page: 1 }] });
  assert.ok(!open(one).needsPassword()); // the assembled pages themselves are plain …
  const sealed = sealLikeSource(m, one, locked, 'pw'); // … and the copy is sealed like the source
  sameLimits(sealed);
  assert.equal(open(sealed).countPages(), 1);
  for (const part of [[0], [1, 2]]) sameLimits(sealLikeSource(m, assemble(m, lockedSrc, { items: part.map((page) => ({ doc: 1, page })) }), locked, 'pw'));
  assert.equal(sealLikeSource(m, one, three, ''), one); // an unprotected source stays unprotected
});

test('protection follows copies: compress keeps it; stripping it needs the owner password', () => {
  sameLimits(compress(m, locked, 'small', 'pw'));
  assert.throws(() => compress(m, locked, 'small', 'wrong'), /WRONG_PASSWORD/);
  assert.throws(() => unlock(m, locked, 'pw'), /NEED_OWNER/);
  assert.throws(() => protect(m, locked, 'newpw', true, true, 'pw'), /NEED_OWNER/);
  const free = unlock(m, locked, 'own');
  assert.ok(!open(free).needsPassword());
  assert.equal(guardOf(m, free), null);
  assert.equal(guardOf(m, locked, 'own').owner, true);
  // opened with the owner password a copy keeps the limits too, and the owner password stays the owner's
  const copy = sealLikeSource(m, assemble(m, () => ({ doc: open(three), bytes: three }), { items: [{ doc: 1, page: 0 }] }), locked, 'own');
  assert.equal(open(copy).hasPermission('copy'), false);
  assert.ok(open(copy).authenticatePassword('own') & 4);
});
