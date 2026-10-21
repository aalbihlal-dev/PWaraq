// Comments as standard PDF annotations on top of MuPDF: list them, and write changes. Pure (MuPDF passed in) so the Node
// self-check (tests/unit/annots.test.mjs) runs the same code as the engine worker. Acrobat and other readers show and edit
// what is written here. Coordinates are points from the top left of the page (MuPDF's own page space).
import type * as MuPDF from '../../../engine/mupdf-wasm/dist/mupdf.js';
import { measure, pageWriter, wrap, type Fonts } from './textpage.ts';
import { pageBox } from './tools.ts';

export type Kind = 'highlight' | 'underline' | 'strike' | 'ink' | 'square' | 'circle' | 'line' | 'arrow' | 'text' | 'note';
export type Rect = [number, number, number, number]; // x0, y0, x1, y1
export type Annot = {
  id: string; kind: Kind; page: number; color: string; // color: #rrggbb
  note: string; // the comment's text (for a text box: the text shown on the page)
  rect: Rect;
  quads?: number[][]; // highlight / underline / strike: one quad (8 numbers) per line of text
  strokes?: number[][][]; // pen: strokes of [x, y] points
  line?: number[]; // line / arrow: x1, y1, x2, y2 (the arrow head is at the second point)
};

const SUBTYPE: Record<string, Kind> = { Highlight: 'highlight', Underline: 'underline', StrikeOut: 'strike', Ink: 'ink', Square: 'square', Circle: 'circle', Line: 'line', FreeText: 'text', Text: 'note' };
const SUBTYPE_OF: Record<Kind, MuPDF.PDFAnnotationType> = { highlight: 'Highlight', underline: 'Underline', strike: 'StrikeOut', ink: 'Ink', square: 'Square', circle: 'Circle', line: 'Line', arrow: 'Line', text: 'FreeText', note: 'Text' };
const DEFAULT_COLOR: Record<Kind, string> = { highlight: '#f5c518', underline: '#d93a3a', strike: '#d93a3a', ink: '#2f6fd6', square: '#d93a3a', circle: '#d93a3a', line: '#d93a3a', arrow: '#d93a3a', text: '#233c36', note: '#f5c518' };

const h2 = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0');
function toHex(c: number[], kind: Kind) {
  if (c.length === 1) return '#' + h2(c[0]).repeat(3);
  if (c.length === 3) return '#' + c.map(h2).join('');
  if (c.length === 4) return '#' + [0, 1, 2].map((i) => h2((1 - c[i]) * (1 - c[3]))).join('');
  return DEFAULT_COLOR[kind];
}
const toRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];

function bounds(points: number[][]): Rect {
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
const quadPoints = (q: number[]) => [[q[0], q[1]], [q[2], q[3]], [q[4], q[5]], [q[6], q[7]]];

/** The comment moved and/or resized so that it fills `r` (its shape is stretched with it). */
export function remap(a: Annot, r: Rect): Annot {
  const [x0, y0, x1, y1] = a.rect, w = x1 - x0, h = y1 - y0;
  const sx = w > 1e-6 ? (r[2] - r[0]) / w : 1, sy = h > 1e-6 ? (r[3] - r[1]) / h : 1;
  const fx = (x: number) => r[0] + (x - x0) * sx, fy = (y: number) => r[1] + (y - y0) * sy;
  const out: Annot = { ...a, rect: [...r] as Rect };
  if (a.quads) out.quads = a.quads.map((q) => q.map((v, i) => (i % 2 ? fy(v) : fx(v))));
  if (a.strokes) out.strokes = a.strokes.map((s) => s.map(([x, y]) => [fx(x), fy(y)]));
  if (a.line) out.line = [fx(a.line[0]), fy(a.line[1]), fx(a.line[2]), fy(a.line[3])];
  return out;
}

/** The comments of the file (the kinds Waraq draws; stamps, links and form fields are left alone). `id` = page:position. */
export function listAnnots(m: typeof MuPDF, bytes: Uint8Array): Annot[] {
  const doc = m.Document.openDocument(bytes, 'application/pdf').asPDF()!, out: Annot[] = [];
  for (let i = 0; i < doc.countPages(); i++) {
    const page = doc.loadPage(i) as MuPDF.PDFPage;
    page.getAnnotations().forEach((x, n) => {
      let kind = SUBTYPE[x.getType()];
      if (!kind) return;
      const a: Annot = { id: `${i}:${n}`, kind, page: i, color: '', note: x.getContents() || '', rect: (x.hasRect() ? x.getRect() : x.getBounds()) as Rect };
      let color = x.getColor() as number[];
      if (kind === 'text') color = x.getDefaultAppearance().color as number[];
      if (x.hasQuadPoints()) { a.quads = x.getQuadPoints().map((q) => [...q]); a.rect = bounds(a.quads.flatMap(quadPoints)); }
      if (kind === 'ink') { a.strokes = x.getInkList().map((s) => s.map((p) => [p[0], p[1]])); a.rect = bounds(a.strokes.flat()); }
      if (kind === 'line') {
        const [p, q] = x.getLine();
        a.line = [p[0], p[1], q[0], q[1]]; a.rect = bounds([[p[0], p[1]], [q[0], q[1]]]);
        if (/Arrow/.test(x.getLineEndingStyles().end)) a.kind = kind = 'arrow';
      }
      if (kind === 'note') a.rect = noteBox(page, a.rect, 1);
      a.color = toHex(color, kind);
      out.push(a);
    });
    page.destroy();
  }
  return out;
}

type Arabic = { doc: MuPDF.PDFDocument; writer: ReturnType<typeof pageWriter>; fonts: Fonts; used: boolean };
const NOT_LATIN = /[^\u0000-\u00ff]/, RTL = /[\u0590-\u08ff]/;

/** A text box whose text Helvetica cannot draw (Arabic): MuPDF's own appearance would be empty in every reader, so the box gets a
 *  picture written by Waraq's Arabic writer (embedded Tajawal, wrapped to the box, right-aligned for Arabic, turned back by the
 *  page's /Rotate so it reads upright), and its /DA names that embedded font so a reader that redraws the box keeps the Arabic. */
function drawText(page: MuPDF.PDFPage, x: MuPDF.PDFAnnotation, a: Annot, rgb: number[], ar: Arabic) {
  const [sw, sh] = [a.rect[2] - a.rect[0], a.rect[3] - a.rect[1]], rot = pageBox(page.getObject()).rot, size = 12, rtl = RTL.test(a.note);
  const rows = wrap((t) => measure(ar.fonts.regular, t, size), a.note, sw - 8);
  const lines = rows.map((text, i) => ({ text, size, color: rgb, x: rtl ? sw - 4 : 4, align: rtl ? 'right' as const : 'left' as const, y: 4 + size * (0.95 + i * 1.2) }));
  const turn = ({ 90: [0, 1, -1, 0, 0, 0], 180: [-1, 0, 0, -1, 0, 0], 270: [0, -1, 1, 0, 0, 0] } as Record<number, number[]>)[rot];
  const ap = ar.doc.addStream(ar.writer.draw({ w: sw, h: sh, lines }), { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, sw, sh], ...(turn ? { Matrix: turn } : {}), Resources: { Font: ar.writer.fonts } });
  const o = x.getObject();
  o.put('AP', { N: ap });
  o.put('DA', ar.doc.newString(`/WqArabic ${size} Tf ${rgb.map((v) => +v.toFixed(3)).join(' ')} rg`));
  ar.used = true;
}

