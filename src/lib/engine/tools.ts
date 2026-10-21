// Everyday whole-document tools on top of MuPDF: crop, page numbers, watermark, compress, protect, unlock.
// Pure (MuPDF passed in) so the Node self-check (tests/unit/tools.test.mjs) runs the same code as the engine worker.
// "Seen" coordinates = the page as it is shown: origin bottom-left, x right, y up, after the page's Rotate and CropBox.
import type * as MuPDF from '../../../engine/mupdf-wasm/dist/mupdf.js';
import { pageWriter, measure, type Fonts } from './textpage.ts';
import { stamp } from './assemble.ts';

const num = (v: number) => +v.toFixed(3);

/** The page's visible box (CropBox, else MediaBox) and turn. */
export function pageBox(p: MuPDF.PDFObject) {
  const crop = p.getInheritable('CropBox'), box = crop.isArray() ? crop : p.getInheritable('MediaBox');
  const v = [0, 1, 2, 3].map((k) => box.get(k).asNumber());
  const r = p.getInheritable('Rotate'), rot = ((((r.isNumber() ? r.asNumber() : 0) % 360) + 360) % 360);
  const b = [Math.min(v[0], v[2]), Math.min(v[1], v[3]), Math.max(v[0], v[2]), Math.max(v[1], v[3])];
  const w = b[2] - b[0], h = b[3] - b[1];
  return { box: b, rot, seenW: rot % 180 ? h : w, seenH: rot % 180 ? w : h };
}

/** Matrix from seen coordinates to the page's own (user) coordinates. */
export function seenMatrix(box: number[], rot: number): number[] {
  const [x0, y0, x1, y1] = box;
  return ({ 0: [1, 0, 0, 1, x0, y0], 90: [0, 1, -1, 0, x1, y0], 180: [-1, 0, 0, -1, x1, y1], 270: [0, -1, 1, 0, x0, y1] } as Record<number, number[]>)[rot] ?? [1, 0, 0, 1, x0, y0];
}
const apply = (m: number[], x: number, y: number) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/** Crops page `p` to `f` = [left, top, right, bottom] as fractions of the page as seen (top-down, 0..1). */
export function crop(p: MuPDF.PDFObject, f: number[]) {
  const { box, rot, seenW, seenH } = pageBox(p), m = seenMatrix(box, rot);
  const a = apply(m, f[0] * seenW, (1 - f[1]) * seenH), b = apply(m, f[2] * seenW, (1 - f[3]) * seenH);
  p.put('CropBox', [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])].map(num));
}

export type NumberStyle = { position?: 'bl' | 'bc' | 'br' | 'tl' | 'tc' | 'tr'; start?: number; total?: boolean; size?: number; digits?: 'latn' | 'arab' };
const indic = (s: string) => s.replace(/[0-9]/g, (d) => String.fromCharCode(0x660 + +d));
/** Page numbers on `pages` (indices), counting from `start`; "n / N" when `total` ("٣ من ١٠" in Arabic-Indic digits, which are drawn with the
 *  Arabic font, so `fonts` is needed for them). Upright on turned pages. The size grows with the page (10 pt on A4, 14 pt on A3) and each
 *  number has a thin white halo, so it stays readable on a dark slide, a photo or a drawing's frame. */
