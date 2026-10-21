// Helpers for the varied-document matrix: the subjects (variants, scans, hybrids), rendering, change detection, results.
import fs from 'node:fs'; import path from 'node:path';
import { m, OUT, ROOT } from '../lib.mjs';

export const RES = path.join(ROOT, 'tests/audit-arabic/results'); fs.mkdirSync(RES, { recursive: true });
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const bytesOf = (p) => new Uint8Array(fs.readFileSync(p));
export const baseMeta = (id) => readJson(path.join(OUT, 'base', id + '.json'));

/** every subject: { id, source: 'variant' | 'scan' | 'hybrid', doc, type, arrangement, variant|kind, bytes, v (geometry), W, H } */
export function subjects(filter = () => true) {
  const out = [];
  for (const e of readJson(path.join(OUT, 'variants/index.json'))) out.push({ id: e.file.replace('.pdf', ''), source: 'variant', doc: e.doc, type: e.type, arrangement: e.arrangement, variant: e.variant, v: e, W: e.W, H: e.H, path: path.join(OUT, 'variants', e.file) });
  for (const e of readJson(path.join(OUT, 'scans/index.json'))) {
    out.push({ id: e.file.replace('.pdf', ''), source: 'scan', doc: e.doc, type: e.type, arrangement: e.arrangement, variant: e.kind, v: { rot: 0, dx: 0, dy: 0, c: 0 }, W: e.w, H: e.h, path: path.join(OUT, 'scans', e.file) });
    const h = path.join(OUT, 'hybrid', e.file);
    if (fs.existsSync(h)) out.push({ id: e.file.replace('.pdf', '') + '+ocr', source: 'hybrid', doc: e.doc, type: e.type, arrangement: e.arrangement, variant: e.kind, v: { rot: 0, dx: 0, dy: 0, c: 0 }, W: e.w, H: e.h, path: h, lines: path.join(OUT, 'hybrid', e.file.replace('.pdf', '.lines.json')) });
  }
  return out.filter(filter).map((s) => ({ ...s, bytes: () => bytesOf(s.path) }));
}

/** page 0 rendered as grey pixels at `scale` px per point (seen coordinates = pixel / scale) */
export function render(bytes, scale = 2, page = 0) {
  const d = m.Document.openDocument(bytes, 'application/pdf'), p = d.loadPage(page), pix = p.toPixmap(m.Matrix.scale(scale, scale), m.ColorSpace.DeviceGray, false);
  const out = { w: pix.getWidth(), h: pix.getHeight(), px: new Uint8Array(pix.getPixels()), scale, pageW: pix.getWidth() / scale, pageH: pix.getHeight() / scale }; pix.destroy(); p.destroy(); d.destroy(); return out;
}
/** bounding box (points) of the pixels that changed by more than `thr` between two renders of the same size, with stats */
export function diff(a, b, thr = 12, within) {
  if (a.w !== b.w || a.h !== b.h) return { error: `size ${a.w}x${a.h} -> ${b.w}x${b.h}` };
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, n = 0, sum = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  const win = within ? [Math.max(0, Math.floor(within.x * a.scale)), Math.max(0, Math.floor(within.y * a.scale)), Math.min(a.w, Math.ceil((within.x + within.w) * a.scale)), Math.min(a.h, Math.ceil((within.y + within.h) * a.scale))] : [0, 0, a.w, a.h];
  for (let y = win[1]; y < win[3]; y++) for (let x = win[0]; x < win[2]; x++) {
    const d = Math.abs(a.px[y * a.w + x] - b.px[y * a.w + x]); if (d <= thr) continue;
    n++; sum += d; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
  }
  if (!n) return { n: 0 };
  const k = a.scale, mx = sx / n, my = sy / n, cxx = sxx / n - mx * mx, cyy = syy / n - my * my, cxy = sxy / n - mx * my;
  // main axis angle of the changed pixels, degrees counter-clockwise on the screen (y up)
  const ang = (0.5 * Math.atan2(-2 * cxy, cxx - cyy) * 180) / Math.PI;
  return { n, box: { x: x0 / k, y: y0 / k, w: (x1 - x0 + 1) / k, h: (y1 - y0 + 1) / k }, cx: mx / k, cy: my / k, mean: sum / n, angle: ang };
}
/** share of dark pixels (< thr) of render `r` inside a box in points */
export function dark(r, b, thr = 150) {
  const x0 = Math.max(0, Math.floor(b.x * r.scale)), y0 = Math.max(0, Math.floor(b.y * r.scale)), x1 = Math.min(r.w, Math.ceil((b.x + b.w) * r.scale)), y1 = Math.min(r.h, Math.ceil((b.y + b.h) * r.scale));
  let n = 0, t = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { t++; if (r.px[y * r.w + x] < thr) n++; }
  return t ? n / t : 0;
}
export const expand = (b, e) => ({ x: b.x - e, y: b.y - e, w: b.w + 2 * e, h: b.h + 2 * e });
export const inside = (inner, outer, tol = 0) => inner.x >= outer.x - tol && inner.y >= outer.y - tol && inner.x + inner.w <= outer.x + outer.w + tol && inner.y + inner.h <= outer.y + outer.h + tol;
export const iou = (a, b) => { const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)), y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)), i = x * y; return i / (a.w * a.h + b.w * b.h - i || 1); };
export const centre = (b) => [b.x + b.w / 2, b.y + b.h / 2];

