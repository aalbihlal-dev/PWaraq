// Pages Waraq writes itself (Portfolio section dividers and table of contents) as real, selectable text in Tajawal.
// Arabic is joined with the font's own letter shapes (Unicode presentation forms) and laid out right to left;
// each glyph carries its original letters, so copying and searching give normal Arabic.
// shortcut: no HarfBuzz here yet (a replaced line in the page editor uses it, ownfont.ts) — no harakat or Persian letters on these pages.
import type * as MuPDF from '../../../engine/mupdf-wasm/dist/mupdf.js';

export type Fonts = { regular: MuPDF.Font; bold: MuPDF.Font };
export type Line = { text: string; x: number; y: number; size: number; bold?: boolean; color?: number[]; align?: 'left' | 'right' | 'center'; max?: number };
export type TextPage = { w: number; h: number; lines: Line[]; rules?: number[][]; links?: { rect: number[]; to: number }[] };

// letter -> [first presentation form, number of forms (1 none, 2 isolated/final, 4 also initial/medial)]
const AR = new Map<number, [number, number]>();
{
  let fe = 0xfe80;
  const counts = '12222424244444222244444444' + '4444444224'; // U+0621…U+063A, then U+0641…U+064A
  const letters = [...Array(26)].map((_, i) => 0x621 + i).concat([...Array(10)].map((_, i) => 0x641 + i));
  letters.forEach((c, i) => { const n = +counts[i]; AR.set(c, [fe, n]); fe += n; });
}
const LAM_ALEF: Record<number, number> = { 0x622: 0xfef5, 0x623: 0xfef7, 0x625: 0xfef9, 0x627: 0xfefb };
const isMark = (c: number) => (c >= 0x64b && c <= 0x65f) || c === 0x670;
const isArabic = (c: number) => (c >= 0x600 && c <= 0x6ff) || (c >= 0xfb50 && c <= 0xfeff);
const isLtr = (c: number) => /[A-Za-z0-9À-ɏ٠-٩]/.test(String.fromCodePoint(c));
const joinsNext = (c?: number) => c === 0x640 || (c !== undefined && AR.get(c)?.[1] === 4);
const MIRROR: Record<string, string> = { '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '<': '>', '>': '<', '«': '»', '»': '«' };

type Glyph = { code: number; uni: number[] };
// Arabic letters in reading order -> joined shapes in reading order
function join(cs: number[]): Glyph[] {
  const s = cs.filter((c) => !isMark(c)), out: Glyph[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i], next = s[i + 1], f = AR.get(c), linked = joinsNext(s[i - 1]) && !!f && f[1] > 1;
    if (c === 0x644 && next !== undefined && LAM_ALEF[next]) { out.push({ code: LAM_ALEF[next] + (joinsNext(s[i - 1]) ? 1 : 0), uni: [c, next] }); i++; continue; }
    if (!f || f[1] === 1) { out.push({ code: c, uni: [c] }); continue; }
    const forward = f[1] === 4 && next !== undefined && (next === 0x640 || (AR.get(next)?.[1] ?? 0) > 1);
    const form = linked && forward ? 3 : linked ? 1 : forward ? 2 : 0;
    out.push({ code: form ? f[0] + form : c, uni: [c] }); // isolated = the plain letter (the font maps it)
  }
  return out;
}

/** Text in reading order -> its direction runs (right-to-left ones still in reading order), left to right as they appear on the page. */
export function runs(text: string): { rtl: boolean; cs: number[] }[] {
  const cs = [...text].map((ch) => ch.codePointAt(0)!);
  const firstStrong = cs.find((c) => isArabic(c) || isLtr(c));
  const rtl = firstStrong !== undefined && isArabic(firstStrong);
  // runs: in a right-to-left line, left-to-right words (Latin, numbers) keep their order; elsewhere the reverse
  const strong = rtl ? isLtr : (c: number) => isArabic(c) && !isMark(c);
  const runs: { rtl: boolean; cs: number[] }[] = [];
  for (let i = 0; i < cs.length;) {
    if (strong(cs[i])) {
      let j = i + 1, end = i + 1;
      for (; j < cs.length && !(rtl ? isArabic(cs[j]) : isLtr(cs[j])); j++) if (strong(cs[j]) || isMark(cs[j])) end = j + 1;
      runs.push({ rtl: !rtl, cs: cs.slice(i, end) }); i = end;
    } else {
      let j = i + 1;
      while (j < cs.length && !strong(cs[j])) j++;
      runs.push({ rtl, cs: cs.slice(i, j) }); i = j;
    }
  }
  return rtl ? runs.reverse() : runs;
}

