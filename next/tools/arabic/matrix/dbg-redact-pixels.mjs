// does the redacted scan still hold the original pixels under the black box? (image XObject read back, region sampled)
import { m } from '../lib.mjs';
import { redact } from '../../../src/lib/engine/redact.ts';
import { subjects, truth } from './mx.mjs';
for (const id of ['letter-a4--flatbed300', 'invoice-a4--flatbed150', 'letter-a4--phone', 'form-boxes-a4--photocopy']) {
  const s = subjects((s) => s.id === id)[0], b = truth(s, 'pii')?.[0] ?? { x: 100, y: 200, w: 120, h: 20 }, bytes = s.bytes();
  const region = (b0) => {
    const d = m.Document.openDocument(b0, 'application/pdf').asPDF(), xo = d.findPage(0).get('Resources', 'XObject'); let res = null;
    xo.forEach((v, k) => { if (v.get('Subtype').asName() === 'Image') { const img = d.loadImage(v), pix = img.toPixmap(), k2 = pix.getWidth() / 595, x0 = Math.floor(b.x * k2), y0 = Math.floor(b.y * k2), x1 = Math.ceil((b.x + b.w) * k2), y1 = Math.ceil((b.y + b.h) * k2), px = pix.getPixels(), n = pix.getNumberOfComponents(); let dark = 0, t = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { t++; if (px[(y * pix.getWidth() + x) * n] < 128) dark++; } res = { dark, t, w: pix.getWidth() }; } });
    return res;
  };
  const before = region(bytes), after = region(redact(m, bytes, [{ page: 0, x: b.x, y: b.y, w: b.w, h: b.h }]));
  console.log(id.padEnd(28), 'ink pixels in the box inside the image: before', before?.dark, 'of', before?.t, '| after', after?.dark, 'of', after?.t);
}
