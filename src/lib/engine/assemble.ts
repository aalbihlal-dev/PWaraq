// Builds a new PDF from a list of pages taken from open sources (PDFs or images). Used by Organize (one file,
// re-arranged) and Portfolio (many files in sections). Pure: the MuPDF module and the sources are passed in, so the
// same code runs in the engine worker and in the Node self-check (tests/unit/assemble.test.mjs).
import type * as MuPDF from '../../../engine/mupdf-wasm/dist/mupdf.js';
import { pageWriter, tocPages, measure, type Fonts, type TextPage } from './textpage.ts';
import { dividerPage, coverPage, paperPage, type Paper } from './designs.ts';
import { crop, pageNumbers, watermark, type NumberStyle, type Watermark } from './tools.ts';

/** One output page: page `page` of source `doc`, turned by `rotate` degrees more (an image source fills `fit`, in
 *  points); or a blank page of size `fit`; or a page Waraq writes: a section divider or one page of contents. */
export type Item = { doc?: number; page?: number; rotate?: number; fit?: { w: number; h: number }; blank?: boolean; crop?: number[];
  paper?: Paper; cover?: Parameters<typeof coverPage>[0];
  divider?: Parameters<typeof dividerPage>[0]; toc?: Parameters<typeof tocPages>[0] };
export type Build = { items: Item[]; bookmarks?: { title: string; at: number }[]; numbers?: boolean | number[]; numberStyle?: NumberStyle;
  watermark?: Watermark & { pages?: number[] };
  meta?: Meta }; // document properties written into the new file: its title, author and subject, and the language it is in
/** What a reader shows as the document's name (the tab / title bar, file properties) and what screen readers announce. */
export type Meta = { title?: string; author?: string; subject?: string; lang?: 'ar' | 'en' };
export type Source = { doc: MuPDF.Document; bytes: Uint8Array };

export function assemble(m: typeof MuPDF, source: (id: number) => Source, b: Build, fonts?: () => Fonts): Uint8Array {
  const out = new m.PDFDocument(), images = new Map<number, MuPDF.PDFObject>();
  const measuring = (t: string, size: number, bold: boolean) => measure(bold ? fonts!().bold : fonts!().regular, t, size); // long titles on cover and section pages wrap by it
  const page = (it: Item): TextPage | undefined => it.cover ? coverPage({ ...it.cover, measure: measuring }) : it.divider ? dividerPage({ ...it.divider, measure: measuring }) : it.toc ? tocPages(it.toc, fonts!().regular)[0]
    : it.blank && it.paper && it.paper !== 'plain' ? paperPage(it.fit!.w, it.fit!.h, it.paper) : undefined;
  const made = b.items.map(page), writer = made.some(Boolean) ? pageWriter(m, out, fonts!()) : null;
  // a background photo (cover): scaled to fill its box, cropped to it; then the see-through colour over it
  const under = (t: TextPage) => {
    if (!t.background && !t.veil) return undefined;
    let ops = '';
    const res: Record<string, Record<string, MuPDF.PDFObject>> = {}, f = (v: number) => v.toFixed(2);
    if (t.background) {
      const g = t.background;
      let ref = images.get(g.doc);
      if (!ref) images.set(g.doc, (ref = out.addImage(new m.Image(source(g.doc).bytes))));
      const o = out.loadImage(ref), s = Math.max(g.w / o.getWidth(), g.h / o.getHeight()), w = o.getWidth() * s, h = o.getHeight() * s;
      const y0 = t.h - g.y - g.h;
      ops += `q ${f(g.x)} ${f(y0)} ${f(g.w)} ${f(g.h)} re W n ${f(w)} 0 0 ${f(h)} ${f(g.x + (g.w - w) / 2)} ${f(y0 + (g.h - h) / 2)} cm /WqB Do Q
`;
      res.XObject = { WqB: ref };
    }
    if (t.veil) {
      const v = t.veil;
      res.ExtGState = { WqV: out.addObject({ Type: 'ExtGState', ca: v.alpha }) };
      ops += `q /WqV gs ${v.color.map(f).join(' ')} rg ${f(v.x)} ${f(t.h - v.y - v.h)} ${f(v.w)} ${f(v.h)} re f Q
`;
    }
    return { ops, res };
  };
  b.items.forEach((it, i) => {
    if (made[i]) out.insertPage(-1, writer!.add(made[i]!, under(made[i]!)));
    else if (it.blank) out.insertPage(-1, out.addPage([0, 0, it.fit!.w, it.fit!.h], 0, {}, ''));
    else {
      const s = source(it.doc!), pdf = s.doc.asPDF();
      if (pdf) out.graftPage(-1, pdf, it.page!);
      else imagePage(m, out, images, it, s.bytes);
    }
    const p = out.findPage(i), r = p.getInheritable('Rotate');
    p.put('Rotate', (((r.isNumber() ? r.asNumber() : 0) + (it.rotate ?? 0)) % 360 + 360) % 360);
    if (it.crop) crop(p, it.crop);
  });
  writer?.finish();
  // logos on written pages: each image keeps its shape inside its box (left / centre / right aligned)
  made.forEach((t, i) => {
    if (!t?.images?.length) return;
    let ops = ''; const xo: Record<string, MuPDF.PDFObject> = {};
    t.images.forEach((im, n) => {
      let ref = images.get(im.doc);
      if (!ref) images.set(im.doc, (ref = out.addImage(new m.Image(source(im.doc).bytes))));
      const o = out.loadImage(ref), iw = o.getWidth(), ih = o.getHeight(), s = Math.min(im.w / iw, im.h / ih), w = iw * s, h = ih * s;
      const x = im.align === 'left' ? im.x : im.align === 'right' ? im.x + im.w - w : im.x + (im.w - w) / 2, y = t.h - im.y - (im.h + h) / 2;
      ops += `q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /WqL${n} Do Q `;
      xo['WqL' + n] = ref;
    });
    stamp(out, out.findPage(i), ops, { XObject: xo });
  });
  // contents rows open their page (written pages are not turned, so their link boxes are page coordinates)
  made.forEach((t, i) => {
    if (!t?.links?.length) return;
    const p = out.loadPage(i) as MuPDF.PDFPage;
    for (const l of t.links) p.createLink(l.rect as MuPDF.Rect, out.formatLinkURI(new m.LinkDestination(0, l.to, 'Fit')));
  });
  // numbers: on every page (`true`) or on some pages only, counting from 1 within them (one section)
  const numbered = b.numbers === true ? b.items.map((_, i) => i) : Array.isArray(b.numbers) ? b.numbers : [];
  if (numbered.length) pageNumbers(m, out, numbered, b.numberStyle);
  if (b.watermark?.text.trim()) watermark(m, out, fonts!(), b.watermark.pages ?? b.items.map((_, i) => i), b.watermark);
  if (b.bookmarks?.length) {
    const outline = out.outlineIterator();
    for (const bm of b.bookmarks) outline.insert({ title: bm.title, uri: out.formatLinkURI(new m.LinkDestination(0, bm.at, 'Fit')), open: false });
  }
  if (writer || b.watermark?.text.trim()) out.subsetFonts(); // the bundled Tajawal weights are embedded whole (~120 KB each): keep only the letters used
  if (b.meta) writeMeta(out, b.meta);
  return out.saveToBuffer('garbage=compact').asUint8Array().slice();
}