/** Text in reading order -> glyphs left to right, as they appear on the page. */
export function visual(text: string): Glyph[] {
  return runs(text).flatMap((r) => {
    const g = join(r.cs); // letters other than Arabic pass through unchanged
    if (!r.rtl) return g;
    return g.reverse().map((x) => (MIRROR[String.fromCodePoint(x.code)] ? { code: MIRROR[String.fromCodePoint(x.code)].codePointAt(0)!, uni: x.uni } : x));
  });
}

export function measure(font: MuPDF.Font, text: string, size: number) {
  return visual(text).reduce((w, g) => w + font.advanceGlyph(font.encodeCharacter(g.code)) * size, 0);
}

/** Lines of `text` (its own line breaks kept) that fit `width` (as `measure` measures them), broken between words. */
export function wrap(measure: (text: string) => number, text: string, width: number) {
  return text.split('\n').flatMap((para) => {
    const out: string[] = [];
    let line = '';
    for (const word of para.split(' ')) {
      const next = line ? line + ' ' + word : word;
      if (line && measure(next) > width) { out.push(line); line = word; } else line = next;
    }
    return [...out, line];
  });
}

/** Writes pages straight into `out`: each glyph is shown by its glyph id (the font goes in once, CID = glyph id), and
 *  `finish` gives each font a map from glyph back to the letters it was drawn for, so text copies as written.
 *  `draw` gives only the drawing commands (for text added onto an existing page, with `fonts` as its font resources). */
export function pageWriter(m: typeof MuPDF, out: MuPDF.PDFDocument, fonts: Fonts) {
  const faces = [fonts.regular, fonts.bold].map((font) => ({ font, ref: out.addFont(font), used: new Map<number, number[]>() }));
  const n = (v: number) => +v.toFixed(2);
  const resources = { WqT0: faces[0].ref, WqT1: faces[1].ref };
  return {
    fonts: resources,
    add(p: TextPage): MuPDF.PDFObject { return out.addPage([0, 0, p.w, p.h], 0, { Font: resources }, this.draw(p)); },
    draw(p: TextPage) {
      let ops = '';
      for (const r of p.rules ?? []) ops += `${r.slice(4, 7).map(n).join(' ')} rg ${n(r[0])} ${n(p.h - r[1] - r[3])} ${n(r[2])} ${n(r[3])} re f
`;
      for (const l of p.lines) {
        const face = faces[l.bold ? 1 : 0], font = face.font;
        let size = l.size, width = measure(font, l.text, size);
        if (l.max && width > l.max) { size *= l.max / width; width = l.max; } // a long title shrinks to fit
        const x = l.align === 'right' ? l.x - width : l.align === 'center' ? l.x - width / 2 : l.x;
        const gids = visual(l.text).map((g) => {
          const gid = font.encodeCharacter(g.code);
          face.used.set(gid, g.uni.length > 1 ? [...g.uni].reverse() : g.uni); // a joined pair is read back right to left
          return gid.toString(16).padStart(4, '0');
        });
        ops += `BT /WqT${l.bold ? 1 : 0} ${n(size)} Tf ${(l.color ?? INK).map(n).join(' ')} rg 1 0 0 1 ${n(x)} ${n(p.h - l.y)} Tm <${gids.join('')}> Tj ET
`;
      }
      return ops;
    },
    finish() { for (const f of faces) f.ref.put('ToUnicode', out.addStream(toUnicode(f.used), {})); },
  };
}

/** A ToUnicode map for a font shown by glyph id: each glyph id back to the letters it was drawn for. */
export function toUnicode(map: Map<number, number[]>) {
  const hex = (n: number) => n.toString(16).padStart(4, '0');
  const utf16 = (cs: number[]) => String.fromCodePoint(...cs).split('').map((c) => hex(c.charCodeAt(0))).join('');
  const rows = [...map].map(([gid, uni]) => `<${hex(gid)}> <${utf16(uni)}>`), blocks: string[] = [];
  for (let i = 0; i < rows.length; i += 100) blocks.push(`${rows.slice(i, i + 100).length} beginbfchar ${rows.slice(i, i + 100).join(' ')} endbfchar`);
  return `/CIDInit /ProcSet findresource begin 12 dict begin begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def /CMapName /Waraq-UCS def /CMapType 2 def
1 begincodespacerange <0000> <FFFF> endcodespacerange
${blocks.join('\n')}
endcmap CMapName currentdict /CMap defineresource pop end end`;
}

