// Page designs Waraq writes for a Portfolio: the cover page, section (divider) pages and paper pages (plain, lined,
// grid, dotted). Four designs share one look per portfolio. Layout only — text is written by pageWriter (real text,
// Arabic joined), logos are drawn by assemble from the portfolio's image files. Units: points, y from the top.
import type { Line, TextPage } from './textpage.ts';

export type Design = 'classic' | 'band' | 'frame' | 'side';
export type Paper = 'plain' | 'lined' | 'grid' | 'dotted';
export type Logos = { left?: number; center?: number; right?: number }; // engine source ids of the logo images
export type Header = { title: string; name: string; size: 'small' | 'big' };
export const DESIGNS: Design[] = ['classic', 'band', 'frame', 'side'];
export const PAPERS: Paper[] = ['plain', 'lined', 'grid', 'dotted'];

const INK = [0.137, 0.235, 0.212], GREEN = [0.082, 0.467, 0.365], MUTED = [0.337, 0.412, 0.373], LINE = [0.878, 0.906, 0.871];
const MINT = [0.918, 0.953, 0.922], WHITE = [1, 1, 1];

type Frame = { k: number; band: number; text: number[]; soft: number[]; rules: number[][] };
// the design's frame: background shapes, and the colours text takes on top of them
function frame(d: Design, w: number, h: number, rtl: boolean, bandShare: number): Frame {
  const k = Math.min(w, h) / 595, rules: number[][] = [];
  if (d === 'band') { rules.push([0, 0, w, h * bandShare, ...GREEN], [0, h * bandShare, w, 6 * k, ...MINT]); return { k, band: h * bandShare, text: WHITE, soft: MINT, rules }; }
  if (d === 'frame') {
    const m = 28 * k, t = 2 * k, n = 34 * k, s = 0.75 * k;
    rules.push([m, m, w - 2 * m, t, ...GREEN], [m, h - m - t, w - 2 * m, t, ...GREEN], [m, m, t, h - 2 * m, ...GREEN], [w - m - t, m, t, h - 2 * m, ...GREEN]);
    rules.push([n, n, w - 2 * n, s, ...GREEN], [n, h - n - s, w - 2 * n, s, ...GREEN], [n, n, s, h - 2 * n, ...GREEN], [w - n - s, n, s, h - 2 * n, ...GREEN]);
  }
  if (d === 'side') rules.push([rtl ? w - 22 * k : 0, 0, 22 * k, h, ...GREEN], [rtl ? w - 28 * k : 22 * k, 0, 6 * k, h, ...MINT]);
  return { k, band: 0, text: INK, soft: MUTED, rules };
}

// logos in a row across the top: left / centre / right boxes (the image keeps its shape inside its box)
function logoRow(l: Logos | undefined, w: number, y: number, size: number, k: number, inset: number) {
  const out: TextPage['images'] = [], bw = size * 1.9;
  if (l?.left != null) out.push({ doc: l.left, x: inset, y, w: bw, h: size, align: 'left' });
  if (l?.center != null) out.push({ doc: l.center, x: (w - bw) / 2, y, w: bw, h: size, align: 'center' });
  if (l?.right != null) out.push({ doc: l.right, x: w - inset - bw, y, w: bw, h: size, align: 'right' });
  return out;
}

/** The portfolio's cover: logos, title (and subtitle), names, supervisor. */
export function coverPage(o: { w: number; h: number; design: Design; rtl: boolean; title: string; subtitle?: string; names: string[];
  supervisor?: string; supervisorLabel: string; logos?: Logos }): TextPage {
  const d = o.design, f = frame(d, o.w, o.h, o.rtl, 0.46), k = f.k, side = d === 'side';
  const inset = (d === 'frame' ? 56 : side ? 72 : 48) * k, max = o.w - 2 * inset - (side ? 24 * k : 0);
  const x = side ? (o.rtl ? o.w - inset - 12 * k : inset + 12 * k) : o.w / 2, align: Line['align'] = side ? (o.rtl ? 'right' : 'left') : 'center';
  const images = logoRow(o.logos, o.w, (d === 'frame' ? 60 : 44) * k, 64 * k, k, inset);
  const titleY = d === 'band' ? f.band - 72 * k : o.h * 0.4;
  const lines: Line[] = [{ text: o.title, x, y: titleY, size: 38 * k, bold: true, color: d === 'band' ? f.text : INK, align, max }];
  if (o.subtitle) lines.push({ text: o.subtitle, x, y: titleY + 34 * k, size: 16 * k, color: d === 'band' ? f.soft : MUTED, align, max });
  const rules = [...f.rules];
  if (d !== 'band') rules.push([side ? (o.rtl ? x - 64 * k : x) : x - 32 * k, titleY + (o.subtitle ? 50 : 22) * k, 64 * k, 3 * k, ...GREEN]);
  let y = d === 'band' ? f.band + 90 * k : titleY + (o.subtitle ? 110 : 84) * k;
  for (const name of o.names.filter((n) => n.trim())) { lines.push({ text: name.trim(), x, y, size: 18 * k, color: INK, align, max }); y += 28 * k; }
  if (o.supervisor?.trim()) lines.push({ text: `${o.supervisorLabel} ${o.supervisor.trim()}`, x, y: o.h - (d === 'frame' ? 96 : 80) * k, size: 14 * k, color: MUTED, align, max });
  // band design: logos sit on white, so they go below the band's top edge on a white strip
  if (d === 'band' && images.length) rules.push([0, 0, o.w, (44 + 64 + 20) * k, ...WHITE]);
  return { w: o.w, h: o.h, lines, rules, images };
}

