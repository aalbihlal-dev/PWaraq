// Builds a new PDF from a list of pages taken from open sources (PDFs or images). Used by Organize (one file,
// re-arranged) and Portfolio (many files in sections). Pure: the MuPDF module and the sources are passed in, so the
// same code runs in the engine worker and in the Node self-check (tests/unit/assemble.test.mjs).
import type * as MuPDF from '../../../engine/mupdf-wasm/dist/mupdf.js';
import { pageWriter, dividerPage, tocPages, type Fonts, type TextPage } from './textpage.ts';

/** One output page: page `page` of source `doc`, turned by `rotate` degrees more (an image source fills `fit`, in
 *  points); or a blank page of size `fit`; or a page Waraq writes: a section divider or one page of contents. */
export type Item = { doc?: number; page?: number; rotate?: number; fit?: { w: number; h: number }; blank?: boolean;
  divider?: Parameters<typeof dividerPage>[0]; toc?: Parameters<typeof tocPages>[0] };
export type Build = { items: Item[]; bookmarks?: { title: string; at: number }[]; numbers?: boolean | number[] };
export type Source = { doc: MuPDF.Document; bytes: Uint8Array };

export function assemble(m: typeof MuPDF, source: (id: number) => Source, b: Build, fonts?: () => Fonts): Uint8Array {
  const out = new m.PDFDocument(), images = new Map<number, MuPDF.PDFObject>();
  const page = (it: Item): TextPage | undefined => it.divider ? dividerPage(it.divider) : it.toc ? tocPages(it.toc, fonts!().regular)[0] : undefined;
  const made = b.items.map(page), writer = made.some(Boolean) ? pageWriter(m, out, fonts!()) : null;
  b.items.forEach((it, i) => {
    if (made[i]) out.insertPage(-1, writer!.add(made[i]!));
    else if (it.blank) out.insertPage(-1, out.addPage([0, 0, it.fit!.w, it.fit!.h], 0, {}, ''));
    else {
      const s = source(it.doc!), pdf = s.doc.asPDF();
      if (pdf) out.graftPage(-1, pdf, it.page!);
      else imagePage(m, out, images, it, s.bytes);
    }
    const p = out.findPage(i), r = p.getInheritable('Rotate');
    p.put('Rotate', (((r.isNumber() ? r.asNumber() : 0) + (it.rotate ?? 0)) % 360 + 360) % 360);
  });
  writer?.finish();
  // contents rows open their page (written pages are not turned, so their link boxes are page coordinates)
  made.forEach((t, i) => {
    if (!t?.links?.length) return;
    const p = out.loadPage(i) as MuPDF.PDFPage;
    for (const l of t.links) p.createLink(l.rect as MuPDF.Rect, out.formatLinkURI(new m.LinkDestination(0, l.to, 'Fit')));
  });
  // numbers: on every page (`true`) or on some pages only, counting from 1 within them (one section)
  const numbered = b.numbers === true ? b.items.map((_, i) => i) : Array.isArray(b.numbers) ? b.numbers : [];
  numbered.forEach((page, n) => pageNumber(m, out, page, n + 1));
  if (b.bookmarks?.length) {
    const outline = out.outlineIterator();
    for (const bm of b.bookmarks) outline.insert({ title: bm.title, uri: out.formatLinkURI(new m.LinkDestination(0, bm.at, 'Fit')), open: false });
  }
  return out.saveToBuffer('garbage=compact').asUint8Array().slice();
}

// A photo or scan as a page: the page has the neighbouring pages' size (`fit`), the image fills it keeping its shape.
function imagePage(m: typeof MuPDF, out: MuPDF.PDFDocument, images: Map<number, MuPDF.PDFObject>, it: Item, bytes: Uint8Array) {
  const img = new m.Image(bytes);
  const iw = (img.getWidth() * 72) / (img.getXResolution() || 96), ih = (img.getHeight() * 72) / (img.getYResolution() || 96);
  const pw = it.fit?.w ?? iw, ph = it.fit?.h ?? ih, k = Math.min(pw / iw, ph / ih), w = iw * k, h = ih * k;
  let ref = images.get(it.doc!);
  if (!ref) images.set(it.doc!, (ref = out.addImage(img)));
  const page = out.addPage([0, 0, pw, ph], 0, { XObject: { Im0: ref } }, `q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${((pw - w) / 2).toFixed(2)} ${((ph - h) / 2).toFixed(2)} cm /Im0 Do Q`);
  out.insertPage(-1, page);
}

// "n" centred at the bottom of the page as it is seen (the page's own Rotate taken into account).
let numberFont: MuPDF.PDFObject | null = null, fontOwner: MuPDF.PDFDocument | null = null;
function pageNumber(m: typeof MuPDF, out: MuPDF.PDFDocument, i: number, n: number) {
  if (fontOwner !== out) { fontOwner = out; numberFont = out.addSimpleFont(new m.Font('Helvetica')); }
  const p = out.findPage(i), crop = p.getInheritable('CropBox'), box = crop.isArray() ? crop : p.getInheritable('MediaBox');
  const v = [0, 1, 2, 3].map((k) => box.get(k).asNumber());
  const [x0, y0, x1, y1] = [Math.min(v[0], v[2]), Math.min(v[1], v[3]), Math.max(v[0], v[2]), Math.max(v[1], v[3])];
  const r = p.getInheritable('Rotate'), rot = r.isNumber() ? r.asNumber() : 0;
  const label = String(n), size = 10, half = (label.length * 0.556 * size) / 2, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, gap = 20;
  const tm = ({ 0: [1, 0, 0, 1, cx - half, y0 + gap], 90: [0, 1, -1, 0, x1 - gap, cy - half], 180: [-1, 0, 0, -1, cx + half, y1 - gap], 270: [0, -1, 1, 0, x0 + gap, cy + half] } as Record<number, number[]>)[rot] ?? [1, 0, 0, 1, cx - half, y0 + gap];
  stamp(out, p, `q BT /WaraqN ${size} Tf 0.37 0.45 0.41 rg ${tm.map((n) => +n.toFixed(2)).join(' ')} Tm (${label}) Tj ET Q`, { Font: { WaraqN: numberFont! } });
}

/** Draws `ops` on top of page `p`, adding `resources` (e.g. { Font: { Name: ref } }) to the page's resources. The page's
 *  own drawing is wrapped in q … Q so its graphics state cannot move or recolour what is added. */
export function stamp(out: MuPDF.PDFDocument, p: MuPDF.PDFObject, ops: string, resources: Record<string, Record<string, MuPDF.PDFObject>>) {
  let res = p.getInheritable('Resources');
  if (!res.isDictionary()) { res = out.newDictionary(); p.put('Resources', res); }
  for (const [kind, named] of Object.entries(resources)) {
    let dict = res.get(kind);
    if (!dict.isDictionary()) { dict = out.newDictionary(); res.put(kind, dict); }
    for (const [name, ref] of Object.entries(named)) dict.put(name, ref);
  }
  const contents = p.get('Contents'), all = out.newArray();
  all.push(out.addStream('q\n', {}));
  if (contents.isArray()) contents.forEach((c) => all.push(c)); else if (!contents.isNull()) all.push(contents);
  all.push(out.addStream(`\nQ ${ops}\n`, {}));
  p.put('Contents', all);
}
