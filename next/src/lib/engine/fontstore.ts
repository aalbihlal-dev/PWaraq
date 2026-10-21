// The font service (interface: Archive-2026-10-12/reviews/ARABIC-FONTSTORE-INTERFACE.md): which font draws a piece of
// text, shaped how, written how. Pure: the MuPDF module and HarfBuzz are passed in, so it runs in the worker and in Node.
// - A Face is a font program HarfBuzz can read, with its cmap and whether it carries Arabic shaping rules (GSUB 'arab').
//   Fonts without them (the subsets Word and Edge embed) are never used for Arabic: HarfBuzz would write isolated letters.
// - getFace walks a chain per run of text: the PDF's own font → the bundled copy of its family → a system font of the same
//   family (desktop, registered from the main thread) → Noto Naskh / Noto Sans Arabic by style → Tajawal; a face that
//   lacks a letter of the run is skipped, so Latin words and dashes no longer pull a whole Naskh line into Tajawal.
// - writer draws each direction run as one TJ (kerning and mark offsets as adjustments), gives every glyph a ToUnicode
//   entry (ligatures → all their letters in reading order, extra pieces of a letter → ZWNJ) and, with a subsetter, embeds
//   only the glyphs used (glyph ids retained, so the content stream stays valid).
import type * as MuPDF from '../../../engine/mupdf-wasm/dist/mupdf.js';
import type * as HB from 'harfbuzzjs';
import { runs as bidiRuns, classOf, isMark, type Run } from './bidi.ts';
import { toUnicode } from './textpage.ts';

export type Harfbuzz = typeof HB;
const hex16 = (cs: number[]) => [...String.fromCodePoint(...cs)].flatMap((c) => c.split('')).map((c) => c.charCodeAt(0).toString(16).padStart(4, '0')).join('');
export type Script = 'arab' | 'latn' | 'other';
export type Face = { name: string; bytes: Uint8Array; face: HB.Face; font: HB.Font; upem: number; bold: boolean; italic: boolean; source: 'pdf' | 'bundled' | 'system'; shapes: boolean; cmap: Set<number>; has(cp: number): boolean };
export type Hint = { name?: string; bytes?: Uint8Array | null; bold?: boolean; italic?: boolean };
/** What the writers need from their host: HarfBuzz, the bundled font files by name, an optional subsetter. */
export type Store = { hb: Harfbuzz; file: (name: string) => Uint8Array; subset?: Subsetter; system?: Map<string, Uint8Array> };
export type Subsetter = (bytes: Uint8Array, gids: Iterable<number>) => Uint8Array | null;

