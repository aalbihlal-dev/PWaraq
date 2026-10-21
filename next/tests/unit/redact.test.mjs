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

// A page whose number 987654321 is also in a comment, a highlight's note, a link, a form field and the structure tree.
function reach() {
  const doc = new m.PDFDocument(), w = pageWriter(m, doc, fonts);
  doc.insertPage(-1, w.add({ w: 595, h: 842, lines: [{ text: 'Account 987654321 stays secret', x: 72, y: 100, size: 14 }, { text: 'Other line here', x: 72, y: 300, size: 14 }] }));
  w.finish();
  const page = doc.findPage(0), pg = doc.loadPage(0);
  const note = pg.createAnnotation('Text'); note.setRect([130, 727, 146, 743]); note.setContents('call 987654321 now');
  const hl = pg.createAnnotation('Highlight'); hl.setQuadPoints([[72, 744, 200, 744, 72, 728, 200, 728]]); hl.setContents('number 987654321');
  const away = pg.createAnnotation('Text'); away.setRect([80, 527, 100, 547]); away.setContents('far away 123');
  pg.createLink([72, 98, 200, 114], 'https://example.com/?id=987654321');
  const field = doc.addObject({ Type: 'Annot', Subtype: 'Widget', FT: 'Tx', T: 'acct', V: '987654321', Rect: [120, 728, 220, 746], F: 4, P: page });
  page.get('Annots').push(field);
  const root = doc.getTrailer().get('Root');
  root.put('AcroForm', doc.addObject({ Fields: [field] }));
  const el = doc.addObject({ Type: 'StructElem', S: 'P', Pg: page, Alt: 'account 987654321', ActualText: '987654321' });
  root.put('StructTreeRoot', doc.addObject({ Type: 'StructTreeRoot', K: [el] }));
  pg.destroy();
  return doc.saveToBuffer('').asUint8Array().slice();
}
// every string in the file: all page text, annotation contents, link addresses, field values, and the decompressed streams
function everything(b) {
  const d = open(b), pdf = d.asPDF(), out = [];
  for (let i = 0; i < d.countPages(); i++) {
    const p = pdf.loadPage(i);
    out.push(p.toStructuredText().asText(), ...p.getAnnotations().map((a) => a.getContents()), ...p.getLinks().map((l) => l.getURI()));
    p.destroy();
  }
  out.push(Buffer.from(pdf.saveToBuffer('decompress,ascii').asUint8Array()).toString('latin1'));
  return out.join('\n');
}

test('redact reach: comments, highlights, links, form fields and structure text under a mark leave no trace', () => {
  const src = reach();
  assert.ok(everything(src).includes('987654321'));
  const marks = findMatches(open(src).loadPage(0), 'word', '987654321').map((k) => ({ page: 0, ...k }));
  assert.equal(marks.length, 1);
  const out = redact(m, src, marks);
  { const e = everything(out), at = e.indexOf("987654321"); assert.ok(at < 0, "still in the file: " + JSON.stringify(e.slice(Math.max(0, at - 150), at + 60))); }
  // what is away from the mark stays
  const left = open(out).loadPage(0).getAnnotations().map((a) => a.getContents());
  assert.deepEqual(left, ['far away 123']);
  assert.ok(text(out).includes('Other line here'));
  const form = open(out).asPDF().getTrailer().get('Root').get('AcroForm').get('Fields');
  assert.equal(form.length, 0);
});
