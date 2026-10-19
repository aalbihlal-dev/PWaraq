// A replaced line of text keeps its own font: the font file embedded in the PDF (MuPDF hands out its bytes) is
// shaped with HarfBuzz, so Arabic joins and harakat sit right whatever the font's encoding in the PDF. Embedded fonts
// are usually subsets: when a letter of the new text is not in the PDF's copy, the line is written in the full font
// when Waraq bundles it, else in the closest bundled one — and the editor says which letters were missing.
import type * as MuPDF from '../../../engine/mupdf-wasm/dist/mupdf.js';
import type * as HB from 'harfbuzzjs';
import { runs, toUnicode } from './textpage.ts';

const hex16 = (cs: number[]) => [...String.fromCodePoint(...cs)].flatMap((c) => c.split('')).map((c) => c.charCodeAt(0).toString(16).padStart(4, '0')).join('');

export type Harfbuzz = typeof HB;
export type Shaper = { name: string; bytes: Uint8Array; font: HB.Font; upem: number; bold: boolean };
export type Glyph = { gid: number; x: number; y: number; uni: number[]; rtl: boolean };

/** Fonts Waraq bundles (public/fonts, SIL Open Font Licence): name, regular file, bold file. */
export const BUNDLED = {
  naskh: ['Noto Naskh Arabic', 'NotoNaskhArabic-Regular.ttf', 'NotoNaskhArabic-Bold.ttf'],
  sans: ['Noto Sans Arabic', 'NotoSansArabic-Regular.ttf', 'NotoSansArabic-Bold.ttf'],
  tajawal: ['Tajawal', 'Tajawal-Regular.ttf', 'Tajawal-Bold.ttf'],
} as const;
export const BUNDLED_FILES = Object.values(BUNDLED).flatMap((b) => [b[1], b[2]]);
type Family = keyof typeof BUNDLED;
// Windows / Office fonts and the bundled family closest to each (naskh = serif-like, sans = Arial-like)
const NASKH = /naskh|times|traditional|simplified|typesetting|majalla|amiri|lotus|badr|mitra|scheherazade|serif/i;

export function shaper(hb: Harfbuzz, name: string, bytes: Uint8Array, bold = false): Shaper {
  const face = new hb.Face(new hb.Blob(bytes));
  return { name, bytes, font: new hb.Font(face), upem: face.upem, bold };
}

/** The line laid out left to right in `s` at `size`: glyphs with their position (points from the line's start,
 *  y up), the letters each one stands for, the width, and the letters the font cannot draw. */
export function shape(hb: Harfbuzz, s: Shaper, text: string, size: number) {
  const k = size / s.upem, glyphs: Glyph[] = [], missing = new Set<string>();
  let x = 0;
  for (const run of runs(text)) {
    const buf = new hb.Buffer();
    buf.addCodePoints(run.cs);
    buf.guessSegmentProperties();
    buf.setDirection(run.rtl ? hb.Direction.RTL : hb.Direction.LTR);
    hb.shape(s.font, buf);
    const out = buf.getGlyphInfosAndPositions(), starts = [...new Set(out.map((g) => g.cluster))].sort((a, b) => a - b);
    // the letters of each cluster go to its glyphs in reading order, the last glyph taking what is left (ligatures)
    const groups = new Map<number, Glyph[]>();
    for (const g of out) {
      const glyph = { gid: g.codepoint, x: x + (g.xOffset ?? 0) * k, y: (g.yOffset ?? 0) * k, uni: [] as number[], rtl: run.rtl };
      x += (g.xAdvance ?? 0) * k;
      glyphs.push(glyph);
      groups.set(g.cluster, [...(groups.get(g.cluster) ?? []), glyph]);
    }
    for (const [cluster, gs] of groups) {
      const cs = run.cs.slice(cluster, starts[starts.indexOf(cluster) + 1] ?? run.cs.length), read = run.rtl ? [...gs].reverse() : gs;
      read.forEach((g, i) => { g.uni = i < read.length - 1 ? cs.slice(i, i + 1) : cs.slice(i); });
      // a subset keeps letters it does not need as empty glyphs, or drops them (glyph 0)
      if (gs.some((g) => g.gid === 0 || !s.font.glyphToPath(g.gid))) for (const c of cs) if (!/\s/.test(String.fromCodePoint(c))) missing.add(String.fromCodePoint(c));
    }
  }
  return { glyphs, width: x, missing: [...missing].sort((a, b) => text.indexOf(a) - text.indexOf(b)) }; // in reading order
}

/** Writes lines shaped by `shape` into `out`: each font goes in once (glyph id = character code) with a map from glyph
 *  back to letters, so the text copies and searches as written. Coordinates as `pageWriter.draw`: page height `h`. */
