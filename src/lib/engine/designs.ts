// Page designs Waraq writes for a Portfolio: the cover page, section (divider) pages and paper pages (plain, lined,
// grid, dotted). Eight designs, each in any accent colour, share one look per portfolio. Following common advice for
// academic covers: lots of white space, one typeface (Tajawal), colour as an accent. Layout only — text is written by
// pageWriter (real text, Arabic joined), logos are drawn by assemble. Units: points, y from the top.
import { wrap, type Line, type TextPage } from './textpage.ts';

/** Width of `text` in points at `size`, in the regular or bold face (the engine gives it; without it long titles only shrink). */
export type Measure = (text: string, size: number, bold: boolean) => number;
const MAX_LINES = 10, SMALLEST = 0.4;
/** A long title on several lines: the biggest size (down to 40 %) at which it fits `line.max` in at most 10 lines and its lines stand within `room` above the title line. The last line
 *  stays on `line.y` and the others stand above it, so what follows the title (rule, names) keeps its place; `up` is the height added. */
function title(line: Line, measure: Measure | undefined, room: number): { lines: Line[]; up: number } {
  if (!measure || !line.max || measure(line.text, line.size, !!line.bold) <= line.max / 0.75) return { lines: [line], up: 0 }; // up to 25 % too wide: it just shrinks (the writer does that)
  let size = line.size, rows = wrap((t) => measure(t, size, !!line.bold), line.text, line.max);
  while ((rows.length > MAX_LINES || (rows.length - 1) * size * 1.25 > room) && size > line.size * SMALLEST) { size *= 0.93; rows = wrap((t) => measure(t, size, !!line.bold), line.text, line.max); }
  const pitch = size * 1.25;
  return { lines: rows.map((text, i) => ({ ...line, text, size, y: line.y - (rows.length - 1 - i) * pitch })), up: (rows.length - 1) * pitch };
}
/** A line of text that may be long (a note, a subtitle, a name): wrapped downward, up to `rows` lines, the type shrinking only as far
 *  as `floor` of its size to make it fit; it never stays one line squeezed to fit. */
function note(line: Line, measure?: Measure, rows = 4, floor = 0.6): Line[] {
  if (!measure || !line.max || measure(line.text, line.size, !!line.bold) <= line.max) return [line];
  let size = line.size, out = wrap((t) => measure(t, size, !!line.bold), line.text, line.max);
  while (out.length > rows && size > line.size * floor) { size *= 0.93; out = wrap((t) => measure(t, size, !!line.bold), line.text, line.max); }
  return out.map((text, i) => ({ ...line, text, size, y: line.y + i * size * 1.4 }));
}
/** The same, growing upward: the last line stays on `line.y` (a line at the foot of the page). */
function noteUp(line: Line, measure?: Measure, rows = 3, floor = 0.7): Line[] {
  const r = note(line, measure, rows, floor), up = r.length ? r[r.length - 1].y - r[0].y : 0;
  return r.map((l) => ({ ...l, y: l.y - up }));
}
/** The names of a cover, one under the other: each wraps (up to 2 lines) and what follows moves down; when they would reach the line at
 *  the foot (`limit`), the type of all of them gets smaller step by step (never below 60 %), still wrapped, never squeezed on one line. */
