// The page editor's engine side: what is on a page (text lines, photos) and a page with edits applied — text added,
// photos added, photos moved / resized / replaced / deleted, lines of text replaced. Pure like assemble.ts: the MuPDF
// module is passed in, so the same code runs in the engine worker and in the Node self-check (tests/unit/editpage).
// Coordinates are points on the page as seen (MuPDF page space: top-left origin, the page's own turn applied).
// New text boxes are written in Tajawal; a replaced line keeps its own font (ownfont.ts, HarfBuzz).
import type * as MuPDF from '../../../engine/mupdf-wasm/dist/mupdf.js';
import { pageWriter, widthOf, wrap, type Fonts, type Line } from './textpage.ts';
import { fontAt, fontName } from './ownfont.ts';
import { writer, type Store } from './fontstore.ts';
import { stamp } from './assemble.ts';
import { logicalOrder, guessDirection, isMark, isRtl } from './bidi.ts';

export type Box = { x: number; y: number; w: number; h: number };
export type Align = 'left' | 'center' | 'right';
export type Edit =
  // a text box (`from`: the existing line it replaces, which is removed first); lines wrap at the box width, or with `fit` stay one line shrunk to the width
  | ({ kind: 'text'; text: string; size: number; color: number[]; bold: boolean; align: Align; from?: Box; fit?: boolean } & Box)
  // a new photo (photos[photo]) filling the box
  | ({ kind: 'photo'; photo: number } & Box)
  // existing photo number `index` (pageObjects order): moved / resized to the box, replaced by photos[photo], or removed
  | ({ kind: 'image'; index: number; from: Box; photo?: number; removed?: boolean } & Box)
  // redaction: text, photo pixels and lines under the box removed from the page for good, a black box in their place
  | ({ kind: 'redact' } & Box);

/** Text box layout shared with the editor screen: first baseline `BASELINE`·size below the box top, lines `LEADING`·size apart. */
export const LEADING = 1.3, BASELINE = 1.0;

export type PageLine = Box & { text: string; size: number; bold: boolean; color: number[]; rtl: boolean; base: number; font: string }; // base: baseline y
/** What a replaced line is written with: HarfBuzz, the bundled fonts' bytes by file name, a subsetter, system fonts (fontstore.ts). */
export type Own = Store;
/** Lines of text (only the ones that run left to right on the page as seen, which the editor can replace) and photos.
 *  The text of a line is rebuilt from where its glyphs stand (left to right) and turned back into reading order by
 *  the bidi algorithm (bidi.ts `logicalOrder`), because MuPDF's own reading order misplaces punctuation, numbers and
 *  ligatures in Arabic; the spaces MuPDF invents before harakat and inside words are dropped, and the pieces MuPDF
 *  makes of one line (a font change, a number) are joined when they share a baseline. Size, colour and font come from
 *  the line's first Arabic letter (else its first letter), not from a leader dot or a digit in another font. */