// Waraq colours (as 0..1 RGB)
const INK = [0.137, 0.235, 0.212], GREEN = [0.082, 0.467, 0.365], MUTED = [0.373, 0.451, 0.412], LINE = [0.878, 0.906, 0.871];

/** A section divider: label ("Section 3"), the section title large, a short green rule, an optional note. */
export function dividerPage(o: { w: number; h: number; label: string; title: string; note?: string }): TextPage {
  const k = Math.min(o.w, o.h) / 595, cx = o.w / 2, y = o.h * 0.42, max = o.w - 2 * 64 * k;
  const lines: Line[] = [
    { text: o.label, x: cx, y: y - 48 * k, size: 14 * k, color: MUTED, align: 'center', max },
    { text: o.title, x: cx, y, size: 34 * k, bold: true, color: INK, align: 'center', max },
  ];
  if (o.note) lines.push({ text: o.note, x: cx, y: y + 64 * k, size: 14 * k, color: MUTED, align: 'center', max });
  return { w: o.w, h: o.h, lines, rules: [[cx - 32 * k, y + 22 * k, 64 * k, 3 * k, ...GREEN]] };
}

/** How many contents lines fit on one page of this size (the portfolio needs this before it numbers pages). */
export function tocPerPage(w: number, h: number) { const k = Math.min(w, h) / 595; return Math.max(1, Math.floor((h - 150 * k - 64 * k) / (30 * k))); }

/** Table of contents pages: each entry its title, a dotted leader and its page number, the whole row a link. */
export function tocPages(o: { w: number; h: number; heading: string; rtl: boolean; entries: { title: string; number: number; to: number }[] }, regular: MuPDF.Font): TextPage[] {
  const k = Math.min(o.w, o.h) / 595, m = 64 * k, per = tocPerPage(o.w, o.h), pages: TextPage[] = [];
  for (let start = 0; start < Math.max(1, o.entries.length); start += per) {
    const lines: Line[] = [{ text: o.heading, x: o.rtl ? o.w - m : m, y: 100 * k, size: 28 * k, bold: true, color: INK, align: o.rtl ? 'right' : 'left' }];
    const rules = [[m, 120 * k, o.w - 2 * m, 1 * k, ...LINE]], links: TextPage['links'] = [];
    o.entries.slice(start, start + per).forEach((e, i) => {
      const y = 150 * k + 30 * k * (i + 1) - 10 * k, size = 13 * k, num = String(e.number), nw = measure(regular, num, size) + 12 * k;
      const room = o.w - 2 * m - nw - 24 * k, title = fit(regular, e.title, size, room), tw = measure(regular, title, size);
      const dots = Math.max(0, Math.floor((o.w - 2 * m - nw - tw - 16 * k) / measure(regular, '. ', size)));
      lines.push({ text: title, x: o.rtl ? o.w - m : m, y, size, color: INK, align: o.rtl ? 'right' : 'left' });
      lines.push({ text: '. '.repeat(dots).trim(), x: o.rtl ? m + nw : o.w - m - nw, y, size, color: LINE.map((c) => c * 0.8), align: o.rtl ? 'left' : 'right', max: o.w - 2 * m - nw - tw - 16 * k });
      lines.push({ text: num, x: o.rtl ? m : o.w - m, y, size, color: GREEN, align: o.rtl ? 'left' : 'right' });
      links.push({ rect: [m, y - 20 * k, o.w - m, y + 8 * k], to: e.to });
    });
    pages.push({ w: o.w, h: o.h, lines, rules, links });
  }
  return pages;
}

// shorten a title with … until it fits
function fit(font: MuPDF.Font, text: string, size: number, room: number) {
  if (measure(font, text, size) <= room) return text;
  let t = [...text];
  while (t.length > 1 && measure(font, t.join('') + '…', size) > room) t.pop();
  return t.join('').trimEnd() + '…';
}