export function pageNumbers(m: typeof MuPDF, out: MuPDF.PDFDocument, pages: number[], style: NumberStyle = {}, fonts?: Fonts) {
  const arab = style.digits === 'arab' && !!fonts, writer = arab ? pageWriter(m, out, fonts!) : null, font = arab ? null : out.addSimpleFont(new m.Font('Helvetica'));
  const pos = style.position ?? 'bc', start = style.start ?? 1, last = start + pages.length - 1;
  pages.forEach((i, n) => {
    const p = out.findPage(i), { box, rot, seenW, seenH } = pageBox(p), k = Math.min(2.4, Math.max(1, Math.min(seenW, seenH) / 595)), size = style.size ?? 10 * k, gap = 20 * k;
    const plain = style.total ? (arab ? `${start + n} من ${last}` : `${start + n} / ${last}`) : String(start + n), label = arab ? indic(plain) : plain;
    const width = arab ? measure(fonts!.regular, label, size) : [...label].reduce((w, c) => w + (c === ' ' || c === '/' ? 0.278 : 0.556), 0) * size;
    const x = pos[1] === 'l' ? gap : pos[1] === 'r' ? seenW - gap - width : (seenW - width) / 2;
    const y = pos[0] === 'b' ? gap : seenH - gap - size;
    const halo = size * 0.2;
    // a white outline first, then the number over it
    const ops = writer
      ? ((o) => `q ${o.replace(/BT /g, `BT 1 Tr ${num(halo)} w 1 1 1 RG `)} Q ${o}`)(writer.draw({ w: 0, h: seenH, lines: [{ text: label, x, y: seenH - y, size, color: [0.33, 0.41, 0.37] }] }))
      : `BT /WqN ${num(size)} Tf 1 Tr ${num(halo)} w 1 1 1 RG 1 0 0 1 ${num(x)} ${num(y)} Tm (${label}) Tj ET BT /WqN ${num(size)} Tf 0 Tr 0.33 0.41 0.37 rg 1 0 0 1 ${num(x)} ${num(y)} Tm (${label}) Tj ET`;
    stamp(out, p, `q ${seenMatrix(box, rot).map(num).join(' ')} cm ${ops} Q`, { Font: writer ? writer.fonts : { WqN: font! } });
  });
  writer?.finish();
}

export type Watermark = { text: string; size?: number; opacity?: number; angle?: number; color?: number[]; tile?: boolean };
/** A text watermark (real text, Arabic too) across the middle of each page in `pages`, see-through; with `tile` repeated over the whole page
 *  (rows offset by half a step) in a smaller size, so a whole-page mark cannot be cropped away. */
export function watermark(m: typeof MuPDF, out: MuPDF.PDFDocument, fonts: Fonts, pages: number[], w: Watermark) {
  const writer = pageWriter(m, out, fonts), gs = out.addObject({ Type: 'ExtGState', ca: w.opacity ?? 0.2, CA: w.opacity ?? 0.2 });
  const a = ((w.angle ?? 45) * Math.PI) / 180, c = num(Math.cos(a)), s = num(Math.sin(a));
  for (const i of pages) {
    const p = out.findPage(i), { box, rot, seenW, seenH } = pageBox(p);
    // size: as asked, but never wider than the page's diagonal allows
    let size = w.size ?? (w.tile ? 36 : 72);
    const wide = measure(fonts.bold, w.text, size), room = Math.hypot(seenW, seenH) * (w.tile ? 0.5 : 0.8);
    if (wide > room) size *= room / wide;
    const color = w.color ?? [0.082, 0.467, 0.365], lines = [];
    if (w.tile) { // a grid in the turned frame, centred on the page, reaching past its corners
      const width = measure(fonts.bold, w.text, size), sx = width + size * 2.5, sy = size * 3.6, half = Math.hypot(seenW, seenH) / 2;
      for (let r = -Math.ceil(half / sy); r <= Math.ceil(half / sy); r++) for (let q = -Math.ceil(half / sx) - 1; q <= Math.ceil(half / sx) + 1; q++) lines.push({ text: w.text, x: q * sx + (r % 2 ? sx / 2 : 0), y: r * sy + size * 0.35, size, bold: true, align: 'center' as const, color });
    } else lines.push({ text: w.text, x: 0, y: size * 0.35, size, bold: true, align: 'center' as const, color });
    const ops = writer.draw({ w: 0, h: 0, lines });
    stamp(out, p, `q ${seenMatrix(box, rot).map(num).join(' ')} cm 1 0 0 1 ${num(seenW / 2)} ${num(seenH / 2)} cm ${c} ${s} ${-s} ${c} 0 0 cm /WqG gs ${ops} Q`, { Font: writer.fonts, ExtGState: { WqG: gs } });
  }
  writer.finish();
}

