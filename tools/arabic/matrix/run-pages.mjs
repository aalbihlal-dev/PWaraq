// Matrix 1: page numbers, watermark and page-editor text on every subject (variants, scans, hybrids).
// Judged by rendering before / after: position where it should be, upright, visible, and whether it lands on existing content.
// usage: node tools/arabic/matrix/run-pages.mjs [filter]   -> tests/audit-arabic/results/matrix-pages.json
import { m, fonts, T } from '../lib.mjs';
import { pageNumbers, watermark } from '../../../src/lib/engine/tools.ts';
import { editPage, LEADING } from '../../../src/lib/engine/editpage.ts';
import { wrap, measure } from '../../../src/lib/engine/textpage.ts';
import { subjects, render, diff, dark, expand, inside, centre, Rows, r1 } from './mx.mjs';

const F = fonts(), rows = new Rows('pages'), only = process.argv[2] ?? '';
for (const s of subjects((s) => s.id.includes(only))) {
  const bytes = s.bytes(), base = render(bytes, 1.5), W = base.pageW, H = base.pageH;
  // --- page numbers, bottom centre and top right
  for (const pos of ['bc', 'tr']) {
    try {
      const d = new m.PDFDocument(bytes); pageNumbers(m, d, [0], { position: pos, total: true, start: 1, size: 10 });
      const out = render(d.saveToBuffer('').asUint8Array().slice(), 1.5), df = diff(base, out, 20);
      const width = 19.5, ex = pos === 'bc' ? [W / 2, H - 23.6] : [W - 20 - width / 2, 26.4];
      if (!df.n) { rows.add('page numbers', pos, s, false, 'nothing visible', 'no pixel changed'); continue; }
      const [cx, cy] = [df.box.x + df.box.w / 2, df.box.y + df.box.h / 2], off = Math.hypot(cx - ex[0], cy - ex[1]);
      const over = dark(base, expand(df.box, 1)), upright = df.box.w > df.box.h * 1.4;
      const ok = off <= 6 && upright, faint = df.mean < 40;
      rows.add('page numbers', pos, s, !ok ? false : over > 0.03 || faint ? 'warn' : true, `off ${r1(off)} pt, mean contrast ${r1(df.mean)}, content under ${r1(over * 100)}%`, !upright ? 'sideways' : off > 6 ? 'not where expected' : faint ? 'nearly invisible: grey on a dark page' : over > 0.03 ? 'over existing content' : '');
    } catch (e) { rows.add('page numbers', pos, s, false, 'error', String(e.message).slice(0, 80)); }
  }
  // --- watermark (Arabic, 45 degrees, centre)
  try {
    const d = new m.PDFDocument(bytes); watermark(m, d, F, [0], { text: 'سري للغاية', angle: 45, size: 72, opacity: 0.35 });
    const out = render(d.saveToBuffer('').asUint8Array().slice(), 1.5), df = diff(base, out, 10);
    if (!df.n) rows.add('watermark', 'centre', s, false, 'nothing visible');
    else {
      const [cx, cy] = [df.box.x + df.box.w / 2, df.box.y + df.box.h / 2], off = Math.hypot(cx - W / 2, cy - H / 2) / Math.hypot(W, H), rising = df.angle > 20 && df.angle < 70, within = inside(df.box, { x: 0, y: 0, w: W, h: H }, 1);
      rows.add('watermark', 'centre + 45° rising', s, rising && off < 0.06 && within, `centre off ${r1(off * 100)}% of diagonal, angle ${r1(df.angle)}°, within page ${within}`, !rising ? 'wrong angle (page turn not undone?)' : off >= 0.06 ? 'off centre' : !within ? 'clipped' : '');
    }
  } catch (e) { rows.add('watermark', 'centre + 45° rising', s, false, 'error', String(e.message).slice(0, 80)); }
  // --- page editor: Arabic + Latin text box, red, right aligned, 40% down the page
  try {
    const text = 'ملاحظة: الدفع خلال 30 يوما — Net 30', bw = W * 0.76, lines = wrap((t) => measure(F.regular, t, 16), text, bw).length, box = { x: W * 0.12, y: H * 0.4, w: bw, h: lines * 16 * LEADING };
    const edit = { kind: 'text', text, size: 16, color: [0.85, 0.1, 0.1], bold: false, align: 'right', ...box };
    const d = editPage(m, new m.PDFDocument(bytes), 0, [edit], [], () => F), out = render(d.saveToBuffer('').asUint8Array().slice(), 1.5), df = diff(base, out, 25, expand(box, 30));
    if (!df.n) rows.add('page editor text', 'lands in its box', s, false, 'nothing visible');
    else {
      const inBox = inside(df.box, expand(box, 3)), rightEdge = Math.abs(df.box.x + df.box.w - (box.x + box.w)) <= 4, over = dark(base, df.box);
      rows.add('page editor text', 'lands in its box, right aligned', s, inBox && rightEdge ? (over > 0.05 ? 'warn' : true) : false, `inside box ${inBox}, right edge off ${r1(Math.abs(df.box.x + df.box.w - (box.x + box.w)))} pt, contrast ${r1(df.mean)}, content under ${r1(over * 100)}%`, !inBox ? 'outside the box' : !rightEdge ? 'not at the right edge' : over > 0.05 ? 'over existing content (user placed it)' : '');
    }
  } catch (e) { rows.add('page editor text', 'lands in its box, right aligned', s, false, 'error', String(e.message).slice(0, 80)); }
}
rows.save();
