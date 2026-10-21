// Evidence pictures for the varied-document audit (full-page PNGs into screenshots/arabic-audit/corpus/ev/; cropped by evidence.py)
import fs from 'node:fs'; import path from 'node:path';
import { m, fonts, SHOTS, outline } from '../lib.mjs';
import { pageNumbers } from '../../../src/lib/engine/tools.ts';
import { redact } from '../../../src/lib/engine/redact.ts';
import { layerWords } from '../../../src/lib/engine/ocr.ts';
import { applyAnnots } from '../../../src/lib/engine/annots.ts';
import { subjects } from './mx.mjs';
const out = path.join(SHOTS, 'corpus', 'ev'); fs.mkdirSync(out, { recursive: true });
const png = (name, bytes, scale = 1.5) => fs.writeFileSync(path.join(out, name + '.png'), m.Document.openDocument(bytes, 'application/pdf').loadPage(0).toPixmap(m.Matrix.scale(scale, scale), m.ColorSpace.DeviceRGB, false).asPNG());
const sub = (id) => subjects((s) => s.id === id)[0];
// 1 page numbers on a dark slide and on a CAD frame (before / after)
for (const id of ['slide-16x9--plain', 'cad-a3-title-block--plain']) { const b = sub(id).bytes(), d = new m.PDFDocument(b); pageNumbers(m, d, [0], { position: 'tr', total: true }); png(id + '--numbers', d.saveToBuffer('').asUint8Array().slice(), 1); }
// 2 redaction shifts the OCR layer: visible layer (Tr 0) with the ORIGINAL word boxes outlined, before and after a redaction elsewhere
{
  const s = sub('letter-a4--flatbed300+ocr'), b = s.bytes(), words = layerWords(m, b, 0);
  const show = (bytes) => { const d = new m.PDFDocument(bytes), c = d.findPage(0).get('Contents'), fix = (x) => x.writeStream(x.readStream().asString().replace(/3 Tr/g, '0 Tr')); if (c.isArray()) c.forEach((x) => { if (x.isStream()) fix(x); }); else fix(c); for (const w of words.slice(0, 40)) outline(d, 0, { x: w.x0, y: w.y0, w: w.x1 - w.x0, h: w.y1 - w.y0 }); return d.saveToBuffer('').asUint8Array().slice(); };
  png('ocr-layer-before', show(b), 2); png('ocr-layer-after-redaction', show(redact(m, b, [{ page: 0, x: 60, y: 400, w: 480, h: 40 }])), 2);
}
// 3 sticky note on a page shown upright through /Rotate 90: where the icon lands against where it was asked
{
  const s = sub('letter-a4--stored90'), rect = [470, 120, 490, 140], o = applyAnnots(m, s.bytes(), [], [{ id: 'n1', page: 0, kind: 'note', color: '#f5c518', note: 'x', rect }]);
  const d = new m.PDFDocument(o); outline(d, 0, { x: rect[0], y: rect[1], w: 20, h: 20 }, '0.9 0.1 0.1'); png('note-stored90', d.saveToBuffer('').asUint8Array().slice(), 2);
  const p = sub('letter-a4--plain'), o2 = applyAnnots(m, p.bytes(), [], [{ id: 'n1', page: 0, kind: 'note', color: '#f5c518', note: 'x', rect }]), d2 = new m.PDFDocument(o2); outline(d2, 0, { x: rect[0], y: rect[1], w: 20, h: 20 }, '0.9 0.1 0.1'); png('note-plain', d2.saveToBuffer('').asUint8Array().slice(), 2);
}
