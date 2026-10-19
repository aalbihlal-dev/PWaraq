// Page designs Waraq writes for a Portfolio: the cover page, section (divider) pages and paper pages (plain, lined,
// grid, dotted). Eight designs, each in any accent colour, share one look per portfolio. Following common advice for
// academic covers: lots of white space, one typeface (Tajawal), colour as an accent. Layout only — text is written by
// pageWriter (real text, Arabic joined), logos are drawn by assemble. Units: points, y from the top.
import type { Line, TextPage } from './textpage.ts';

export type Design = 'classic' | 'minimal' | 'band' | 'frame' | 'side' | 'split' | 'geometric' | 'editorial';
export type Paper = 'plain' | 'lined' | 'grid' | 'dotted';
export type Logos = { left?: number; center?: number; right?: number }; // engine source ids of the logo images
export type Header = { title: string; name: string; size: 'small' | 'big' };
export const DESIGNS: Design[] = ['classic', 'minimal', 'band', 'frame', 'side', 'split', 'geometric', 'editorial'];
export const PAPERS: Paper[] = ['plain', 'lined', 'grid', 'dotted'];
/** Accent colours offered (any other can be chosen too): Waraq green, navy, charcoal, maroon, teal, gold, plum, black. */
export const COLOURS = ['#15775d', '#1f3a5f', '#3a4248', '#7a2e3a', '#1f6f78', '#a07a3c', '#5b3a6e', '#111111'];

const INK = [0.137, 0.235, 0.212], MUTED = [0.337, 0.412, 0.373], LINE = [0.878, 0.906, 0.871], WHITE = [1, 1, 1];
export const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const tint = (c: number[], t: number) => c.map((v) => v + (1 - v) * t); // towards white

// One design's look on a page of w x h: background shapes and where/how the text goes
type Look = { k: number; rules: number[][]; polys: TextPage['polys']; x: number; align: Line['align']; max: number; titleY: number;
  title: number[]; soft: number[]; below: number; namesY?: number; supY: number; logoY: number; logoInset: number; strip?: number; rule: boolean;
  logoArea?: number[] }; // logoArea: [from, to] across the page where logos may go (on white)
function look(d: Design, w: number, h: number, rtl: boolean, accent: number[], cover: boolean): Look {
  const k = Math.min(w, h) / 595, start = rtl ? 'right' : 'left', sx = (m: number) => (rtl ? w - m : m), rules: number[][] = [];
  const centred = { x: w / 2, align: 'center' as const, max: w - 128 * k };
  const base: Look = { k, rules, polys: [], ...centred, titleY: h * (cover ? 0.4 : 0.44), title: INK, soft: MUTED, below: 0, supY: h - 80 * k, logoY: 44 * k, logoInset: 48 * k, rule: true };
  switch (d) {
    case 'minimal': // monotone: start-aligned title, one hairline in the accent, names low on the page
      rules.push([56 * k, h * 0.3 + 62 * k, w - 112 * k, 1 * k, ...accent]);
      return { ...base, x: sx(56 * k), align: start, max: w - 112 * k, titleY: h * 0.3, namesY: h - 200 * k, supY: h - 72 * k, rule: false };
    case 'band': {
      const b = h * (cover ? 0.46 : 0.42);
      rules.push([0, 0, w, b, ...accent], [0, b, w, 6 * k, ...tint(accent, 0.85)]);
      return { ...base, titleY: b - (cover ? 72 : 60) * k, title: WHITE, soft: tint(accent, 0.8), below: b, strip: (44 + 64 + 20) * k, rule: false };
    }
    case 'frame': {
      const m = 28 * k, t = 2 * k, n = 34 * k, s = 0.75 * k;
      for (const [a, b] of [[m, t], [n, s]]) rules.push([a, a, w - 2 * a, b, ...accent], [a, h - a - b, w - 2 * a, b, ...accent], [a, a, b, h - 2 * a, ...accent], [w - a - b, a, b, h - 2 * a, ...accent]);
      return { ...base, max: w - 160 * k, supY: h - 96 * k, logoY: 60 * k, logoInset: 56 * k };
    }
    case 'side':
      rules.push([rtl ? w - 22 * k : 0, 0, 22 * k, h, ...accent], [rtl ? w - 28 * k : 22 * k, 0, 6 * k, h, ...tint(accent, 0.85)]);
      return { ...base, x: sx(84 * k), align: start, max: w - 168 * k, logoInset: 72 * k };
    case 'split': { // a coloured column on the reading side with the title, white elsewhere
      const cw = w * 0.42;
      rules.push([rtl ? w - cw : 0, 0, cw, h, ...accent]);
      return { ...base, x: sx(36 * k), align: start, max: cw - 64 * k, titleY: h * 0.62, title: WHITE, soft: tint(accent, 0.75), rule: false, logoArea: rtl ? [0, w - cw] : [cw, w] };
    }
    case 'geometric': { // overlapping triangles in two corners, title centred
      // two overlapping triangles in the bottom corner at the end of the line, a small one in the top corner at its start
      const e = rtl ? 0 : w, s0 = rtl ? w : 0, dir = rtl ? 1 : -1;
      base.polys!.push({ pts: [[e, h], [e + dir * 300 * k, h], [e, h - 220 * k]], color: tint(accent, 0.6) }, { pts: [[e, h], [e + dir * 200 * k, h], [e, h - 330 * k]], color: accent });
      base.polys!.push({ pts: [[s0, 0], [s0 - dir * 70 * k, 0], [s0, 70 * k]], color: tint(accent, 0.75) });
      return { ...base, titleY: h * 0.42 };
    }
    case 'editorial': // big start-aligned title low on the page under a short thick bar; thin line above the names
      rules.push([rtl ? w - 56 * k - 72 * k : 56 * k, h * 0.5 - 70 * k, 72 * k, 8 * k, ...accent], [56 * k, h - 190 * k, w - 112 * k, 0.75 * k, ...LINE.map((c) => c * 0.9)]);
      return { ...base, x: sx(56 * k), align: start, max: w - 112 * k, titleY: h * 0.5, namesY: h - 160 * k, supY: h - 64 * k, rule: false };
    default:
      return base; // classic: centred, a short accent rule under the title
  }
}