/** A section page: label ("Section 3"), title, optional note; optional logos and the portfolio's title and name. */
export function dividerPage(o: { w: number; h: number; label: string; title: string; note?: string; design?: Design; rtl?: boolean;
  logos?: Logos; header?: Header }): TextPage {
  const d = o.design ?? 'classic', rtl = !!o.rtl, f = frame(d, o.w, o.h, rtl, 0.42), k = f.k, side = d === 'side';
  const inset = (d === 'frame' ? 56 : side ? 72 : 48) * k, max = o.w - 2 * inset - (side ? 24 * k : 0);
  const x = side ? (rtl ? o.w - inset - 12 * k : inset + 12 * k) : o.w / 2, align: Line['align'] = side ? (rtl ? 'right' : 'left') : 'center';
  const images = logoRow(o.logos, o.w, (d === 'frame' ? 54 : 36) * k, 44 * k, k, inset);
  let top = (images.length ? (d === 'frame' ? 54 : 36) + 44 + 24 : d === 'frame' ? 64 : 48) * k;
  const lines: Line[] = [], rules = [...f.rules], onBand = d === 'band';
  if (onBand && images.length) rules.push([0, 0, o.w, top - 8 * k, ...WHITE]);
  if (o.header && (o.header.title.trim() || o.header.name.trim())) {
    const big = o.header.size === 'big', c = onBand ? f.soft : MUTED;
    if (big) {
      if (o.header.title.trim()) { lines.push({ text: o.header.title.trim(), x, y: top + 18 * k, size: 20 * k, bold: true, color: onBand ? f.text : INK, align, max }); top += 28 * k; }
      if (o.header.name.trim()) { lines.push({ text: o.header.name.trim(), x, y: top + 16 * k, size: 15 * k, color: c, align, max }); top += 24 * k; }
    } else lines.push({ text: [o.header.title.trim(), o.header.name.trim()].filter(Boolean).join('  ·  '), x, y: top + 12 * k, size: 11 * k, color: c, align, max });
  }
  const y = onBand ? f.band - 60 * k : o.h * 0.44;
  lines.push({ text: o.label, x, y: y - 48 * k, size: 14 * k, color: onBand ? f.soft : MUTED, align, max });
  lines.push({ text: o.title, x, y, size: 34 * k, bold: true, color: onBand ? f.text : INK, align, max });
  if (o.note) lines.push({ text: o.note, x, y: onBand ? f.band + 64 * k : y + 64 * k, size: 14 * k, color: MUTED, align, max });
  if (!onBand) rules.push([side ? (rtl ? x - 64 * k : x) : x - 32 * k, y + 22 * k, 64 * k, 3 * k, ...GREEN]);
  return { w: o.w, h: o.h, lines, rules, images };
}

/** Writing paper: plain, lined (with a margin line), 5 mm grid or 5 mm dots. */
export function paperPage(w: number, h: number, paper: Paper, rtl = false): TextPage {
  const rules: number[][] = [], k = Math.min(w, h) / 595, step = 14.173; // 5 mm
  if (paper === 'lined') {
    for (let y = 96 * k; y < h - 48 * k; y += 24 * k) rules.push([36 * k, y, w - 72 * k, 0.6 * k, ...LINE]);
    rules.push([rtl ? w - 72 * k : 72 * k, 0, 0.8 * k, h, ...GREEN.map((c) => c * 0.4 + 0.6)]);
  }
  if (paper === 'grid') {
    for (let x = step; x < w; x += step) rules.push([x, 0, 0.4, h, ...LINE]);
    for (let y = step; y < h; y += step) rules.push([0, y, w, 0.4, ...LINE]);
  }
  if (paper === 'dotted') for (let x = step; x < w; x += step) for (let y = step; y < h; y += step) rules.push([x - 0.6, y - 0.6, 1.2, 1.2, ...LINE.map((c) => c * 0.85)]);
  return { w, h, lines: [], rules };
}