function names(list: string[], at: Omit<Line, 'text'>, measure: Measure | undefined, limit: number, k: number): Line[] {
  const all = list.map((n) => n.trim()).filter(Boolean);
  let out: Line[] = [];
  for (const scale of [1, 0.85, 0.72, 0.6]) {
    let y = at.y; out = [];
    for (const text of all) { const r = note({ ...at, text, y, size: at.size * scale }, measure, 2, 0.75); out.push(...r); y += 28 * k * scale + height(r); }
    if (y - 28 * k * scale + at.size * scale * 0.3 < limit - 6 * k) break;
  }
  return out;
}
const height = (rows: Line[]) => (rows.length > 1 ? rows[rows.length - 1].y - rows[0].y : 0); // how far the rows reach below the first

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
  supervisor?: string; supervisorLabel: string; logos?: Logos; photo?: { doc: number; place: 'top' | 'full' }; measure?: Measure }): TextPage {
  if (o.photo) return photoCover({ ...o, photo: o.photo });
  const accent = rgb(o.color ?? COLOURS[0]), L = look(o.design, o.w, o.h, o.rtl, accent, true), k = L.k;
  const images = logoRow(o.logos, L.logoArea ?? [0, o.w], L.logoY, 64 * k, L.logoInset), rules = [...L.rules];
  if (L.strip && images.length) rules.push([0, 0, o.w, L.strip, ...WHITE]); // logos sit on white above a band
  const t = title({ text: o.title, x: L.x, y: L.titleY, size: (o.design === 'editorial' ? 46 : 38) * k, bold: true, color: L.title, align: L.align, max: L.max }, o.measure, L.titleY - 160 * k), lines: Line[] = t.lines;
  if (o.design === 'editorial') rules[0][1] -= t.up; // the bar above the title moves up with it
  const sub = o.subtitle ? note({ text: o.subtitle, x: L.x, y: L.titleY + 34 * k, size: 16 * k, color: L.soft, align: L.align, max: L.max }, o.measure, 3, 0.75) : [], subDown = height(sub);
  lines.push(...sub);
  if (L.rule) rules.push(accentRule(L, L.titleY + (o.subtitle ? 50 : 22) * k + subDown, accent));
  // names: under the title, below a band, or low on the page (minimal, editorial); a long name wraps, and what follows moves down
  const inColumn = o.design === 'split';
  const sup = o.supervisor?.trim() ? noteUp({ text: `${o.supervisorLabel} ${o.supervisor.trim()}`, x: L.x, y: L.supY, size: 14 * k, color: inColumn ? L.soft : MUTED, align: L.align, max: L.max }, o.measure, 3, 0.75) : [];
  lines.push(...names(o.names, { x: L.x, y: L.namesY ?? (L.below ? L.below + 90 * k : L.titleY + (o.subtitle ? 110 : 84) * k + subDown), size: 18 * k, color: inColumn ? WHITE : INK, align: L.align, max: L.max }, o.measure, sup.length ? sup[0].y - sup[0].size : Infinity, k));
  lines.push(...sup);
  return { w: o.w, h: o.h, lines, rules, polys: L.polys, images };
}