/** Where a sticky note's box stands in the page as seen so that its icon (which hangs from the page-space top-left corner of the box)
 *  appears where the note was put: the box moves back by its size toward the corner the turn sends that anchor to; `sign` -1 writes, +1 reads. */
function noteBox(page: MuPDF.PDFPage, r: Rect, sign: 1 | -1): Rect {
  const rot = pageBox(page.getObject()).rot, dx = (rot === 90 || rot === 180 ? -(r[2] - r[0]) : 0) * -sign, dy = (rot === 180 || rot === 270 ? -(r[3] - r[1]) : 0) * -sign;
  return [r[0] + dx, r[1] + dy, r[2] + dx, r[3] + dy];
}

function create(page: MuPDF.PDFPage, a: Annot, ar?: Arabic) {
  const x = page.createAnnotation(SUBTYPE_OF[a.kind]), rgb = toRgb(a.color);
  if (a.quads) x.setQuadPoints(a.quads as MuPDF.Quad[]);
  if (a.strokes) x.setInkList(a.strokes as MuPDF.Point[][]);
  if (a.line) { x.setLine([a.line[0], a.line[1]], [a.line[2], a.line[3]]); x.setLineEndingStyles('None', a.kind === 'arrow' ? 'ClosedArrow' : 'None'); }
  if (a.kind === 'note') x.setRect(noteBox(page, a.rect, -1));
  else if (['square', 'circle', 'text'].includes(a.kind)) x.setRect(a.rect);
  if (a.kind === 'text') { x.setDefaultAppearance('Helv', 12, rgb); x.setBorderWidth(0); } else x.setColor(rgb);
  if (['ink', 'square', 'circle', 'line', 'arrow'].includes(a.kind)) x.setBorderWidth(2);
  if (a.kind === 'note') x.setIcon('Comment');
  if (a.note) x.setContents(a.note);
  x.update();
  if (a.kind === 'text' && a.note && ar && NOT_LATIN.test(a.note)) drawText(page, x, a, rgb, ar);
}

/** The file with the comments at `remove` (page + position in the page, as listed) taken out and `add` written. */
export function applyAnnots(m: typeof MuPDF, bytes: Uint8Array, remove: { page: number; src: number }[], add: Annot[], fonts?: Fonts): Uint8Array {
  const doc = m.Document.openDocument(bytes, 'application/pdf').asPDF()!, ar: Arabic | undefined = fonts ? { doc, writer: pageWriter(m, doc, fonts), fonts, used: false } : undefined;
  for (const p of new Set([...remove.map((r) => r.page), ...add.map((a) => a.page)])) {
    const page = doc.loadPage(p) as MuPDF.PDFPage, all = [...page.getAnnotations()]; // copy: deleting edits the page's own list
    for (const r of remove) if (r.page === p) page.deleteAnnotation(all[r.src]);
    for (const a of add) if (a.page === p) create(page, a, ar);
    page.destroy();
  }
  if (ar?.used) { // the letter map of the font, and its name in the form's resources (the /DA of a drawn box points at it)
    ar.writer.finish();
    let form = doc.getTrailer().get('Root', 'AcroForm');
    if (!form.isDictionary()) { form = doc.newDictionary(); form.put('Fields', doc.newArray()); doc.getTrailer().get('Root').put('AcroForm', form); }
    let dr = form.get('DR'); if (!dr.isDictionary()) { dr = doc.newDictionary(); form.put('DR', dr); }
    let fnt = dr.get('Font'); if (!fnt.isDictionary()) { fnt = doc.newDictionary(); dr.put('Font', fnt); }
    fnt.put('WqArabic', ar.writer.fonts.WqT0);
  }
  return doc.saveToBuffer('garbage=compact,compress').asUint8Array().slice();
}