export type CompressLevel = 'recommended' | 'small';
/** Smaller file: photos larger than needed are scaled down and saved as JPEG; unused objects removed, streams packed.
 *  Text, vector drawings (CAD lines) and fonts are untouched. Returns the original bytes when nothing got smaller. */
export function compress(m: typeof MuPDF, bytes: Uint8Array, level: CompressLevel = 'recommended', password = ''): Uint8Array {
  const doc = open(m, bytes, password);
  const long = level === 'small' ? 1400 : 2200, quality = level === 'small' ? 55 : 72, seen = new Set<number>();
  const visit = (res: MuPDF.PDFObject) => {
    const xo = res.isDictionary() ? res.get('XObject') : null;
    if (!xo?.isDictionary()) return;
    xo.forEach((v) => {
      if (!v.isIndirect() || seen.has(v.asIndirect())) return;
      seen.add(v.asIndirect());
      const kind = v.get('Subtype').asName();
      if (kind === 'Form') return visit(v.get('Resources'));
      if (kind !== 'Image' || v.get('ImageMask').asBoolean() || !v.get('SMask').isNull() || !v.get('Mask').isNull()) return;
      const w = v.get('Width').asNumber(), h = v.get('Height').asNumber(), bpc = v.get('BitsPerComponent').asNumber();
      const jpeg = v.get('Filter').isName() && v.get('Filter').asName() === 'DCTDecode';
      if (bpc === 1 || w * h < 200_000 || (jpeg && Math.max(w, h) <= long)) return; // line art, icons, already fine
      try {
        let pix = doc.loadImage(v).toPixmap();
        const gray = pix.getNumberOfComponents() === 1;
        if (!gray && pix.getNumberOfComponents() !== 3) pix = pix.convertToColorSpace(m.ColorSpace.DeviceRGB);
        const k = Math.min(1, long / Math.max(w, h)), nw = Math.max(1, Math.round(w * k)), nh = Math.max(1, Math.round(h * k));
        if (k < 1) pix = pix.warp([[0, 0], [w, 0], [w, h], [0, h]], nw, nh);
        const out = pix.asJPEG(quality);
        if (out.length >= v.readRawStream().asUint8Array().length * 0.9) return; // not worth it
        v.writeRawStream(out);
        v.put('Filter', 'DCTDecode'); v.delete('DecodeParms'); v.delete('Decode');
        v.put('Width', nw); v.put('Height', nh); v.put('BitsPerComponent', 8); v.put('ColorSpace', gray ? 'DeviceGray' : 'DeviceRGB');
      } catch {} // an image MuPDF cannot decode stays as it is
    });
  };
  for (let i = 0; i < doc.countPages(); i++) visit(doc.findPage(i).getInheritable('Resources'));
  const g = guardOf(m, bytes, password); // the copy keeps the source's protection
  let smaller: Uint8Array = doc.saveToBuffer('garbage=4,compress,compress-fonts,compress-images' + (g ? ',decrypt' : '')).asUint8Array().slice();
  if (g) smaller = sealLike(m, smaller, g);
  return smaller.length < bytes.length ? smaller : bytes;
}

const FULL = 0xf3c; // permission bits 3-6 and 9-12: print, modify, copy, annotate, fill forms, accessibility, assemble, print high quality
const open = (m: typeof MuPDF, bytes: Uint8Array, password = '') => {
  const doc = m.Document.openDocument(bytes, 'application/pdf').asPDF()!;
  if (doc.needsPassword() && !doc.authenticatePassword(password)) throw new Error('WRONG_PASSWORD');
  return doc;
};