// logos in a row across the top: left / centre / right boxes (the image keeps its shape inside its box)
function logoRow(l: Logos | undefined, area: number[], y: number, size: number, inset: number) {
  const out: TextPage['images'] = [], [a, b] = area, bw = Math.min(size * 1.9, (b - a - 2 * inset) / 3);
  if (l?.left != null) out.push({ doc: l.left, x: a + inset, y, w: bw, h: size, align: 'left' });
  if (l?.center != null) out.push({ doc: l.center, x: (a + b - bw) / 2, y, w: bw, h: size, align: 'center' });
  if (l?.right != null) out.push({ doc: l.right, x: b - inset - bw, y, w: bw, h: size, align: 'right' });
  return out;
}
const accentRule = (L: Look, y: number, accent: number[]) =>
  [L.align === 'center' ? L.x - 32 * L.k : L.align === 'right' ? L.x - 64 * L.k : L.x, y, 64 * L.k, 3 * L.k, ...accent];

/** The portfolio's cover: logos, title (and subtitle), names, supervisor. */
export function coverPage(o: { w: number; h: number; design: Design; color?: string; rtl: boolean; title: string; subtitle?: string; names: string[];
  supervisor?: string; supervisorLabel: string; logos?: Logos }): TextPage {
  const accent = rgb(o.color ?? COLOURS[0]), L = look(o.design, o.w, o.h, o.rtl, accent, true), k = L.k;
  const images = logoRow(o.logos, L.logoArea ?? [0, o.w], L.logoY, 64 * k, L.logoInset), rules = [...L.rules];
  if (L.strip && images.length) rules.push([0, 0, o.w, L.strip, ...WHITE]); // logos sit on white above a band
  const lines: Line[] = [{ text: o.title, x: L.x, y: L.titleY, size: (o.design === 'editorial' ? 46 : 38) * k, bold: true, color: L.title, align: L.align, max: L.max }];
  if (o.subtitle) lines.push({ text: o.subtitle, x: L.x, y: L.titleY + 34 * k, size: 16 * k, color: L.soft, align: L.align, max: L.max });
  if (L.rule) rules.push(accentRule(L, L.titleY + (o.subtitle ? 50 : 22) * k, accent));
  // names: under the title, below a band, or low on the page (minimal, editorial)
  const inColumn = o.design === 'split';
  let y = L.namesY ?? (L.below ? L.below + 90 * k : L.titleY + (o.subtitle ? 110 : 84) * k);
  for (const name of o.names.filter((n) => n.trim())) { lines.push({ text: name.trim(), x: L.x, y, size: 18 * k, color: inColumn ? WHITE : INK, align: L.align, max: L.max }); y += 28 * k; }
  if (o.supervisor?.trim()) lines.push({ text: `${o.supervisorLabel} ${o.supervisor.trim()}`, x: L.x, y: L.supY, size: 14 * k, color: inColumn ? L.soft : MUTED, align: L.align, max: L.max });
  return { w: o.w, h: o.h, lines, rules, polys: L.polys, images };
}

