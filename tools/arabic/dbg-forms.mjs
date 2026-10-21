import fs from 'node:fs'; import path from 'node:path';
import { m, fonts, OUT } from './lib.mjs';
import { fillForm, listFields } from '../../src/lib/engine/forms.ts';
const blank = new Uint8Array(fs.readFileSync(path.join(OUT, 'forms-blank.pdf')));
const f = listFields(m, blank);
const fontOf = (out, n) => { try { return fontOf2(out, n); } catch (e) { return 'ERR ' + String(e).slice(0,60); } };
const fontOf2 = (out, n) => { const d = m.Document.openDocument(out, 'application/pdf').asPDF(), a = d.findPage(0).get('Annots').get(n); return a.get('AP','N').readStream().asString().slice(0,40).replace(/\n/g,' '); };
for (const [label, ans] of [['1 text', { [f[0].id]: 'عبدالله' }], ['2 text', { [f[0].id]: 'عبدالله', [f[1].id]: 'العنوان' }], ['text+combo', { [f[0].id]: 'عبدالله', [f[4].id]: 'مسقط' }], ['combo then text', { [f[4].id]: 'مسقط', [f[0].id]: 'عبدالله' }]]) {
  const out = fillForm(m, blank, ans, false, fonts());
  console.log(label, '| field0 AP:', fontOf(out, 0), '| field1 AP:', fontOf(out, 1));
}
// flatten with ONE Arabic text answer: is it drawn on the page?
const one = fillForm(m, blank, { [f[0].id]: 'عبدالله محمد' }, true, fonts());
const pg = m.Document.openDocument(one, 'application/pdf').loadPage(0), pix = pg.toPixmap(m.Matrix.identity, m.ColorSpace.DeviceGray, false), px = pix.getPixels(), W = pix.getWidth();
let dark = 0; for (let y = 52; y < 82; y++) for (let x = 60; x < 535; x++) if (px[y * W + x] < 128) dark++;
console.log('flatten one Arabic answer, dark px in field:', dark, '| text:', JSON.stringify(pg.toStructuredText().asText().trim()));