const xml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Title, author, subject (the file's Info, text strings: UTF-16 for Arabic), the same as an XMP packet (UTF-8), the document language, and
 *  "show the title, not the file name" for viewers. Empty values are left out; with nothing at all the file gets no properties. */
function writeMeta(out: MuPDF.PDFDocument, meta: Meta) {
  const title = meta.title?.trim(), author = meta.author?.trim(), subject = meta.subject?.trim(), root = out.getTrailer().get('Root');
  if (title) out.setMetaData('info:Title', title);
  if (author) out.setMetaData('info:Author', author);
  if (subject) out.setMetaData('info:Subject', subject);
  if (title || author || subject) out.setMetaData('info:Creator', 'Waraq');
  if (meta.lang) root.put('Lang', out.newString(meta.lang));
  if (title) { const vp = out.newDictionary(); vp.put('DisplayDocTitle', true); root.put('ViewerPreferences', vp); }
  if (!(title || author || subject)) return;
  const alt = (tag: string, v: string, l = meta.lang ?? 'x-default') => `<dc:${tag}><rdf:Alt><rdf:li xml:lang="${l}">${xml(v)}</rdf:li></rdf:Alt></dc:${tag}>`;
  const packet = `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/">`
    + (title ? alt('title', title) : '') + (author ? `<dc:creator><rdf:Seq><rdf:li>${xml(author)}</rdf:li></rdf:Seq></dc:creator>` : '') + (subject ? alt('description', subject) : '')
    + `<xmp:CreatorTool>Waraq</xmp:CreatorTool></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="r"?>`;
  root.put('Metadata', out.addStream(packet, { Type: 'Metadata', Subtype: 'XML' }));
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

/** Draws `ops` on top of page `p`, adding `resources` (e.g. { Font: { Name: ref } }) to the page's resources. The page's
 *  own drawing is wrapped in q … Q so its graphics state cannot move or recolour what is added. */
export function stamp(out: MuPDF.PDFDocument, p: MuPDF.PDFObject, ops: string, resources: Record<string, Record<string, MuPDF.PDFObject>>) {
  let res = p.getInheritable('Resources');
  if (!res.isDictionary()) { res = out.newDictionary(); p.put('Resources', res); }
  for (const [kind, named] of Object.entries(resources)) {
    let dict = res.get(kind);
    if (!dict.isDictionary()) { dict = out.newDictionary(); res.put(kind, dict); }
    for (const [name, ref] of Object.entries(named)) {
      // a page Waraq wrote or edited before already has this name (WqT0, WqI0…): the new one gets a free name, else the
      // old text would be drawn with the new font's letter map (and an old photo replaced by the new one)
      let free = name;
      for (let i = 1; !dict.get(free).isNull(); i++) free = `${name}_${i}`;
      if (free !== name) ops = ops.replace(new RegExp(`/${name}(?!\\w)`, 'g'), '/' + free);
      dict.put(free, ref);
    }
  }
  const contents = p.get('Contents'), all = out.newArray();
  all.push(out.addStream('q\n', {}));
  if (contents.isArray()) contents.forEach((c) => all.push(c)); else if (!contents.isNull()) all.push(contents);
  all.push(out.addStream(`\nQ ${ops}\n`, {}));
  p.put('Contents', all);
}