const fontKey = (name: string) => name.replace(/^[A-Z]{6}\+/, '').replace(/[-,_ ]?(Regular|Bold|Italic|Medium|Light|Black|Heavy|MT|PSMT)+$/i, '').toLowerCase().replace(/[^a-z]/g, '');
const SPACE_GAP = 0.12; // of the size: a narrower gap is letter spacing (Noto Naskh in Edge), not a word break
export function pageObjects(page: MuPDF.Page): { lines: PageLine[]; images: Box[] } {
  type Ch = { c: number; x0: number; x1: number; y: number; size: number; font: MuPDF.Font; color: number[] };
  type Raw = { box: Box; base: number; chars: Ch[] };
  const raws: Raw[] = [], images: Box[] = [], st = page.toStructuredText('preserve-images,preserve-whitespace');
  let cur: Raw | null = null, flat = false;
  st.walk({
    onImageBlock(b) { images.push(box(b)); },
    beginLine(b, _wmode, dir) { flat = Math.abs(dir[1]) < 0.01 && dir[0] > 0; cur = { box: box(b), base: b[3], chars: [] }; },
    onChar(c, origin, font, size, q, color) {
      if (!cur || !flat) return;
      const xs = [q[0], q[2], q[4], q[6]];
      cur.chars.push({ c: c.codePointAt(0)!, x0: Math.min(...xs), x1: Math.max(...xs), y: origin[1], size, font, color });
    },
    endLine() { if (cur && flat && cur.chars.some((ch) => ch.c > 0x20)) raws.push(cur); cur = null; },
  });
  st.destroy();
  // pieces of one line: same baseline (within a third of the size), no big gap between them
  raws.sort((a, b) => a.base - b.base || a.box.x - b.box.x);
  const merged: Raw[] = [];
  for (const r of raws) {
    const size = r.chars.find((ch) => ch.c > 0x20)?.size ?? 10, last = merged[merged.length - 1];
    if (last && Math.abs(last.base - r.base) < size * 0.34 && (r.box.x - (last.box.x + last.box.w) < size * 0.5 && last.box.x - (r.box.x + r.box.w) < size * 0.5)) {
      last.chars.push(...r.chars);
      const x0 = Math.min(last.box.x, r.box.x), y0 = Math.min(last.box.y, r.box.y), x1 = Math.max(last.box.x + last.box.w, r.box.x + r.box.w), y1 = Math.max(last.box.y + last.box.h, r.box.y + r.box.h);
      last.box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    } else merged.push(r);
  }
  const lines: PageLine[] = [], pageDir = merged.filter((r) => r.chars.some((ch) => isRtl(ch.c))).length * 2 > merged.length ? 'rtl' : 'ltr';
  for (const r of merged) {
    // the letters of one glyph (a ligature's): MuPDF gives all but one of them a zero-width box at the glyph's edge and
    // lists them in reverse — each goes to the full-width glyph that ends or starts where it stands, order put back;
    // a combining mark goes after the letter whose box holds it (marks have their own, higher, box)
    const full = r.chars.filter((ch) => ch.x1 - ch.x0 >= 0.05 && ch.c > 0x20 && !isMark(ch.c)), spaces = r.chars.filter((ch) => ch.c <= 0x20 && ch.x1 - ch.x0 >= 0.05);
    const zero = r.chars.filter((ch) => ch.x1 - ch.x0 < 0.05 && ch.c > 0x20 && !isMark(ch.c)), marks = r.chars.filter((ch) => isMark(ch.c));
    const members = new Map<Ch, Ch[]>(), tail = new Map<Ch, Ch[]>(), loose: Ch[] = []; // loose: a letter MuPDF gave no box (it stands at its own x)
    // boxless line: most letters have no width (the advances went to invented spaces) — each letter then stands at its origin
    const degenerate = zero.length > full.length * 0.4;
    // a ligature's host is a letter that joins to the next one (ح م ل ب…) or the alef of the Allah word; a letter that
    // never joins forward (ا د ذ ر ز و ء ة ى) cannot carry one — a boxless letter next to it stands on its own
    const NO_JOIN = new Set([0x627, 0x623, 0x625, 0x622, 0x62f, 0x630, 0x631, 0x632, 0x648, 0x624, 0x621, 0x629, 0x649, 0x671]);
    // a boxless letter belongs to the boxed letter it stands beside when the two read as a ligature: lam + alef (ا أ إ آ),
    // the letters of the Allah word, or two joining letters (a font's own ligature such as حم). Which of the two MuPDF
    // lists first depends on the producer's ToUnicode, so the pair is judged both ways round
    const ALEF = new Set([0x627, 0x623, 0x625, 0x622]);
    const lamAlef = (a: number, b: number) => (a === 0x644 && ALEF.has(b)) || (b === 0x644 && ALEF.has(a));
    const allahLetter = (c: number) => c === 0x627 || c === 0x644 || c === 0x647;
    const ligates = (f: Ch, z: Ch) => lamAlef(f.c, z.c) || (allahLetter(f.c) && allahLetter(z.c)) || (isRtl(f.c) && isRtl(z.c) && (!NO_JOIN.has(f.c) || !NO_JOIN.has(z.c)));
    for (const z of zero) {
      const atEnd = degenerate ? undefined : full.find((f) => Math.abs(f.x1 - z.x0) < 0.06), atStart = degenerate ? undefined : full.find((f) => Math.abs(f.x0 - z.x0) < 0.06);
      const host = atEnd && ligates(atEnd, z) ? atEnd : atStart && ligates(atStart, z) ? atStart : undefined;
      if (host) members.set(host, [z, ...(members.get(host) ?? [])]); else loose.push(z);
    }
    // a mark belongs to the Arabic letter it stands on. Producers differ: Word, LibreOffice and Waraq put the mark at its
    // letter's left edge and list it after the letter (the mark of a kerned letter may lie a little outside its box); Edge
    // prints Courier-like fonts with the mark at the right edge and lists it before. Adjacent letters share an edge, so the
    // line's type is voted by the marks that match one edge only, then: type "left edge" → the letter listed before the
    // mark when the mark lies within its box (a third of an em beyond on the left); type "right edge" → the letter listed
    // after it, within its box (beyond on the right). On boxless lines (letters at their origins) the origin that matches
    // exactly is the letter. A mark with no such letter goes to the nearest letter by edge. Punctuation and digits never
    // carry a mark.
    const hosts = [...full, ...loose].filter((h) => isRtl(h.c));
    const index = new Map(r.chars.map((ch, i) => [ch, i])), pool = hosts.length ? hosts : [...full, ...loose];
    const byList = [...pool].sort((a, b) => index.get(a)! - index.get(b)!);
    const edge = (h: Ch, x: number) => Math.min(Math.abs(x - h.x0), Math.abs(x - h.x1));
    let leftVotes = 0, rightVotes = 0;
    for (const mk of marks) {
      const x = (mk.x0 + mk.x1) / 2, exact = pool.filter((h) => edge(h, x) < 0.05);
      if (exact.length === 1) { if (Math.abs(x - exact[0].x0) < 0.05) leftVotes++; else rightVotes++; }
    }
    const rightType = rightVotes > leftVotes + 1;
    for (const mk of marks) {
      const at = index.get(mk)!, x = (mk.x0 + mk.x1) / 2, p = [...byList].reverse().find((h) => index.get(h)! < at), n = byList.find((h) => index.get(h)! > at);
      const exact = pool.filter((h) => edge(h, x) < 0.05), em = mk.size * 0.33;
      let host: Ch | undefined;
      if (degenerate && exact.length) host = exact.sort((a, b) => Math.abs(index.get(a)! - at) - Math.abs(index.get(b)! - at))[0];
      else if (!rightType && p && x >= p.x0 - em && x <= p.x1 + 0.05) host = p;
      else if (rightType && n && x >= n.x0 - 0.05 && x <= n.x1 + em) host = n;
      if (!host) host = [...pool].sort((a, b) => Math.round(edge(a, x) * 4) - Math.round(edge(b, x) * 4) || Math.abs(index.get(a)! - at) - Math.abs(index.get(b)! - at))[0];
      if (host) tail.set(host, [...(tail.get(host) ?? []), mk]);
    }
    // the letters of one glyph in reading order: lam before its alef, the Allah word as written, otherwise as the producer's map
    // stores them (the boxed letter first, the boxless ones after it) — Word and Edge list them reversed, which this undoes
    const stored = (f: Ch) => {
      const cl = [f, ...(members.get(f) ?? [])], cs = cl.map((ch) => ch.c);
      if (cl.length === 2 && lamAlef(cs[0], cs[1])) return cs[0] === 0x644 ? cl : [cl[1], cl[0]];
      if (cl.length === 4 && cs.every(allahLetter) && cs.filter((c) => c === 0x644).length === 2) { const lams = cl.filter((ch) => ch.c === 0x644); return [cl.find((ch) => ch.c === 0x627)!, lams[0], lams[1], cl.find((ch) => ch.c === 0x647)!]; }
      return cl;
    };
    const key = (cl: Ch[]) => Math.min(...cl.filter((ch) => !isMark(ch.c)).map((ch) => ch.x0));
    const clusters: Ch[][] = [...[...full, ...loose].map((f) => [...stored(f), ...(tail.get(f) ?? [])]), ...spaces.map((sp) => [sp])]
      .sort((a, b) => (degenerate ? 0 : key(a) - key(b)) || index.get(a[0])! - index.get(b[0])!); // by the glyph's left edge (a cluster may start with a boxless letter); its marks do not count
    // a space MuPDF invented: on a boxless line it is a letter's advance (its box runs from one letter's origin to the next's);
    // elsewhere it fills a gap where the neighbours almost touch — a word break is wider
    const origins = [...full, ...loose].flatMap((ch) => [ch.x0, ch.x1]), near = (a: number, b: number) => Math.abs(a - b) < 0.05; // letters' origins and box edges
    const kept = clusters.filter((cl, k) => {
      if (cl[0].c > 0x20) return true;
      const prev = clusters[k - 1], next = clusters[k + 1];
      if (!prev || !next || prev[0].c <= 0x20) return false;
      if (degenerate) return !(origins.some((o) => near(o, cl[0].x0)) && origins.some((o) => near(o, cl[0].x1)));
      // the gap between the neighbours' glyphs decides; on an italic font the boxes lean into each other, so the space's own box does
      const gap = prev[0].font.isItalic() ? cl[0].x1 - cl[0].x0 : next[0].x0 - Math.max(...prev.map((ch) => ch.x1));
      return gap > prev[0].size * SPACE_GAP;
    });
    const atoms = kept.map((cl) => cl[0].c);
    let order: number[];
    const letterXs = kept.filter((cl) => cl[0].c > 0x20 && isRtl(cl[0].c)).map((cl) => cl[0].x0);
    const listedLtr = letterXs.filter((x, i) => i && x > letterXs[i - 1]).length > letterXs.length / 2; // LibreOffice lists boxless lines left to right
    if (degenerate && !listedLtr) {
      // overlapping, kerned glyphs make positions unreliable on boxless lines; MuPDF lists them in reading order, except
      // that what ends the line (a full stop and its mark) comes first: those go back to the end
      const first = letterXs.length ? Math.min(...letterXs) : 0, lead = kept.findIndex((cl) => cl[0].c > 0x20 && isRtl(cl[0].c)), head = kept.slice(0, Math.max(0, lead));
      order = [...kept.keys()].slice(head.length); const tailAtoms = [...kept.keys()].slice(0, head.length).filter((k) => kept[k][0].x0 < first + 0.5 || !isRtl(kept[k][0].c));
      order.push(...tailAtoms);
    } else order = logicalOrder(atoms, guessDirection(atoms, pageDir)).order;
    const cs = order.flatMap((k) => kept[k].map((ch) => ch.c));
    // invisible joiners (pieces of letters) go; kashida (tatweel) is justification, not text — except the Hijri year's هـ
    const text = cs.map((c) => String.fromCodePoint(c)).join('').normalize('NFKC').replace(/[​‌‍﻿]/g, '')
      .replace(/ـ+/g, (run, at, s) => (s[at - 1] === 'ه' && (at + run.length >= s.length || /[\s\p{P}]/u.test(s[at + run.length])) ? 'ـ' : '')).replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const letters = r.chars.filter((ch) => ch.c > 0x20), lead = letters.find((ch) => isRtl(ch.c)) ?? letters[0];
    lines.push({ ...r.box, text, size: lead.size, base: lead.y, bold: lead.font.isBold() || /bold|black|heavy/i.test(lead.font.getName()), color: rgb(lead.color), font: fontName(lead.font), rtl: /[\u0590-\u08ff]/.test(text) });
  }
  return { lines, images };
}
const box = (b: MuPDF.Rect): Box => ({ x: b[0], y: b[1], w: b[2] - b[0], h: b[3] - b[1] });
const rgb = (c: number[]) => (c.length === 1 ? [c[0], c[0], c[0]] : c.length === 4 ? [0, 1, 2].map((i) => (1 - c[i]) * (1 - c[3])) : c.slice(0, 3));