/** Fonts Waraq bundles (public/fonts, SIL Open Font Licence): family → [name, regular file, bold file]. */
export const BUNDLED = {
  amiri: ['Amiri', 'Amiri-Regular.ttf', 'Amiri-Bold.ttf'], // Naskh with one glyph per letter and Latin: the default for serif-like text
  tajawal: ['Tajawal', 'Tajawal-Regular.ttf', 'Tajawal-Bold.ttf'], // one glyph per letter and Latin: the default for sans-like text
  naskh: ['Noto Naskh Arabic', 'NotoNaskhArabic-Regular.ttf', 'NotoNaskhArabic-Bold.ttf'], // letters drawn in pieces (shared skeletons): last resorts
  sans: ['Noto Sans Arabic', 'NotoSansArabic-Regular.ttf', 'NotoSansArabic-Bold.ttf'],
} as const;
export const BUNDLED_FILES = Object.values(BUNDLED).flatMap((b) => [b[1], b[2]]);
type Family = keyof typeof BUNDLED;
// Windows / Office font names and the bundled family closest to each (naskh = serif-like, sans = Arial-like)
const NASKH = /naskh|times|traditional|simplified|typesetting|majalla|amiri|lotus|badr|mitra|scheherazade|lateef|harmattan|markazi|andalus|aldhabi|dinar|serif|frutiger/i;
/** Windows font files by the family name a PDF carries (subset tag stripped, spaces ignored): the desktop reads them. */
export const WINDOWS_FONTS: Record<string, [string, string?]> = {
  arial: ['arial.ttf', 'arialbd.ttf'], arialmt: ['arial.ttf', 'arialbd.ttf'], tahoma: ['tahoma.ttf', 'tahomabd.ttf'], segoeui: ['segoeui.ttf', 'segoeuib.ttf'],
  timesnewroman: ['times.ttf', 'timesbd.ttf'], timesnewromanpsmt: ['times.ttf', 'timesbd.ttf'], traditionalarabic: ['trado.ttf', 'tradbdo.ttf'], simplifiedarabic: ['simpo.ttf', 'simpbdo.ttf'],
  sakkalmajalla: ['majalla.ttf', 'majallab.ttf'], calibri: ['calibri.ttf', 'calibrib.ttf'], couriernew: ['cour.ttf', 'courbd.ttf'], couriernewpsmt: ['cour.ttf', 'courbd.ttf'],
  arabictypesetting: ['arabtype.ttf'], dubai: ['DUBAI-REGULAR.TTF', 'DUBAI-BOLD.TTF'], andalus: ['andlso.ttf'], aldhabi: ['aldhabi.ttf'], microsoftsansserif: ['micross.ttf'], arialunicodems: ['ARIALUNI.ttf'],
};
/** A font's name as people know it: no subset tag ("ABCDEF+"), no style suffix. */
export const fontName = (name: string) => name.replace(/^[A-Z]{6}\+/, '').replace(/[-,_]?(Regular|Roman|Normal|Book|MT|PSMT|PS)$/i, '').replace(/[-,_](Bold|Italic|BoldItalic|Light|Medium)+$/i, '');
const key = (name: string) => name.toLowerCase().replace(/[^a-z]/g, '');

/** A Face from a font program, or null when HarfBuzz cannot read it (bare CFF, Type 3, no glyphs). */
export function createFace(hb: Harfbuzz, name: string, bytes: Uint8Array, o: { bold?: boolean; italic?: boolean; source: Face['source'] }): Face | null {
  try {
    const face = new hb.Face(new hb.Blob(bytes)), font = new hb.Font(face), cmap = new Set(face.collectUnicodes());
    if (!face.upem || !cmap.size) return null;
    const shapes = face.getTableScriptTags('GSUB').includes('arab');
    return { name, bytes, face, font, upem: face.upem, bold: !!o.bold, italic: !!o.italic, source: o.source, shapes, cmap, has: (cp) => cmap.has(cp) };
  } catch { return null; }
}

export const scriptOf = (cs: number[]): Script => (cs.some((c) => { const k = classOf(c); return k === 'AL' || k === 'R'; }) ? 'arab' : cs.some((c) => classOf(c) === 'L') ? 'latn' : 'other');
const needed = (cs: number[]) => cs.filter((c) => c > 0x20 && c !== 0xa0);

/** The face for one run of text. The chain: the PDF's own font (when it shapes Arabic, for Arabic, and has every
 *  letter) → the bundled or system copy of the same family → the closest bundled family by style → every bundled family.
 *  `missing`: the letters the own font lacked (what the panel tells); `reason` says why it was not kept. */
