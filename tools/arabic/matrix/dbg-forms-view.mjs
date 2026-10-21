import fs from 'node:fs'; import path from 'node:path';
import { m, fonts, SHOTS } from '../lib.mjs';
import { pageBox, seenMatrix } from '../../../src/lib/engine/tools.ts';
import { fillForm, listFields } from '../../../src/lib/engine/forms.ts';
import { subjects, render, truth } from './mx.mjs';
const F = fonts();
function withFields(bytes, boxes) {
  const d = new m.PDFDocument(bytes), page = d.findPage(0), { box, rot, seenH } = pageBox(page), mat = seenMatrix(box, rot);
  const ap = (x, y) => [mat[0] * x + mat[2] * y + mat[4], mat[1] * x + mat[3] * y + mat[5]];
  const fields = d.newArray(), annots = page.get('Annots').isArray() ? page.get('Annots') : d.newArray();
  boxes.forEach((b, i) => {
    const p = [ap(b.x, seenH - b.y - b.h), ap(b.x + b.w, seenH - b.y)], w = d.addObject(d.newDictionary());
    w.put('Type', d.newName('Annot')); w.put('Subtype', d.newName('Widget')); w.put('F', 4); w.put('P', page); w.put('FT', d.newName('Tx'));
    w.put('Rect', [Math.min(p[0][0], p[1][0]), Math.min(p[0][1], p[1][1]), Math.max(p[0][0], p[1][0]), Math.max(p[0][1], p[1][1])].map((v) => +v.toFixed(2)));
    w.put('T', d.newString(b.name)); w.put('DA', d.newString('/Helv 12 Tf 0 g')); if (b.multi) w.put('Ff', 4096);
    if (rot) { const mk = d.newDictionary(); mk.put('R', rot); w.put('MK', mk); }
    fields.push(w); annots.push(w);
  });
  page.put('Annots', annots);
  const af = d.newDictionary(), dr = d.newDictionary(), df = d.newDictionary(), helv = d.addObject(d.newDictionary());
  helv.put('Type', d.newName('Font')); helv.put('Subtype', d.newName('Type1')); helv.put('BaseFont', d.newName('Helvetica')); helv.put('Encoding', d.newName('WinAnsiEncoding'));
  df.put('Helv', helv); dr.put('Font', df); af.put('Fields', fields); af.put('DR', dr); af.put('DA', d.newString('/Helv 12 Tf 0 g'));
  d.getTrailer().get('Root').put('AcroForm', af);
  return d.saveToBuffer('').asUint8Array().slice();
}

const out = path.join(SHOTS, 'corpus', 'forms'); fs.mkdirSync(out, { recursive: true });
for (const id of ['form-boxes-a4--plain', 'form-boxes-a4--stored90', 'form-boxes-a4--stored180', 'form-boxes-a4--stored270', 'form-boxes-a4--rot90', 'form-boxes-a4--origin-crop-rot270']) {
  const s = subjects((s) => s.id === id)[0], boxes = truth(s, 'field'), fb = withFields(s.bytes(), boxes), f = listFields(m, fb);
  const filled = fillForm(m, fb, { [f.find((x) => x.name === 'notes').id]: 'ملاحظات أولى\nملاحظات ثانية' }, false, F);
  const pg = m.Document.openDocument(filled, 'application/pdf').loadPage(0), [x0, y0, x1, y1] = pg.getBounds();
  fs.writeFileSync(path.join(out, id.split('--')[1] + '.png'), pg.toPixmap(m.Matrix.scale(1.0, 1.0), m.ColorSpace.DeviceRGB, false).asPNG());
}