/** Page `index` of `src` with `edits` applied, as a new one-page PDF. `lift`: only take away what the edits replace (the
 *  editor's background while the moved photos and new text are drawn on top of it). */
export function editPage(m: typeof MuPDF, src: MuPDF.PDFDocument, index: number, edits: Edit[], photos: Uint8Array[], fonts?: () => Fonts, lift = false, own?: Own): MuPDF.PDFDocument {
  const out = new m.PDFDocument();
  out.graftPage(-1, src, index);
  let page = out.loadPage(0);
  const obj = page.getObject(), T = page.getTransform(), inv = m.Matrix.invert(T), H = page.getBounds()[3];
  const images = imageBlocks(page), xobjects = obj.get('Resources', 'XObject');
  const draw: string[] = [], added: Record<string, MuPDF.PDFObject> = {};
  // an image drawn by `fz` (MuPDF's image matrix: the unit square to the page as seen, first row at the top)
  const place = (ref: MuPDF.PDFObject, fz: MuPDF.Matrix) => {
    const name = 'WqI' + Object.keys(added).length, cm = m.Matrix.concat(m.Matrix.concat(FLIP, fz), inv);
    added[name] = ref; draw.push(`q ${cm.map(n).join(' ')} cm /${name} Do Q`);
  };
  const upright = (img: MuPDF.Image, b: Box): MuPDF.Matrix => { // the photo inside the box, keeping its shape
    const k = Math.min(b.w / img.getWidth(), b.h / img.getHeight()), w = img.getWidth() * k, h = img.getHeight() * k;
    return [w, 0, 0, h, b.x + (b.w - w) / 2, b.y + (b.h - h) / 2];
  };

  // a replaced line's font, read before its text is taken away
  type Text = Extract<Edit, { kind: 'text' }>;
  const texts = edits.filter((e): e is Text => e.kind === 'text' && !!e.text.trim());
  const hints = new Map(own && !lift ? texts.filter((e) => e.from).map((e) => { const f = fontAt(page, e.from!); return [e, f ? { name: f.getName(), bytes: f.getBuffer()?.asUint8Array().slice() ?? null, bold: f.isBold() || /bold|black|heavy/i.test(f.getName()), italic: f.isItalic() } : {}] as const; }) : []);

  // existing photos: taken away by emptying their own image resource when only they use it, else by redaction
  const redactImages: Box[] = [], redactText: Box[] = [];
  const names = new Map(edits.filter((e) => e.kind === 'image').map((e) => [e, images[e.index] ? owner(out, page, images, e.index) : null]));
  const empty = out.addStream('', { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 0, 0] });
  for (const e of edits) {
    if (e.kind === 'image' && images[e.index]) {
      const name = names.get(e)!, b = images[e.index], keep = name ? xobjects.get(name) : null;
      if (name) xobjects.put(name, empty); else redactImages.push(e.from);
      if (lift || e.removed) continue;
      if (e.photo != null) { const img = new m.Image(photos[e.photo]); place(out.addImage(img), upright(img, e)); continue; }
      // moved / resized: the same picture (turns and flips kept), its box mapped onto the new one
      const to = m.Matrix.concat(m.Matrix.concat(m.Matrix.translate(-e.from.x, -e.from.y), m.Matrix.scale(e.w / e.from.w, e.h / e.from.h)), m.Matrix.translate(e.x, e.y));
      place(keep ?? out.addImage(b.image), m.Matrix.concat(b.transform, to));
    }
    if (e.kind === 'text' && e.from) {
      // a band through the letters' middle (every glyph's box crosses it; the next lines' ascenders and descenders do
      // not) plus the harakat's own boxes, which sit above the band
      const from = e.from;
      // a little wider than the line's box: MuPDF's box of a glyph follows the font's /W, and a subset that lists a narrower width than the ink leaves the line's first letter
      // standing just outside it (Edge's Arial Unicode MS, the Arabic 'طب' pair: the old first letter stayed under the new line)
      const pad = e.size * 0.25;
      redactText.push({ x: from.x - pad, y: from.y + from.h * 0.3, w: from.w + 2 * pad, h: from.h * 0.4 });
      const st = page.toStructuredText('preserve-whitespace');
      st.walk({ onChar(c, origin, _f, _s, q) {
        if (!isMark(c.codePointAt(0)!) || origin[0] < from.x - 1 || origin[0] > from.x + from.w + 1 || origin[1] < from.y - 1 || origin[1] > from.y + from.h + 1) return;
        const xs = [q[0], q[2], q[4], q[6]], ys = [q[1], q[3], q[5], q[7]];
        redactText.push({ x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs) || 0.5, h: Math.max(...ys) - Math.min(...ys) || 0.5 });
      } });
      st.destroy();
    }
  }
  const redact = (boxes: Box[], imageMethod: number, textMethod: number) => {
    if (!boxes.length) return;
    for (const b of boxes) page.createAnnotation('Redact').setRect([b.x, b.y, b.x + b.w, b.y + b.h]);
    page.applyRedactions(false, imageMethod, 0, textMethod);
  };
  redact(redactImages, 1, 1); // remove images there, keep text and lines
  redact(redactText, 0, 0); // remove text there, keep images and lines
  const hide = edits.filter((e) => e.kind === 'redact');
  if (hide.length) { for (const b of hide) page.createAnnotation('Redact').setRect([b.x, b.y, b.x + b.w, b.y + b.h]); page.applyRedactions(true, 2, 1, 0); } // before new text and photos, which stay

  if (!lift) {
    for (const e of edits) if (e.kind === 'photo') { const img = new m.Image(photos[e.photo]); place(out.addImage(img), upright(img, e)); }
    const resources: Record<string, Record<string, MuPDF.PDFObject>> = { XObject: added };
    if (texts.length) {
      const lines: Line[] = [], shaped = own && writer(m, own, out);
      let ops = '';
      for (const e of texts) {
        const hint = hints.get(e), f = hint ? null : fonts!();
        const width = hint ? (t: string) => shaped!.measure({ text: t, x: 0, y: 0, size: e.size, color: e.color, align: 'left', bold: e.bold, hint }) : (t: string) => widthOf(f!, e.bold)(t, e.size);
        (e.fit || hint ? [e.text.replace(/\s*\n\s*/g, ' ')] : wrap(width, e.text, e.w)).forEach((text, i) => { // a replaced line, or fit: one line, squeezed into the box when wider
          const l = { text, size: e.size, color: e.color, align: e.align, y: e.y + (BASELINE + i * LEADING) * e.size, x: e.align === 'right' ? e.x + e.w : e.align === 'center' ? e.x + e.w / 2 : e.x };
          // a replaced line is written in its own font (or the closest face) run by run; "bold" thickens a face without a bold cut
          if (hint) ops += shaped!.draw({ ...l, bold: e.bold, hint, fit: e.w }, H); else lines.push({ ...l, bold: e.bold, ...(e.fit ? { max: e.w } : {}) });
        });
      }
      const tw = lines.length ? pageWriter(m, out, fonts!()) : null;
      if (tw) ops += tw.draw({ w: 0, h: H, lines });
      // the writers work top-down on the page as seen; this matrix takes that to the page's own coordinates
      draw.push(`q ${m.Matrix.concat([1, 0, 0, -1, 0, H], inv).map(n).join(' ')} cm ${ops} Q`);
      tw?.finish(); shaped?.finish();
      resources.Font = { ...tw?.fonts, ...shaped?.fonts };
    }
    if (draw.length) { page.destroy(); stamp(out, out.findPage(0), draw.join('\n'), resources); page = out.loadPage(0); }
  }
  page.destroy();
  return out;
}

