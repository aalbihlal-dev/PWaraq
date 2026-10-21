// Self-check of real redaction with the real engine build:  pnpm test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import { redact, findMatches } from '../../src/lib/engine/redact.ts';
import { pageWriter } from '../../src/lib/engine/textpage.ts';

const font = (f) => new m.Font(f, fs.readFileSync(new URL('../../public/fonts/' + f + '.ttf', import.meta.url)));
const fonts = { regular: font('Tajawal-Regular'), bold: font('Tajawal-Bold') };
const open = (b) => m.Document.openDocument(b, 'application/pdf');
const text = (b, i = 0) => open(b).loadPage(i).toStructuredText().asText();

function sample() {
  const doc = new m.PDFDocument(), w = pageWriter(m, doc, fonts);
  doc.insertPage(-1, w.add({ w: 595, h: 842, lines: [
    { text: 'Call Sami on +966 50 123 4567 today', x: 72, y: 100, size: 14 },
    { text: 'Mail sami@example.com or visit', x: 72, y: 140, size: 14 },
    { text: 'اتصل على ٠٥٠١٢٣٤٥٦٧ الآن', x: 72, y: 180, size: 14 },
    { text: 'The secret plan stays here', x: 72, y: 220, size: 14 },
  ] }));
  w.finish();
  doc.setMetaData('info:Title', 'Private title'); doc.setMetaData('info:Author', 'Abdullah');
  return doc.saveToBuffer('compress').asUint8Array().slice();
}

test('find: phone numbers (Latin and Arabic digits), e-mail and a word are found with boxes', () => {
  const p = open(sample()).loadPage(0);
  assert.equal(findMatches(p, 'phone').length, 2);
  assert.equal(findMatches(p, 'email').length, 1);
  assert.equal(findMatches(p, 'word', 'SECRET').length, 1);
  assert.equal(findMatches(p, 'word', 'nothing here').length, 0);
});

test('redact: the text under a mark is gone from the file, the rest stays; metadata removed on request', () => {
  const src = sample(), p = open(src).loadPage(0);
  const marks = [...findMatches(p, 'phone'), ...findMatches(p, 'email'), ...findMatches(p, 'word', 'secret')].map((k) => ({ page: 0, ...k }));
  const out = redact(m, src, marks, { metadata: true });
  const t = text(out);
  for (const gone of ['966', 'sami@', '٠٥٠', 'secret']) assert.ok(!t.includes(gone), gone + ' still in: ' + t);
  assert.match(t, /Call Sami/);
  assert.match(t, /plan stays here/);
  assert.equal(open(out).loadPage(0).search('secret').length, 0);
  assert.ok(!open(out).getMetaData('info:Title'));
  assert.ok(!open(out).getMetaData('info:Author'));
  assert.equal(open(src).getMetaData('info:Author'), 'Abdullah');
  assert.equal(redact(m, src, [], {}).length > 0, true);
});
