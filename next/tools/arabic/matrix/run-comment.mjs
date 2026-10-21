// Matrix 3: Comment — rectangle, highlight on a real word, text box (Latin, to judge position), sticky note — on every subject.
// Judged by rendering before / after: does the mark land where it was asked on rotated / cropped / offset pages and on scans.
// usage: node tools/arabic/matrix/run-comment.mjs [filter]   -> tests/audit-arabic/results/matrix-comment.json
import { m } from '../lib.mjs';
import { applyAnnots, listAnnots } from '../../../src/lib/engine/annots.ts';
import { subjects, render, diff, expand, inside, iou, words, Rows, r1 } from './mx.mjs';

const rows = new Rows('comment'), only = process.argv[2] ?? '';
for (const s of subjects((s) => s.id.includes(only))) {
  const bytes = s.bytes(), base = render(bytes, 1.5), W = base.pageW, H = base.pageH;
  const one = (a) => { const out = applyAnnots(m, bytes, [], [{ id: 'n1', page: 0, color: '#d93a3a', note: '', ...a }]); return { out, df: diff(base, render(out, 1.5), 15) }; };
  // rectangle at a known place
  try {
    const rect = [W * 0.2, H * 0.55, W * 0.2 + 120, H * 0.55 + 50], { df } = one({ kind: 'square', rect }), want = { x: rect[0], y: rect[1], w: 120, h: 50 };
    rows.add('comment', 'rectangle lands where asked', s, df.n ? iou(df.box, want) > 0.8 : false, df.n ? `overlap ${r1(iou(df.box, want) * 100)}%` : 'nothing visible', df.n ? (iou(df.box, want) > 0.8 ? '' : 'wrong place') : 'invisible');
  } catch (e) { rows.add('comment', 'rectangle lands where asked', s, false, 'error', String(e.message).slice(0, 80)); }
  // text box (Latin text so the position can be judged; Arabic text is a known gap)
  try {
    const rect = [W * 0.15, H * 0.7, W * 0.15 + 170, H * 0.7 + 40], { out, df } = one({ kind: 'text', rect, note: 'Check 123' }), want = { x: rect[0], y: rect[1], w: 170, h: 40 };
    const back = listAnnots(m, out)[0], ok = df.n && inside(df.box, expand(want, 3)) && df.box.w > df.box.h;
    rows.add('comment', 'text box (Latin) lands in its box, upright', s, ok, df.n ? `inside ${inside(df.box, expand(want, 3))}, w/h ${r1(df.box.w / df.box.h)}, read back ${back?.note}` : 'nothing visible', !df.n ? 'invisible' : !ok ? 'wrong place or sideways' : '');
  } catch (e) { rows.add('comment', 'text box (Latin) lands in its box, upright', s, false, 'error', String(e.message).slice(0, 80)); }
  // sticky note icon
  try {
    const rect = [W * 0.8, H * 0.2, W * 0.8 + 20, H * 0.2 + 20], { df } = one({ kind: 'note', rect, note: 'ملاحظة' }), off = df.n ? Math.hypot(df.box.x + df.box.w / 2 - (rect[0] + 10), df.box.y + df.box.h / 2 - (rect[1] + 10)) : 99;
    rows.add('comment', 'sticky note icon lands where asked', s, !df.n ? false : off <= 8 ? true : off <= 30 ? 'warn' : false, df.n ? `icon centre ${r1(off)} pt from the click` : 'nothing visible', !df.n ? 'invisible' : off <= 8 ? '' : 'icon sits off the clicked point (anchored by a page corner, not by the click)');
  } catch (e) { rows.add('comment', 'sticky note icon lands where asked', s, false, 'error', String(e.message).slice(0, 80)); }
  // highlight on a real word (needs text: plain scans have none)
  if (s.source !== 'scan') {
    try {
      const ws = words(bytes).filter((w) => w.text.length > 3 && w.w > 20 && w.h > 5 && w.h < 40).sort((a, b) => b.w - a.w);
      const w = ws[Math.floor(ws.length / 3)];
      if (w) {
        const { df } = one({ kind: 'highlight', color: '#f5c518', rect: [w.x, w.y, w.x + w.w, w.y + w.h], quads: [[w.x, w.y, w.x + w.w, w.y, w.x, w.y + w.h, w.x + w.w, w.y + w.h]] });
        rows.add('comment', 'highlight covers the word', s, df.n ? iou(df.box, w) > 0.6 : false, df.n ? `overlap ${r1(iou(df.box, w) * 100)}% on «${w.text.slice(0, 12)}»` : 'nothing visible', !df.n ? 'invisible' : iou(df.box, w) > 0.6 ? '' : 'misplaced');
      }
    } catch (e) { rows.add('comment', 'highlight covers the word', s, false, 'error', String(e.message).slice(0, 80)); }
  }
}
rows.save();
