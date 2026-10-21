// Matrix 5: Portfolio — whole portfolios built from the varied sources (document types, turned / cropped / offset pages, scans,
// hybrids, a photo). Judged per source page: same size as seen, same picture (outside the page-number strip), page number present;
// and per section: divider and contents sized like their neighbours. Built with assemble() exactly as src/lib/portfolio.ts build() does.
// usage: node tools/arabic/matrix/run-portfolio.mjs   -> tests/audit-arabic/results/matrix-portfolio.json
import fs from 'node:fs'; import path from 'node:path';
import { m, fonts, OUT } from '../lib.mjs';
import { assemble } from '../../../src/lib/engine/assemble.ts';
import { tocPerPage } from '../../../src/lib/engine/textpage.ts';
import { subjects, render, diff, Rows, r1 } from './mx.mjs';

const F = fonts(), rows = new Rows('portfolio');
const ALL = subjects();
const pick = (f) => ALL.filter(f);
// the portfolio cases: [name, subjects in section order]
const CASES = [
  ['every document type (plain)', pick((s) => s.source === 'variant' && s.variant === 'plain')],
  ['one letter in every geometry', pick((s) => s.doc === 'letter-a4' && s.source === 'variant')],
  ['a paper file in mixed scans', pick((s) => s.source === 'scan' && ['flatbed300', 'phone', 'onebit', 'faded', 'photocopy', 'skew3', 'curved'].includes(s.variant) && s.doc !== 'table-landscape')],
  ['scans with an OCR layer', pick((s) => s.source === 'hybrid')],
  ['mixed: sheets turned, offset, cropped, scanned, slides, posters', pick((s) => (s.source === 'variant' && ['rot90', 'origin-crop-rot270', 'stored90'].includes(s.variant) && ['invoice-a4', 'slide-16x9', 'poster-a3', 'cad-a3-title-block'].includes(s.doc)) || (s.source === 'scan' && s.variant === 'phone'))],
];
for (const [name, subs] of CASES) {
  const docs = [], bytesList = [];
  subs.forEach((s) => { const b = s.bytes(); bytesList.push(b); docs.push({ doc: m.Document.openDocument(b, 'application/pdf'), bytes: b }); });
  const seenSize = docs.map((d) => { const [x0, y0, x1, y1] = d.doc.loadPage(0).getBounds(); return { w: x1 - x0, h: y1 - y0 }; });
  const tocSize = seenSize[0], per = tocPerPage(tocSize.w, tocSize.h), entries = subs.map((s, i) => ({ title: `${s.type} — ${s.variant}`, number: 3 + i * 2, to: 2 + i * 2 }));
  const items = [{ cover: { ...tocSize, design: 'classic', color: '#3a4248', rtl: true, title: 'حافظة اختبار شاملة', subtitle: name, names: ['عبدالله محمد'], supervisor: 'د. أحمد', supervisorLabel: 'إشراف:', logos: {} } }];
  for (let p = 0; p * per < entries.length; p++) items.push({ toc: { ...tocSize, heading: 'المحتويات', rtl: true, entries: entries.slice(p * per, (p + 1) * per) } });
  const first = items.length, src = [];
  subs.forEach((s, i) => { items.push({ divider: { ...seenSize[i], label: `القسم ${i + 1}`, title: `${s.type} ${s.variant}`, note: '', design: 'classic', color: '#3a4248', rtl: true }, rotate: 0 }); src.push({ i, at: items.length }); items.push({ doc: i, page: 0 }); });
  let out;
  try { out = assemble(m, (id) => docs[id], { items, numbers: items.map((_, i) => i).slice(1), numberStyle: { position: 'bc', start: 1 } }, () => F); }
  catch (e) { subs.forEach((s) => rows.add('portfolio', 'builds', { ...s, id: name + ' / ' + s.id }, false, 'error', String(e.message).slice(0, 100))); continue; }
  const o = m.Document.openDocument(out, 'application/pdf');
  rows.add('portfolio', 'page count', { id: name, source: 'case', doc: name, type: name, arrangement: `${subs.length} sections`, variant: '' }, o.countPages() === items.length, `${o.countPages()} pages, expected ${items.length}`, '');
  for (const { i, at } of src) {
    const s = subs[i], sub = { ...s, id: `${name} / ${s.id}` };
    const p = o.loadPage(at), [x0, y0, x1, y1] = p.getBounds(), dv = o.loadPage(at - 1), [a0, b0, a1, b1] = dv.getBounds();
    const sameSize = Math.abs(x1 - x0 - seenSize[i].w) < 0.5 && Math.abs(y1 - y0 - seenSize[i].h) < 0.5, divSize = Math.abs(a1 - a0 - seenSize[i].w) < 0.5 && Math.abs(b1 - b0 - seenSize[i].h) < 0.5;
    p.destroy(); dv.destroy();
    rows.add('portfolio', 'page keeps its size as seen', sub, sameSize, `${r1(x1 - x0)}×${r1(y1 - y0)} vs source ${r1(seenSize[i].w)}×${r1(seenSize[i].h)}`, sameSize ? '' : 'page size changed');
    rows.add('portfolio', 'divider sized like its section', sub, divSize, `${r1(a1 - a0)}×${r1(b1 - b0)}`, divSize ? '' : 'divider size differs');
    if (sameSize) {
      const a = render(bytesList[i], 1), b = render(out, 1, at), W = a.pageW, H = a.pageH;
      // outside the page-number strip (bottom centre) the page must be pixel-identical to the source
      let bad = 0, n = 0; for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) { if (y > H - 45 && x > W / 2 - 40 && x < W / 2 + 40) continue; n++; if (Math.abs(a.px[y * a.w + x] - b.px[y * a.w + x]) > 12) bad++; }
      const num = diff(a, b, 20, { x: W / 2 - 40, y: H - 45, w: 80, h: 45 });
      rows.add('portfolio', 'page picture unchanged, number added', sub, bad / n < 0.002 && num.n > 0, `${r1((bad / n) * 100)}% pixels differ, number ${num.n > 0 ? 'present' : 'missing'}`, bad / n >= 0.002 ? 'picture changed' : num.n > 0 ? '' : 'page number missing');
    }
  }
  // contents: its rows are links to the right sections
  const toc = o.loadPage(1), links = toc.getLinks().length; toc.destroy();
  rows.add('portfolio', 'contents rows are links', { id: name, source: 'case', doc: name, type: name, arrangement: `${subs.length} sections`, variant: '' }, links === Math.min(per, entries.length), `${links} links for ${Math.min(per, entries.length)} rows on the first contents page`, '');
  fs.writeFileSync(path.join(OUT, `out-portfolio-${CASES.findIndex((c) => c[0] === name)}.pdf`), out);
}
// a phone photo as an image source between pages of another size: shape kept, centred
{
  const png = Buffer.from(m.Document.openDocument(subjects((s) => s.id === 'letter-a4--phone')[0].bytes(), 'application/pdf').loadPage(0).toPixmap(m.Matrix.scale(1.2, 1.2), m.ColorSpace.DeviceRGB, false).asPNG());
  const img = m.Document.openDocument(new Uint8Array(png), 'image/png'), a4 = subjects((s) => s.id === 'poster-a3--plain')[0], pdf = m.Document.openDocument(a4.bytes(), 'application/pdf');
  const out = assemble(m, (id) => (id === 0 ? { doc: pdf, bytes: a4.bytes() } : { doc: img, bytes: new Uint8Array(png) }), { items: [{ doc: 0, page: 0 }, { doc: 1, page: 0, fit: { w: 842, h: 1191 } }] }, () => F);
  const d = m.Document.openDocument(out, 'application/pdf'), p = d.loadPage(1), b = p.getBounds(), r = render(out, 0.5, 1);
  let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1; for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) if (r.px[y * r.w + x] < 250) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const asp = (x1 - x0) / (y1 - y0), want = 595 / 842;
  rows.add('portfolio', 'photo page fits its neighbours, shape kept', { id: 'photo source', source: 'case', doc: 'photo', type: 'phone photo as image source', arrangement: 'fit to A3', variant: '' }, Math.abs(b[2] - 842) < 1 && Math.abs(asp / want - 1) < 0.05, `page ${r1(b[2])}×${r1(b[3])}, photo aspect ${r1(asp)} vs ${r1(want)}`, '');
}
rows.save();