export function getFace(store: Store, hint: Hint, script: Script, cs: number[], cache?: Map<string, Face | null>): { face: Face; missing: string[]; reason: 'own' | 'missing' | 'unusable' | 'none' } {
  const want = needed(cs), name = hint.name ? fontName(hint.name) : '', bold = !!hint.bold, italic = !!hint.italic;
  const mem = cache ?? new Map<string, Face | null>();
  const faceOf = (k: string, make: () => Face | null) => { if (!mem.has(k)) mem.set(k, make()); return mem.get(k)!; };
  const fits = (f: Face | null, arabic = script === 'arab') => !!f && (!arabic || f.shapes) && want.every((c) => f.has(c));
  let missing: string[] = [], reason: 'own' | 'missing' | 'unusable' | 'none' = 'none';
  if (hint.bytes?.length) {
    const own = faceOf('pdf:' + name + ':' + hint.bytes.length, () => createFace(store.hb, name, hint.bytes!, { bold, italic, source: 'pdf' }));
    if (fits(own)) return { face: own!, missing: [], reason: 'own' };
    if (own && (script !== 'arab' || own.shapes)) { missing = [...new Set(want.filter((c) => !own.has(c)).map((c) => String.fromCodePoint(c)))]; reason = missing.length ? 'missing' : 'unusable'; }
    else reason = 'unusable';
  }
  // the same family, whole: a system font (desktop) or a bundled one
  const k = key(name), sys = store.system && [...store.system.keys()].find((n) => key(n) === k || k.startsWith(key(n)));
  if (sys) { const f = faceOf('sys:' + sys, () => createFace(store.hb, sys, store.system!.get(sys)!, { bold, italic, source: 'system' })); if (fits(f)) return { face: f!, missing, reason }; }
  const same = (Object.keys(BUNDLED) as Family[]).find((f) => k.startsWith(key(BUNDLED[f][0])));
  const close: Family = NASKH.test(name) ? 'amiri' : 'tajawal';
  const order = [...new Set<Family>([...(same ? [same] : []), close, 'amiri', 'tajawal', 'naskh', 'sans'])];
  for (const fam of order) {
    const file = BUNDLED[fam][bold ? 2 : 1], f = faceOf('bundled:' + file, () => createFace(store.hb, BUNDLED[fam][0] + (bold ? ' Bold' : ''), store.file(file), { bold, source: 'bundled' }));
    if (fits(f)) return { face: f!, missing, reason };
  }
  // nothing has every letter: the closest family draws what it can (the rest is dropped, never a box)
  const file = BUNDLED[order[0]][bold ? 2 : 1];
  return { face: faceOf('bundled:' + file, () => createFace(store.hb, BUNDLED[order[0]][0] + (bold ? ' Bold' : ''), store.file(file), { bold, source: 'bundled' }))!, missing, reason };
}

export type Glyph = { gid: number; x: number; y: number; adv: number; cluster: number; uni: number[]; rtl: boolean };
/** One run shaped by HarfBuzz at `size`: glyphs left to right with their pen offsets (points, y up), advance, and the
 *  letters each stands for (a ligature's glyph carries them all, in reading order; a letter drawn in pieces gives its
 *  letters to the piece that advances the pen and a zero-width space to the rest). Letters the face lacks are left out. */
export function shapeRun(hb: Harfbuzz, face: Face, run: Run, size: number): { glyphs: Glyph[]; width: number } {
  const cs = run.cs.filter((c) => face.has(c) || c === 0x20), k = size / face.upem, buf = new hb.Buffer();
  if (!cs.length) return { glyphs: [], width: 0 };
  buf.addCodePoints(cs);
  buf.guessSegmentProperties();
  buf.setDirection(run.rtl ? hb.Direction.RTL : hb.Direction.LTR);
  hb.shape(face.font, buf);
  const out = buf.getGlyphInfosAndPositions(), glyphs: Glyph[] = [];
  let x = 0;
  for (const g of out) { glyphs.push({ gid: g.codepoint, x: x + (g.xOffset ?? 0) * k, y: (g.yOffset ?? 0) * k, adv: (g.xAdvance ?? 0) * k, cluster: g.cluster, uni: [], rtl: run.rtl }); x += (g.xAdvance ?? 0) * k; }
  // letters per cluster, in reading order; the first glyph of a cluster (reading order) takes them
  const starts = [...new Set(out.map((g) => g.cluster))].sort((a, b) => a - b);
  const byCluster = new Map<number, Glyph[]>();
  for (const g of glyphs) byCluster.set(g.cluster, [...(byCluster.get(g.cluster) ?? []), g]);
  for (const [cluster, gs] of byCluster) {
    const letters = cs.slice(cluster, starts[starts.indexOf(cluster) + 1] ?? cs.length);
    // the glyph that advances the pen carries the letters; each combining mark goes to a mark glyph of its own (zero
    // advance) so readers keep it after its letter; what is left (dots drawn apart) is a piece
    const base = gs.find((g) => g.adv > 0) ?? gs[0], marks = letters.filter((c) => isMark(c)), rest = letters.filter((c) => !isMark(c));
    const pieces = gs.filter((g) => g !== base);
    base.uni = rest.length ? rest : letters;
    pieces.forEach((g, i) => { g.uni = marks.length ? (i < marks.length ? [marks[i]] : [0x200b]) : [0x200b]; });
    if (marks.length > pieces.length) base.uni = [...base.uni, ...marks.slice(pieces.length)];
  }
  return { glyphs: glyphs.filter((g) => g.gid || g.uni.every((c) => c === 0x20)), width: x };
}

