// A replaced line of text keeps its own font when it can: the thin layer between the page editor and the font service
// (fontstore.ts). It finds the font of the line being replaced, says which face the new text will get (for the options
// panel) and writes the text run by run with HarfBuzz through `writer`.
import type * as MuPDF from '../../../engine/mupdf-wasm/dist/mupdf.js';
import { BUNDLED, BUNDLED_FILES, createFace, fontName as cleanName, getFace, scriptOf, shapeRun, writer, type Face, type Harfbuzz, type Store } from './fontstore.ts';
import { runs } from './bidi.ts';

export { BUNDLED, BUNDLED_FILES, type Harfbuzz };
export type Shaper = Face;
export type Glyph = { gid: number; x: number; y: number; uni: number[]; rtl: boolean };

/** A face from a font program (tests and corpus tools). */
export function shaper(hb: Harfbuzz, name: string, bytes: Uint8Array, bold = false): Shaper {
  const f = createFace(hb, name, bytes, { bold, source: 'pdf' });
  if (!f) throw new Error('font not readable: ' + name);
  return f;
}

/** `text` laid out left to right in `s` at `size`: glyphs with their position, the letters each one stands for, the
 *  width, and the letters the face cannot draw (not in its cmap, or glyph 0). */
export function shape(hb: Harfbuzz, s: Shaper, text: string, size: number) {
  const cs = [...text].map((c) => c.codePointAt(0)!), glyphs: Glyph[] = [], missing = new Set<string>();
  let x = 0;
  for (const run of runs(cs)) {
    for (const c of run.cs) if (c > 0x20 && !s.has(c)) missing.add(String.fromCodePoint(c));
    const r = shapeRun(hb, s, run, size);
    for (const g of r.glyphs) { if (!g.gid && !g.uni.every((c) => c <= 0x20)) for (const c of g.uni) missing.add(String.fromCodePoint(c)); glyphs.push({ gid: g.gid, x: x + g.x, y: g.y, uni: g.uni, rtl: g.rtl }); }
    x += r.width;
  }
  return { glyphs, width: x, missing: [...missing].sort((a, b) => text.indexOf(a) - text.indexOf(b)) };
}

/** Writes shaped lines into `out` (tests and corpus tools): `draw(face, line, pageHeight)`, `fonts`, `finish()`. */
export function shapedWriter(m: typeof MuPDF, hb: Harfbuzz, out: MuPDF.PDFDocument, store?: Store) {
  const w = writer(m, store ?? { hb, file: (f) => { throw new Error('no bundled font here: ' + f); } }, out);
  return {
    fonts: w.fonts,
    draw(s: Shaper, l: { text: string; x: number; y: number; size: number; color: number[]; align: 'left' | 'center' | 'right'; fake?: boolean }, h: number) {
      return w.draw({ ...l, bold: l.fake || s.bold, hint: { name: s.name, bytes: s.bytes, bold: s.bold, italic: s.italic } }, h);
    },
    finish: () => w.finish(),
  };
}

/** The font of the first letter inside `box` on `page` (the line being replaced), before it is taken away: the first
 *  Arabic letter's when there is one, else the first letter's. */
export function fontAt(page: MuPDF.Page, box: { x: number; y: number; w: number; h: number }): MuPDF.Font | null {
  let first: MuPDF.Font | null = null, arabic: MuPDF.Font | null = null;
  const st = page.toStructuredText('preserve-whitespace');
  st.walk({
    onChar(c, origin, font) {
      if (arabic || !c.trim() || origin[0] < box.x - 1 || origin[0] > box.x + box.w + 1 || origin[1] < box.y - 1 || origin[1] > box.y + box.h + 1) return;
      first ??= font;
      if (/[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-ﻼ]/.test(c)) arabic = font;
    },
  });
  st.destroy();
  return arabic ?? first;
}

/** A font's name as people know it: no subset tag, no style suffix; a Type 3 font is just that. */
export const fontName = (font: MuPDF.Font) => { const n = font.getName(); return /^Type3/i.test(n) ? 'Type 3' : cleanName(n); };

/** The face the Arabic of `text` gets for a line whose own font is `own` (what the panel says): `using` is null when
 *  the own font is kept, else the bundled or system face's name; `missing` the letters the own font lacked; `reason`
 *  why it was not kept ('unusable': no shaping rules, no cmap, Type 3, or HarfBuzz cannot read it). */
export function pick(hb: Harfbuzz, own: MuPDF.Font | null, text: string, bold: boolean, file: (name: string) => Uint8Array, store?: Partial<Store>) {
  const s: Store = { hb, file, ...store };
  const name = own ? fontName(own) : '', bytes = own?.getBuffer()?.asUint8Array().slice();
  const cs = [...text].map((c) => c.codePointAt(0)!), rs = runs(cs), main = rs.find((r) => scriptOf(r.cs) === 'arab') ?? rs[0];
  if (!main) return { shaper: null as Face | null, font: name, using: null as string | null, missing: [] as string[], reason: 'own' as const, source: 'pdf' as Face['source'] };
  const isBold = bold || !!own?.isBold() || /bold|black|heavy/i.test(own?.getName() ?? '');
  const { face, missing, reason } = getFace(s, { name, bytes, bold: isBold, italic: !!own?.isItalic() }, scriptOf(main.cs), main.cs);
  return { shaper: face, font: name, using: face.source === 'pdf' ? null : face.name, missing, reason, source: face.source };
}

/** How wide `text` comes out for a replaced line (points): the panel warns when it must be squeezed into its box. */
export function lineWidth(m: typeof MuPDF, store: Store, own: MuPDF.Font | null, text: string, size: number, bold: boolean) {
  const w = writer(m, store, new m.PDFDocument());
  return w.measure({ text, x: 0, y: 0, size, color: [0, 0, 0], align: 'left', bold, hint: own ? { name: own.getName(), bytes: own.getBuffer()?.asUint8Array().slice() ?? null, bold: own.isBold(), italic: own.isItalic() } : {} });
}
