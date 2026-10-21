import fs from 'node:fs'; import path from 'node:path';
import { m, OUT } from './lib.mjs';
const blank = new Uint8Array(fs.readFileSync(path.join(OUT, 'forms-blank.pdf')));
const ap = (doc) => doc.addStream('BT /Helv 12 Tf 1 0 0 1 5 5 Tm (X) Tj ET', { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 100, 20] });
const tag = (b, n) => { const a = m.Document.openDocument(b, 'application/pdf').asPDF().findPage(0).get('Annots').get(n).get('AP', 'N'); return a.isStream() ? a.readStream().asString().slice(0, 25).replace(/\n/g, ' ') : 'none'; };
function run(label, setN, order) {
  const doc = m.Document.openDocument(blank, 'application/pdf').asPDF(), page = doc.loadPage(0), ws = page.getWidgets();
  if (order === 'put-after-all') { for (let i = 0; i < setN; i++) ws[i].setTextValue('v' + i); for (let i = 0; i < setN; i++) ws[i].getObject().put('AP', { N: ap(doc) }); }
  if (order === 'interleaved') for (let i = 0; i < setN; i++) { ws[i].setTextValue('v' + i); ws[i].getObject().put('AP', { N: ap(doc) }); }
  const b = doc.saveToBuffer('').asUint8Array().slice();
  console.log(label, '| w0:', tag(b, 0), '| w1:', tag(b, 1));
}
run('1 field', 1, 'interleaved'); run('2 interleaved', 2, 'interleaved'); run('2 put-after-all', 2, 'put-after-all');
// can the AP be made to stick? mark widget not-dirty by re-reading value
{
  const doc = m.Document.openDocument(blank, 'application/pdf').asPDF(), page = doc.loadPage(0), ws = page.getWidgets();
  ws[0].setTextValue('a'); ws[1].setTextValue('b');
  page.update?.(); // pdf_update_page: regenerates dirty appearances now
  ws[0].getObject().put('AP', { N: ap(doc) }); ws[1].getObject().put('AP', { N: ap(doc) });
  console.log('after page.update():', tag(doc.saveToBuffer('').asUint8Array().slice(), 0), '|', tag(doc.saveToBuffer('').asUint8Array().slice(), 1));
}