export type Line = { text: string; x: number; y: number; size: number; color: number[]; align: 'left' | 'center' | 'right'; bold?: boolean; italic?: boolean; hint?: Hint; fit?: number };
/** Writes lines into `out` as the editor's replaced text: `draw` gives the drawing commands for one line (page height
 *  `h`, y from the top), `fonts` the /Font resources, `finish` the ToUnicode maps and the subsetting. `measure` is the
 *  width `draw` will take. `faceFor` tells the panel which face the Arabic of a line gets. */
export function writer(m: typeof MuPDF, store: Store, out: MuPDF.PDFDocument) {
  const faces = new Map<Face, { name: string; ref: MuPDF.PDFObject; mfont: MuPDF.Font; used: Map<number, number[]> }>(), fonts: Record<string, MuPDF.PDFObject> = {}, cache = new Map<string, Face | null>();
  const n = (v: number) => +v.toFixed(2);
  const pieces = (l: Line) => bidiRuns([...l.text].map((c) => c.codePointAt(0)!)).map((run) => {
    const script = scriptOf(run.cs), { face, missing, reason } = getFace(store, { ...l.hint, bold: l.bold ?? l.hint?.bold, italic: l.italic ?? l.hint?.italic }, script, run.cs, cache);
    return { run, face, missing, reason, ...shapeRun(store.hb, face, run, l.size) };
  });
  const entry = (face: Face) => {
    let e = faces.get(face);
    if (!e) { const mfont = new m.Font(face.name, face.bytes); e = { name: 'WqO' + faces.size, ref: out.addFont(mfont), mfont, used: new Map() }; faces.set(face, e); fonts[e.name] = e.ref; }
    return e;
  };
  return {
    fonts,
    measure: (l: Line) => pieces(l).reduce((w, p) => w + p.width, 0),
    faceFor(l: Line) { const ps = pieces(l), ar = ps.find((p) => scriptOf(p.run.cs) === 'arab') ?? ps[0]; return ar ? { face: ar.face, missing: ar.missing, reason: ar.reason } : null; },
    draw(l: Line, h: number) {
      const ps = pieces(l), width = ps.reduce((w, p) => w + p.width, 0), tz = l.fit && width > l.fit ? l.fit / width : 1;
      let x = l.align === 'right' ? l.x - width * tz : l.align === 'center' ? l.x - (width * tz) / 2 : l.x, ops = '';
      const color = l.color.map(n).join(' ');
      for (const p of ps) {
        if (!p.glyphs.length) continue;
        const e = entry(p.face), fake = l.bold && !p.face.bold;
        ops += `BT /${e.name} ${n(l.size)} Tf ${tz === 1 ? '' : `${n(tz * 100)} Tz `}${color} rg ${fake ? `2 Tr ${n(l.size * 0.03)} w ${color} RG ` : ''}1 0 0 1 ${n(x)} ${n(h - l.y)} Tm `;
        // one TJ per run: each glyph's own advance (the font's, as /W says) is corrected to what HarfBuzz placed. A piece
        // of a letter (a dot or mark glyph beside its base) is nothing in MuPDF (an empty ActualText span) and a
        // zero-width space in other readers (its ToUnicode); the base glyph carries the letters.
        let arr = '', pen = 0, rise = 0;
        const flush = () => { if (arr) ops += `[${arr}] TJ `; arr = ''; };
        for (const g of p.glyphs) {
          const read = g.rtl && g.uni.length > 1 && !(g.uni.length === 1 && g.uni[0] === 0x200b) ? [...g.uni].reverse() : g.uni; // a joined pair (lam-alef) is read back right to left by MuPDF and pdf.js: the map holds it reversed
          if (!e.used.has(g.gid) && g.uni.length) e.used.set(g.gid, read);
          const dy = n(g.y), piece = g.uni.length === 1 && g.uni[0] === 0x200b;
          if (dy !== rise) { flush(); ops += `${dy} Ts `; rise = dy; }
          const own = !piece && e.used.get(g.gid)!.join() !== read.join(); // a glyph shared by several letters (dotless skeletons): its own letters here
          if (piece || own) { flush(); ops += `/Span <</ActualText <FEFF${piece ? '' : hex16(g.uni)}>>> BDC `; }
          const before = g.x - pen; if (Math.abs(before) > 0.005) arr += ` ${n((-before * 1000) / l.size)} `;
          arr += `<${g.gid.toString(16).padStart(4, '0')}>`;
          pen = g.x + e.mfont.advanceGlyph(g.gid) * l.size; // the pen after this glyph as the font advances it; the next glyph's `before` corrects it
          if (piece || own) { flush(); ops += 'EMC '; }
        }
        flush(); ops += `${rise ? '0 Ts ' : ''}ET\n`;
        x += p.width * tz;
      }
      return ops;
    },
    /** ToUnicode for every glyph used; the font programs cut down to the glyphs used when a subsetter is at hand. */
    finish() {
      for (const [face, e] of faces) {
        e.ref.put('ToUnicode', out.addStream(toUnicode(e.used), {}));
        if (store.subset && face.source !== 'pdf') {
          const cut = store.subset(face.bytes, e.used.keys());
          if (cut?.length) { const fd = e.ref.get('DescendantFonts')?.get(0)?.get('FontDescriptor'); const ff = fd?.get('FontFile2'); if (ff?.isStream?.()) fd.put('FontFile2', out.addStream(cut, { Length1: cut.length })); }
        }
      }
    },
  };
}