/** words of page 0 as MuPDF reads them: { text, x, y, w, h } in seen points */
export function words(bytes, page = 0) {
  const d = m.Document.openDocument(bytes, 'application/pdf'), p = d.loadPage(page), st = p.toStructuredText('preserve-whitespace'), out = [];
  let cur = null; const end = () => { if (cur && cur.text) out.push({ text: cur.text, x: cur.x0, y: cur.y0, w: cur.x1 - cur.x0, h: cur.y1 - cur.y0 }); cur = null; };
  st.walk({ endLine: end, onChar(c, _o, _f, _s, q) { if (c === ' ') return end(); const xs = [q[0], q[2], q[4], q[6]], ys = [q[1], q[3], q[5], q[7]]; cur ??= { text: '', x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 }; cur.text += c; cur.x0 = Math.min(cur.x0, ...xs); cur.y0 = Math.min(cur.y0, ...ys); cur.x1 = Math.max(cur.x1, ...xs); cur.y1 = Math.max(cur.y1, ...ys); } });
  end(); st.destroy(); p.destroy(); d.destroy(); return out;
}
export const pageText = (bytes, page = 0) => { const d = m.Document.openDocument(bytes, 'application/pdf'), p = d.loadPage(page), st = p.toStructuredText('preserve-whitespace'), t = st.asText(); st.destroy(); p.destroy(); d.destroy(); return t; };

/** result rows: { writer, check, subject, source, doc, type, arrangement, variant, value, pass: true|false|'warn', note } */
export class Rows {
  constructor(name) { this.name = name; this.rows = []; }
  add(writer, check, s, pass, value = '', note = '') { this.rows.push({ writer, check, subject: s.id, source: s.source, doc: s.doc, type: s.type, arrangement: s.arrangement, variant: s.variant, pass, value, note }); }
  save() { fs.writeFileSync(path.join(RES, `matrix-${this.name}.json`), JSON.stringify(this.rows, null, 1)); const t = {}; for (const r of this.rows) { const k = `${r.writer}/${r.check}: ${r.pass}`; t[k] = (t[k] ?? 0) + 1; } console.log(this.name, this.rows.length, 'rows'); console.log(Object.entries(t).map(([k, v]) => `  ${k} = ${v}`).join('\n')); }
}
export const r1 = (v) => (typeof v === 'number' ? +v.toFixed(1) : v);

// ground truth: the marked boxes of the base document (role = sign | field | pii | date | checkbox) in the subject's seen coordinates;
// null when the scan changed the geometry (phone photo, skew, curve), where only counts can be judged
import { mapBox } from '../corpus/make-variants.mjs';
const SAME_GEOMETRY = new Set(['flatbed150', 'flatbed300', 'faded', 'onebit', 'photocopy']);
export function truth(s, role) {
  const meta = baseMeta(s.doc), marks = meta.marks.filter((x) => x.role === role);
  if (s.source === 'variant') return marks.map((x) => ({ ...x, ...mapBox(s.v, s.W, s.H, x) }));
  return SAME_GEOMETRY.has(s.variant) ? marks.map((x) => ({ ...x })) : null;
}