export function shapedWriter(m: typeof MuPDF, hb: Harfbuzz, out: MuPDF.PDFDocument) {
  const faces = new Map<Shaper, { name: string; ref: MuPDF.PDFObject; used: Map<number, number[]> }>(), fonts: Record<string, MuPDF.PDFObject> = {};
  const n = (v: number) => +v.toFixed(2);
  return {
    fonts,
    /** `fake`: a bold line in a font without a bold face, thickened with an outline of its own colour */
    draw(s: Shaper, l: { text: string; x: number; y: number; size: number; color: number[]; align: 'left' | 'center' | 'right'; fake?: boolean }, h: number) {
      let face = faces.get(s);
      if (!face) {
        face = { name: 'WqO' + faces.size, ref: out.addFont(new m.Font(s.name, s.bytes)), used: new Map() };
        faces.set(s, face); fonts[face.name] = face.ref;
      }
      const { glyphs, width } = shape(hb, s, l.text, l.size), x0 = l.align === 'right' ? l.x - width : l.align === 'center' ? l.x - width / 2 : l.x;
      const color = l.color.map(n).join(' ');
      let ops = `BT /${face.name} ${n(l.size)} Tf ${color} rg ${l.fake ? `2 Tr ${n(l.size * 0.03)} w ${color} RG ` : ''}`;
      for (const g of glyphs) {
        if (!g.gid && g.uni.every((c) => /\s/.test(String.fromCodePoint(c)))) continue; // a subset without a space glyph
        const uni = g.rtl && g.uni.length > 1 ? [...g.uni].reverse() : g.uni; // a joined pair is read back right to left
        if (uni.length && !face.used.has(g.gid)) face.used.set(g.gid, uni);
        // a glyph whose letters differ from its map (the dots of a letter drawn in pieces: none; a glyph shared by two
        // letters) carries its own as the actual text of a marked span
        const own = face.used.get(g.gid)?.join() !== uni.join();
        ops += `${own ? `/Span <</ActualText <FEFF${hex16(uni)}>>> BDC ` : ''}1 0 0 1 ${n(x0 + g.x)} ${n(h - l.y + g.y)} Tm <${g.gid.toString(16).padStart(4, '0')}> Tj ${own ? 'EMC ' : ''}`;
      }
      return ops + 'ET\n';
    },
    finish() { for (const f of faces.values()) f.ref.put('ToUnicode', out.addStream(toUnicode(f.used), {})); },
  };
}

/** The font of the first letter inside `box` on `page` (the line being replaced), before it is taken away. */
export function fontAt(page: MuPDF.Page, box: { x: number; y: number; w: number; h: number }): MuPDF.Font | null {
  let found: MuPDF.Font | null = null;
  const st = page.toStructuredText('preserve-whitespace');
  st.walk({
    onChar(c, origin, font) {
      if (!found && c.trim() && origin[0] >= box.x - 1 && origin[0] <= box.x + box.w + 1 && origin[1] >= box.y - 1 && origin[1] <= box.y + box.h + 1) found = font;
    },
  });
  st.destroy();
  return found;
}

/** A font's name as people know it: no subset tag ("ABCDEF+"), spaces between words. */
export const fontName = (font: MuPDF.Font) => font.getName().replace(/^[A-Z]{6}\+/, '').replace(/[-,_](Regular|Roman|Normal|Book)$/i, '');

/** The font to write `text` in for a line whose own font is `own`: the own font when it has every letter, else the
 *  full bundled copy of it or the closest bundled font. `using`: that bundled font's name (null = the own font). */
export function pick(hb: Harfbuzz, own: MuPDF.Font | null, text: string, bold: boolean, file: (name: string) => Uint8Array) {
  const name = own ? fontName(own) : '', bytes = own?.getBuffer()?.asUint8Array().slice();
  let missing: string[] = [];
  if (own && bytes?.length) {
    try {
      const s = shaper(hb, name, bytes, own.isBold() || /bold|black|heavy/i.test(own.getName()));
      missing = shape(hb, s, text, 1).missing;
      if (!missing.length) return { shaper: s, font: name, using: null, missing };
    } catch { /* a font HarfBuzz cannot read (bare CFF, Type 3): written in a bundled font, said so in the editor */ }
  }
  const key = name.toLowerCase().replace(/[^a-z]/g, '');
  const same = (Object.keys(BUNDLED) as Family[]).find((f) => key.startsWith(BUNDLED[f][0].toLowerCase().replace(/ /g, '')));
  const close: Family = NASKH.test(name) || own?.isSerif() ? 'naskh' : 'sans';
  const order = [...new Set<Family>([same ?? close, close, 'naskh', 'sans', 'tajawal'])];
  const tries = order.map((f) => {
    const s = shaper(hb, BUNDLED[f][0] + (bold ? ' Bold' : ''), file(BUNDLED[f][bold ? 2 : 1]), bold);
    return { s, left: shape(hb, s, text, 1).missing.length };
  });
  const best = tries.find((t) => !t.left) ?? tries[0];
  return { shaper: best.s, font: name, using: best.s.name, missing };
}