/** A section page: label ("Section 3"), title, optional note; optional logos and the portfolio's title and name. */
export function dividerPage(o: { w: number; h: number; label: string; title: string; note?: string; design?: Design; color?: string; rtl?: boolean;
  logos?: Logos; header?: Header; measure?: Measure }): TextPage {
  const d = o.design ?? 'classic', accent = rgb(o.color ?? COLOURS[0]), L = look(d, o.w, o.h, !!o.rtl, accent, false), k = L.k;
  const images = logoRow(o.logos, L.logoArea ?? [0, o.w], L.logoY - 8 * k, 44 * k, L.logoInset), rules = [...L.rules], lines: Line[] = [];
  let top = (images.length ? L.logoY - 8 * k + 44 * k + 24 * k : L.logoY + 4 * k);
  if (L.strip && images.length) rules.push([0, 0, o.w, top - 8 * k, ...WHITE]);
  const onColour = d === 'band' || d === 'split';
  if (o.header && (o.header.title.trim() || o.header.name.trim())) {
    const hc = d === 'band' ? L.soft : MUTED, ht = d === 'band' ? L.title : INK, hx = d === 'split' ? (o.rtl ? 56 * k : o.w - 56 * k) : L.x;
    const ha: Line['align'] = d === 'split' ? (o.rtl ? 'left' : 'right') : L.align;
    if (o.header.size === 'big') {
      if (o.header.title.trim()) { const r = note({ text: o.header.title.trim(), x: hx, y: top + 18 * k, size: 20 * k, bold: true, color: ht, align: ha, max: L.max }, o.measure, 2, 0.75); lines.push(...r); top += 28 * k + height(r); }
      if (o.header.name.trim()) lines.push(...note({ text: o.header.name.trim(), x: hx, y: top + 16 * k, size: 15 * k, color: hc, align: ha, max: L.max }, o.measure, 2, 0.75));
    } else lines.push(...note({ text: [o.header.title.trim(), o.header.name.trim()].filter(Boolean).join('  ·  '), x: hx, y: top + 12 * k, size: 11 * k, color: hc, align: ha, max: L.max }, o.measure, 2, 0.8));
  }
  const y = L.titleY, t = title({ text: o.title, x: L.x, y, size: 34 * k, bold: true, color: L.title, align: L.align, max: L.max }, o.measure, y - 200 * k);
  if (d === 'editorial') rules[0][1] -= t.up;
  lines.push({ text: o.label, x: L.x, y: y - t.up - 48 * k * (t.lines[0].size / (34 * k)), size: 14 * k, color: onColour ? L.soft : MUTED, align: L.align, max: L.max });
  lines.push(...t.lines);
  if (o.note) lines.push(...note({ text: o.note, x: L.x, y: d === 'band' ? L.below + 64 * k : y + 64 * k, size: 14 * k, color: d === 'split' ? L.soft : MUTED, align: L.align, max: L.max }, o.measure));
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

/** A cover with a photo: across the top half (text on white below), or over the whole page under a see-through veil
 *  of the accent colour (white text). Logos go where they stay on a calm background. */
function photoCover(o: Parameters<typeof coverPage>[0] & { photo: { doc: number; place: 'top' | 'full' } }): TextPage {
  const accent = rgb(o.color ?? COLOURS[0]), k = Math.min(o.w, o.h) / 595, full = o.photo.place === 'full', x = o.w / 2, max = o.w - 128 * k;
  const top = o.h * 0.48, lines: Line[] = [], rules: number[][] = [];
  const titleY = full ? o.h * 0.44 : top + 96 * k, text = full ? WHITE : INK, soft = full ? tint(accent, 0.85) : MUTED;
  const t = title({ text: o.title, x, y: titleY, size: 38 * k, bold: true, color: text, align: 'center', max }, o.measure, titleY - 160 * k);
  lines.push(...t.lines);
  const sub = o.subtitle ? note({ text: o.subtitle, x, y: titleY + 34 * k, size: 16 * k, color: soft, align: 'center', max }, o.measure, 3, 0.75) : [], subDown = height(sub);
  lines.push(...sub);
  rules.push([x - 32 * k, titleY + (o.subtitle ? 50 : 22) * k + subDown, 64 * k, 3 * k, ...(full ? WHITE : accent)]);
  if (!full) rules.push([0, top, o.w, 8 * k, ...accent]);
  const sup = o.supervisor?.trim() ? noteUp({ text: `${o.supervisorLabel} ${o.supervisor.trim()}`, x, y: o.h - 64 * k, size: 14 * k, color: soft, align: 'center', max }, o.measure, 3, 0.75) : [];
  lines.push(...names(o.names, { x, y: titleY + (o.subtitle ? 110 : 84) * k + subDown, size: 18 * k, color: text, align: 'center', max }, o.measure, sup.length ? sup[0].y - sup[0].size : Infinity, k));
  lines.push(...sup);
  // logos: on the white part (top cover: just above the supervisor line), or on the veil at the top (full cover)
  const images = logoRow(o.logos, [0, o.w], full ? 44 * k : o.h - 150 * k, (full ? 64 : 52) * k, 48 * k);
  return { w: o.w, h: o.h, lines, rules, images, background: { doc: o.photo.doc, x: 0, y: 0, w: o.w, h: full ? o.h : top },
    veil: full ? { x: 0, y: 0, w: o.w, h: o.h, color: accent, alpha: 0.62 } : undefined };
}