/** How a file is protected: algorithm (as MuPDF names it), permissions, and whether `password` is the owner password. */
export type Guard = { how: string; perms: number; restricted: boolean; owner: boolean; password: string };
/** The protection of `bytes` opened with `password`; null when the file is not encrypted. */
export function guardOf(m: typeof MuPDF, bytes: Uint8Array, password = ''): Guard | null {
  const doc = m.Document.openDocument(bytes, 'application/pdf').asPDF()!, enc = doc.getTrailer().get('Encrypt');
  if (!enc.isDictionary()) return null;
  const auth = doc.needsPassword() ? doc.authenticatePassword(password) : doc.authenticatePassword('');
  const c = enc.get('CF', 'StdCF', 'CFM'), l = enc.get('Length'), cfm = c.isName() ? c.asName() : '', bits = l.isNumber() ? l.asNumber() : 40;
  const how = cfm === 'AESV3' ? 'aes-256' : cfm === 'AESV2' ? 'aes-128' : bits > 40 ? 'rc4-128' : 'rc4-40';
  const perms = enc.get('P').asNumber();
  return { how, perms, restricted: (perms & FULL) !== FULL, owner: !!(auth & 4), password };
}

/** `out` (unprotected bytes) saved with the same protection as the source: algorithm, user password, permissions.
 *  The owner password stays the source's only when it was the one typed; otherwise nobody knows it, as for any copy. */
export function sealLike(m: typeof MuPDF, out: Uint8Array, g: Guard): Uint8Array {
  if (/,/.test(g.password)) throw new Error('BAD_PASSWORD'); // MuPDF's save options are comma separated
  const owner = g.owner && g.password ? g.password : Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
  return m.Document.openDocument(out, 'application/pdf').asPDF()!
    .saveToBuffer(`encrypt=${g.how},user-password=${g.password},owner-password=${owner},permissions=${g.perms},garbage`).asUint8Array().slice();
}

/** The new copy `out` of the file `src` opened with `password`: protected like the source (Extract, Split, Save as copy). */
export function sealLikeSource(m: typeof MuPDF, out: Uint8Array, src: Uint8Array, password = ''): Uint8Array {
  const g = guardOf(m, src, password);
  return g ? sealLike(m, out, g) : out;
}

/** Refuses an operation that would strip the password or limits of a file unless `password` is its owner password. */
export function mayStrip(m: typeof MuPDF, bytes: Uint8Array, password = '') {
  const g = guardOf(m, bytes, password);
  if (g?.restricted && !g.owner) throw new Error('NEED_OWNER');
}

/** Password protection (AES-256). Anyone opening needs `password`; the owner password allows changing permissions.
 *  `current`: the password of the file when it is already protected (needs its owner password if it has limits). */
export function protect(m: typeof MuPDF, bytes: Uint8Array, password: string, allowPrint = true, allowCopy = false, current = ''): Uint8Array {
  if (!password || /[,]/.test(password)) throw new Error('BAD_PASSWORD'); // MuPDF's save options are comma separated
  mayStrip(m, bytes, current);
  const doc = open(m, bytes, current);
  const owner = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
  // permission bits (PDF spec): 3 print, 5 copy, 12 high-quality print; the rest stay off
  const perms = allowPrint && allowCopy ? -1 : (allowPrint ? (1 << 2) | (1 << 11) : 0) | (allowCopy ? 1 << 4 : 0) | ~0xfff; // nothing withheld: the password alone
  return doc.saveToBuffer(`encrypt=aes-256,user-password=${password},owner-password=${owner},permissions=${perms},garbage`).asUint8Array().slice();
}

/** The same file without its password (the password must be right; a file with limits needs its owner password). */
export function unlock(m: typeof MuPDF, bytes: Uint8Array, password: string): Uint8Array {
  const doc = open(m, bytes, password);
  mayStrip(m, bytes, password);
  return doc.saveToBuffer('decrypt,garbage').asUint8Array().slice();
}
