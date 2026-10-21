// Writer 2: Comment — text box (FreeText), sticky note (Text), and a highlight with a note, via annots.applyAnnots
// -> tests/fixtures/arabic-create/comment.pdf (+ comment-offline.pdf: same file after a round trip through listAnnots)
import fs from 'node:fs';
import path from 'node:path';
import { m, T, OUT, basePdf, save, writeOut, outline } from './lib.mjs';
import { applyAnnots } from '../../src/lib/engine/annots.ts';
import { fonts } from './lib.mjs';

const specs = [];
const A4 = { w: 595, h: 842 };
const add = (label, pageSpec, items) => specs.push({ label, pageSpec, items });
// all scenarios as text boxes (rect = box), 160 x 36 default size is what a click gives; drags give any size
{
  const ks = ['pure', 'mixed', 'indic', 'tashkeel', 'lamalef', 'parens', 'persian', 'latin', 'one'];
  add('freetext-stack', A4, ks.map((k, i) => ({ kind: 'text', color: '#233c36', note: T[k], rect: [60, 30 + i * 70, 535, 30 + i * 70 + 50] })));
  add('freetext-long', A4, [{ kind: 'text', color: '#233c36', note: T.long, rect: [60, 30, 535, 140] }, { kind: 'text', color: '#233c36', note: T.longword, rect: [60, 180, 535, 260] },
    { kind: 'text', color: '#233c36', note: T.long, rect: [60, 300, 260, 340] }, { kind: 'text', color: '#233c36', note: 'ب', rect: [60, 400, 220, 436] }]);
  add('freetext-colours', A4, [{ kind: 'text', color: '#d93a3a', note: T.pure, rect: [60, 30, 535, 80] }, { kind: 'text', color: '#2f6fd6', note: T.mixed, rect: [60, 100, 535, 150] }, { kind: 'text', color: '#15775d', note: T.pure, rect: [60, 170, 535, 220] }]);
  // sticky notes (Text annotation): the note text lives in /Contents and shows in a popup, not on the page
  add('sticky-stack', A4, ['pure', 'mixed', 'indic', 'tashkeel', 'lamalef', 'parens'].map((k, i) => ({ kind: 'note', color: '#f5c518', note: T[k], rect: [60 + i * 60, 60, 80 + i * 60, 80] })));
  // a highlight that carries a note
  add('highlight-note', A4, [{ kind: 'highlight', color: '#f5c518', note: T.mixed, rect: [60, 100, 500, 120], quads: [[60, 100, 500, 100, 60, 120, 500, 120]] }]);
}
for (const rot of [90, 180, 270]) add('rot' + rot, { w: 612, h: 792, rot }, [{ kind: 'text', color: '#233c36', note: T.mixed, rect: [40, 40, 400, 90] }, { kind: 'text', color: '#233c36', note: T.pure, rect: [40, 120, 400, 170] }, { kind: 'note', color: '#f5c518', note: T.pure, rect: [450, 60, 470, 80] }]);
add('crop-origin', { w: 595, h: 842, media: [100, 200, 695, 1042], crop: [150, 250, 600, 700] }, [{ kind: 'text', color: '#233c36', note: T.mixed, rect: [20, 30, 430, 80] }, { kind: 'text', color: '#233c36', note: T.pure, rect: [20, 120, 430, 170] }]);
add('crop-origin-rot90', { w: 595, h: 842, media: [100, 200, 695, 1042], crop: [150, 250, 600, 700], rot: 90 }, [{ kind: 'text', color: '#233c36', note: T.mixed, rect: [20, 30, 430, 80] }]);
add('size-A3', { w: 842, h: 1191 }, [{ kind: 'text', color: '#233c36', note: T.mixed, rect: [20, 20, 800, 70] }]);
add('size-square300', { w: 300, h: 300 }, [{ kind: 'text', color: '#233c36', note: T.mixed, rect: [10, 10, 290, 60] }]);

const base = basePdf(specs.map((s) => s.pageSpec)); // page i <- specs[i]
let bytes = save(base);
const adds = specs.flatMap((s, i) => s.items.map((it, n) => ({ id: `n${i}_${n}`, page: i, ...it })));
bytes = applyAnnots(m, bytes, [], adds, fonts());
writeOut('comment.pdf', bytes);
const man = specs.map((s, i) => ({ writer: 'comment', file: 'comment.pdf', page: i, label: s.label, expect: s.items.filter((x) => x.kind !== 'highlight' && x.kind !== 'note').map((x) => x.note), notes: s.items.filter((x) => x.kind === 'note' || x.kind === 'highlight').map((x) => x.note) }));
fs.writeFileSync(path.join(OUT, 'manifest-comment.json'), JSON.stringify(man, null, 1));
console.log('comment.pdf', bytes.length);
// What each annotation really contains
const doc = m.Document.openDocument(bytes, 'application/pdf').asPDF();
const first = doc.findPage(0).get('Annots');
const info = [];
for (let i = 0; i < first.length; i++) {
  const a = first.get(i), ap = a.get('AP', 'N');
  const res = ap.isStream() ? ap.get('Resources', 'Font') : null;
  let fontNames = [];
  if (res?.isDictionary()) res.forEach((f, k) => fontNames.push(k + ':' + f.get('BaseFont').toString()));
  info.push({ subtype: a.get('Subtype').toString(), contents: a.get('Contents').toString().slice(0, 30), da: a.get('DA').toString(), ap: ap.isStream() ? ap.readStream().asString().slice(0, 160) : 'none', fonts: fontNames });
}
fs.writeFileSync(path.join(OUT, 'comment-internals.json'), JSON.stringify(info, null, 1));
console.log(JSON.stringify(info.slice(0, 2), null, 1));