const FLIP: MuPDF.Matrix = [1, 0, 0, -1, 0, 1]; // PDF draws images bottom-up; MuPDF's image matrix is top-down
const n = (v: number) => +v.toFixed(4);

type Block = { bbox: MuPDF.Rect; transform: MuPDF.Matrix; image: MuPDF.Image };
function imageBlocks(page: MuPDF.Page) {
  const out: Block[] = [], st = page.toStructuredText('preserve-images');
  st.walk({ onImageBlock(bbox, transform, image) { out.push({ bbox, transform, image }); } });
  st.destroy();
  return out;
}

// The page's image resource that draws block `i` and nothing else: each one is emptied in turn to see what goes away.
// null when the photo sits inside a form, is drawn inline, or its image is used more than once on the page.
function owner(out: MuPDF.PDFDocument, page: MuPDF.PDFPage, blocks: Block[], i: number): string | null {
  const xo = page.getObject().get('Resources', 'XObject');
  if (!xo.isDictionary()) return null;
  const names: string[] = [];
  xo.forEach((v, k) => { if (v.get('Subtype').asName?.() === 'Image') names.push(String(k)); });
  const empty = out.addStream('', { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 0, 0] }), same = (a: MuPDF.Rect, b: MuPDF.Rect) => a.every((v, k) => Math.abs(v - b[k]) < 0.01);
  for (const name of names) {
    const keep = xo.get(name);
    xo.put(name, empty);
    const left = imageBlocks(page);
    xo.put(name, keep);
    if (left.length === blocks.length - 1 && !left.some((b) => same(b.bbox, blocks[i].bbox))) return name;
  }
  return null;
}
