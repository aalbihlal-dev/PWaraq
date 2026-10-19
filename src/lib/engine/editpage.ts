// The page editor's engine side: what is on a page (text lines, photos) and a page with edits applied — text added,
// photos added, photos moved / resized / replaced / deleted, lines of text replaced. Pure like assemble.ts: the MuPDF
// module is passed in, so the same code runs in the engine worker and in the Node self-check (tests/unit/editpage).
// Coordinates are points on the page as seen (MuPDF page space: top-left origin, the page's own turn applied).
// shortcut: replaced text is written in Tajawal, not in the line's own font; keeping the font comes with HarfBuzz (Phase 3).
import type * as MuPDF from '../../../engine/mupdf-wasm/dist/mupdf.js';
import { pageWriter, wrap, type Fonts, type Line } from './textpage.ts';
import { stamp } from './assemble.ts';

export type Box = { x: number; y: number; w: number; h: number };
export type Align = 'left' | 'center' | 'right';
export type Edit =
  // a text box (`from`: the existing line it replaces, which is removed first); lines wrap at the box width
  | ({ kind: 'text'; text: string; size: number; color: number[]; bold: boolean; align: Align; from?: Box } & Box)
  // a new photo (photos[photo]) filling the box
  | ({ kind: 'photo'; photo: number } & Box)
  // existing photo number `index` (pageObjects order): moved / resized to the box, replaced by photos[photo], or removed
  | ({ kind: 'image'; index: number; from: Box; photo?: number; removed?: boolean } & Box);

/** Text box layout shared with the editor screen: first baseline `BASELINE`·size below the box top, lines `LEADING`·size apart. */
export const LEADING = 1.3, BASELINE = 1.0;

export type PageLine = Box & { text: string; size: number; bold: boolean; color: number[]; rtl: boolean; base: number }; // base: baseline y
/** Lines of text (only the ones that run left to right on the page as seen, which the editor can replace) and photos. */
export function pageObjects(page: MuPDF.Page): { lines: PageLine[]; images: Box[] } {
  const lines: PageLine[] = [], images: Box[] = [], st = page.toStructuredText('preserve-images,preserve-whitespace');
  let line: PageLine | null = null, flat = false;
  st.walk({
    onImageBlock(b) { images.push(box(b)); },
    beginLine(b, _wmode, dir) { flat = Math.abs(dir[1]) < 0.01 && dir[0] > 0; line = { ...box(b), text: '', size: 0, bold: false, color: [0, 0, 0], rtl: false, base: b[3] }; },
    onChar(c, origin, font, size, _q, color) {
      if (!line) return;
      if (!line.text.trim()) Object.assign(line, { size, base: origin[1], bold: /bold|black|heavy/i.test(font.getName()), color: rgb(color) });
      line.text += c;
    },
    endLine() {
      if (line && flat && line.text.trim()) lines.push({ ...line, text: line.text.normalize('NFKC').trim(), rtl: /[֐-ࣿ]/.test(line.text) });
      line = null;
    },
  });
  st.destroy();
  return { lines, images };
}
const box = (b: MuPDF.Rect): Box => ({ x: b[0], y: b[1], w: b[2] - b[0], h: b[3] - b[1] });
const rgb = (c: number[]) => (c.length === 1 ? [c[0], c[0], c[0]] : c.length === 4 ? [0, 1, 2].map((i) => (1 - c[i]) * (1 - c[3])) : c.slice(0, 3));

/** Page `index` of `src` with `edits` applied, as a new one-page PDF. `lift`: only take away what the edits replace (the
 *  editor's background while the moved photos and new text are drawn on top of it). */
export function editPage(m: typeof MuPDF, src: MuPDF.PDFDocument, index: number, edits: Edit[], photos: Uint8Array[], fonts?: () => Fonts, lift = false): MuPDF.PDFDocument {
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
    if (e.kind === 'text' && e.from) redactText.push({ ...e.from, y: e.from.y + e.from.h * 0.15, h: e.from.h * 0.7 }); // a little inside, so the lines above and below stay
  }
  const redact = (boxes: Box[], imageMethod: number, textMethod: number) => {
    if (!boxes.length) return;
    for (const b of boxes) page.createAnnotation('Redact').setRect([b.x, b.y, b.x + b.w, b.y + b.h]);
    page.applyRedactions(false, imageMethod, 0, textMethod);
  };
  redact(redactImages, 1, 1); // remove images there, keep text and lines
  redact(redactText, 0, 0); // remove text there, keep images and lines

  if (!lift) {
    for (const e of edits) if (e.kind === 'photo') { const img = new m.Image(photos[e.photo]); place(out.addImage(img), upright(img, e)); }
    const texts = edits.filter((e): e is Extract<Edit, { kind: 'text' }> => e.kind === 'text' && !!e.text.trim());
    const resources: Record<string, Record<string, MuPDF.PDFObject>> = { XObject: added };
    if (texts.length) {
      const f = fonts!(), writer = pageWriter(m, out, f), lines: Line[] = [];
      for (const e of texts) wrap(e.bold ? f.bold : f.regular, e.text, e.size, e.w).forEach((text, i) => lines.push({
        text, size: e.size, bold: e.bold, color: e.color, align: e.align, y: e.y + (BASELINE + i * LEADING) * e.size,
        x: e.align === 'right' ? e.x + e.w : e.align === 'center' ? e.x + e.w / 2 : e.x,
      }));
      // the writer works top-down on the page as seen; this matrix takes that to the page's own coordinates
      draw.push(`q ${m.Matrix.concat([1, 0, 0, -1, 0, H], inv).map(n).join(' ')} cm ${writer.draw({ w: 0, h: H, lines })} Q`);
      writer.finish();
      resources.Font = writer.fonts;
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