/** A subsetter from HarfBuzz's subset build (harfbuzzjs/dist/harfbuzz-subset.wasm): glyph ids are retained. */
export function makeSubsetter(wasm: WebAssembly.Module | BufferSource): Subsetter {
  const x = new WebAssembly.Instance(wasm instanceof WebAssembly.Module ? wasm : new WebAssembly.Module(wasm)).exports as any;
  return (bytes, gids) => {
    try {
      const ptr = x.malloc(bytes.length); new Uint8Array(x.memory.buffer).set(bytes, ptr);
      const blob = x.hb_blob_create(ptr, bytes.length, 2, 0, 0), face = x.hb_face_create(blob, 0), input = x.hb_subset_input_create_or_fail();
      const set = x.hb_subset_input_glyph_set(input);
      for (const g of gids) x.hb_set_add(set, g);
      x.hb_set_add(set, 0);
      x.hb_subset_input_set_flags(input, 2); // HB_SUBSET_FLAGS_RETAIN_GIDS
      const sub = x.hb_subset_or_fail(face, input);
      if (!sub) return null;
      const outBlob = x.hb_face_reference_blob(sub), at = x.hb_blob_get_data(outBlob, 0), len = x.hb_blob_get_length(outBlob);
      const res = new Uint8Array(x.memory.buffer).slice(at, at + len);
      x.hb_blob_destroy(outBlob); x.hb_face_destroy(sub); x.hb_subset_input_destroy(input); x.hb_face_destroy(face); x.hb_blob_destroy(blob); x.free(ptr);
      return res;
    } catch { return null; }
  };
}
