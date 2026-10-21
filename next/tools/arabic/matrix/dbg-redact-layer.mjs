import { m } from '../lib.mjs';
import { redact } from '../../../src/lib/engine/redact.ts';
import { layerWords } from '../../../src/lib/engine/ocr.ts';
import { subjects } from './mx.mjs';
const s = subjects((s) => s.id === 'letter-a4--flatbed300+ocr')[0], bytes = s.bytes();
const lw = (b) => layerWords(m, b, 0);
const a = lw(bytes), out = redact(m, bytes, [{ page: 0, x: 60, y: 400, w: 480, h: 40 }]), b = lw(out);
console.log(a.length, b.length);
for (const w of a.slice(0, 14)) { const q = b.find((x) => x.text === w.text); console.log(w.text.padEnd(12), w.x0.toFixed(1), w.x1.toFixed(1), w.y0.toFixed(1), '->', q ? [q.x0.toFixed(1), q.x1.toFixed(1), q.y0.toFixed(1)].join(' ') : 'gone'); }
const d = m.Document.openDocument(out, 'application/pdf').asPDF(), c = d.findPage(0).get('Contents');
const txt = (c.isArray() ? [...Array(c.length).keys()].map((i) => c.get(i).readStream().asString()).join('\n') : c.readStream().asString());
console.log(txt.slice(0, 600).replace(/\n/g, ' | '));
const d0 = m.Document.openDocument(bytes, 'application/pdf').asPDF(), c0 = d0.findPage(0).get('Contents');
const t0 = (c0.isArray() ? [...Array(c0.length).keys()].map((i) => c0.get(i).readStream().asString()).join('\n') : c0.readStream().asString());
console.log('BEFORE:', t0.slice(0, 500).replace(/\n/g, ' | '));
