import { m } from '../lib.mjs';
import { subjects, render, diff, truth } from './mx.mjs';
for (const id of ['letter-a4--flatbed300', 'letter-a4--flatbed300+ocr', 'letter-a4--plain']) {
  const s = subjects((s) => s.id === id)[0], b = truth(s, 'pii')[0], bytes = s.bytes(), a = render(bytes, 1.5);
  for (const box of [[b.x, b.y, b.x + b.w, b.y + b.h], [100, 100, 300, 200]]) {
    const d = m.Document.openDocument(bytes, 'application/pdf').asPDF(), p = d.loadPage(0), an = p.createAnnotation('Redact'); an.setRect(box); p.applyRedactions(true, 2, 1, 0); p.destroy();
    const out = d.saveToBuffer('garbage=4,compress').asUint8Array().slice(); console.log(id.padEnd(28), box.map(Math.round).join(','), JSON.stringify(diff(a, render(out, 1.5), 10)).slice(0, 100));
  }
}