/** A section page: label ("Section 3"), title, optional note; optional logos and the portfolio's title and name. */
export function dividerPage(o: { w: number; h: number; label: string; title: string; note?: string; design?: Design; color?: string; rtl?: boolean;
  logos?: Logos; header?: Header }): TextPage {
  const d = o.design ?? 'classic', accent = rgb(o.color ?? COLOURS[0]), L = look(d, o.w, o.h, !!o.rtl, accent, false), k = L.k;
  const images = logoRow(o.logos, L.logoArea ?? [0, o.w], L.logoY - 8 * k, 44 * k, L.logoInset), rules = [...L.rules], lines: Line[] = [];
  let top = (images.length ? L.logoY - 8 * k + 44 * k + 24 * k : L.logoY + 4 * k);
  if (L.strip && images.length) rules.push([0, 0, o.w, top - 8 * k, ...WHITE]);
  const onColour = d === 'band' || d === 'split';
  if (o.header && (o.header.title.trim() || o.header.name.trim())) {
    const hc = d === 'band' ? L.soft : MUTED, ht = d === 'band' ? L.title : INK, hx = d === 'split' ? (o.rtl ? 56 * k : o.w - 56 * k) : L.x;
    const ha: Line['align'] = d === 'split' ? (o.rtl ? 'left' : 'right') : L.align;
    if (o.header.size === 'big') {
      if (o.header.title.trim()) { lines.push({ text: o.header.title.trim(), x: hx, y: top + 18 * k, size: 20 * k, bold: true, color: ht, align: ha, max: L.max }); top += 28 * k; }
      if (o.header.name.trim()) lines.push({ text: o.header.name.trim(), x: hx, y: top + 16 * k, size: 15 * k, color: hc, align: ha, max: L.max });
    } else lines.push({ text: [o.header.title.trim(), o.header.name.trim()].filter(Boolean).join('  ·  '), x: hx, y: top + 12 * k, size: 11 * k, color: hc, align: ha, max: L.max });
  }
  const y = L.titleY;
  lines.push({ text: o.label, x: L.x, y: y - 48 * k, size: 14 * k, color: onColour ? L.soft : MUTED, align: L.align, max: L.max });
  lines.push({ text: o.title, x: L.x, y, size: 34 * k, bold: true, color: L.title, align: L.align, max: L.max });
  if (o.note) lines.push({ text: o.note, x: L.x, y: d === 'band' ? L.below + 64 * k : y + 64 * k, size: 14 * k, color: d === 'split' ? L.soft : MUTED, align: L.align, max: L.max });
  if (L.rule) rules.push(accentRule(L, y + 22 * k, accent));
  return { w: o.w, h: o.h, lines, rules, polys: L.polys, images };
}

/** Writing paper: plain, lined (with a margin line), 5 mm grid or 5 mm dots. */
export function paperPage(w: number, h: number, paper: Paper, rtl = false): TextPage {
  const rules: number[][] = [], k = Math.min(w, h) / 595, step = 14.173; // 5 mm
  if (paper === 'lined') {
    for (let y = 96 * k; y < h - 48 * k; y += 24 * k) rules.push([36 * k, y, w - 72 * k, 0.6 * k, ...LINE]);
    rules.push([rtl ? w - 72 * k : 72 * k, 0, 0.8 * k, h, ...tint([0.082, 0.467, 0.365], 0.6)]);
  }
  if (paper === 'grid') {
    for (let x = step; x < w; x += step) rules.push([x, 0, 0.4, h, ...LINE]);
    for (let y = step; y < h; y += step) rules.push([0, y, w, 0.4, ...LINE]);
  }
  if (paper === 'dotted') for (let x = step; x < w; x += step) for (let y = step; y < h; y += step) rules.push([x - 0.6, y - 0.6, 1.2, 1.2, ...LINE.map((c) => c * 0.85)]);
  return { w, h, lines: [], rules };
}
