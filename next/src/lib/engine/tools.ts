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

export type NumberStyle = { position?: 'bl' | 'bc' | 'br' | 'tl' | 'tc' | 'tr'; start?: number; total?: boolean; size?: number };
/** Page numbers on `pages` (indices), counting from `start`; "n / N" when `total`. Upright on turned pages. */
export function pageNumbers(m: typeof MuPDF, out: MuPDF.PDFDocument, pages: number[], style: NumberStyle = {}) {
  const font = out.addSimpleFont(new m.Font('Helvetica')), size = style.size ?? 10, pos = style.position ?? 'bc', start = style.start ?? 1;
  pages.forEach((i, n) => {
    const p = out.findPage(i), { box, rot, seenW, seenH } = pageBox(p);
    const label = style.total ? `${start + n} / ${start + pages.length - 1}` : String(start + n);
    const width = [...label].reduce((w, c) => w + (c === ' ' || c === '/' ? 0.278 : 0.556), 0) * size, gap = 20;
    const x = pos[1] === 'l' ? gap : pos[1] === 'r' ? seenW - gap - width : (seenW - width) / 2;
    const y = pos[0] === 'b' ? gap : seenH - gap - size;
    stamp(out, p, `q ${seenMatrix(box, rot).map(num).join(' ')} cm BT /WqN ${size} Tf 0.33 0.41 0.37 rg 1 0 0 1 ${num(x)} ${num(y)} Tm (${label}) Tj ET Q`, { Font: { WqN: font } });
  });
}

export type Watermark = { text: string; size?: number; opacity?: number; angle?: number; color?: number[] };
/** A text watermark (real text, Arabic too) across the middle of each page in `pages`, see-through. */
export function watermark(m: typeof MuPDF, out: MuPDF.PDFDocument, fonts: Fonts, pages: number[], w: Watermark) {
  const writer = pageWriter(m, out, fonts), gs = out.addObject({ Type: 'ExtGState', ca: w.opacity ?? 0.2, CA: w.opacity ?? 0.2 });
  const a = ((w.angle ?? 45) * Math.PI) / 180, c = num(Math.cos(a)), s = num(Math.sin(a));
  for (const i of pages) {
    const p = out.findPage(i), { box, rot, seenW, seenH } = pageBox(p);
    // size: as asked, but never wider than the page's diagonal allows
    let size = w.size ?? 72;
    const wide = measure(fonts.bold, w.text, size), room = Math.hypot(seenW, seenH) * 0.8;
    if (wide > room) size *= room / wide;
    const ops = writer.draw({ w: 0, h: 0, lines: [{ text: w.text, x: 0, y: size * 0.35, size, bold: true, align: 'center', color: w.color ?? [0.082, 0.467, 0.365] }] });
    stamp(out, p, `q ${seenMatrix(box, rot).map(num).join(' ')} cm 1 0 0 1 ${num(seenW / 2)} ${num(seenH / 2)} cm ${c} ${s} ${-s} ${c} 0 0 cm /WqG gs ${ops} Q`, { Font: writer.fonts, ExtGState: { WqG: gs } });
  }
  writer.finish();
}

export type CompressLevel = 'recommended' | 'small';
/** Smaller file: photos larger than needed are scaled down and saved as JPEG; unused objects removed, streams packed.
 *  Text, vector drawings (CAD lines) and fonts are untouched. Returns the original bytes when nothing got smaller. */
export function compress(m: typeof MuPDF, bytes: Uint8Array, level: CompressLevel = 'recommended'): Uint8Array {
  const doc = m.Document.openDocument(bytes, 'application/pdf').asPDF()!;
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
  const smaller = doc.saveToBuffer('garbage=4,compress,compress-fonts,compress-images').asUint8Array().slice();
  return smaller.length < bytes.length ? smaller : bytes;
}

/** Password protection (AES-256). Anyone opening needs `password`; the owner password allows changing permissions. */
export function protect(m: typeof MuPDF, bytes: Uint8Array, password: string, allowPrint = true, allowCopy = false): Uint8Array {
  if (!password || /[,]/.test(password)) throw new Error('BAD_PASSWORD'); // MuPDF's save options are comma separated
  const doc = m.Document.openDocument(bytes, 'application/pdf').asPDF()!;
  const owner = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
  // permission bits (PDF spec): 3 print, 5 copy, 12 high-quality print; the rest stay off
  const perms = (allowPrint ? (1 << 2) | (1 << 11) : 0) | (allowCopy ? 1 << 4 : 0) | ~0xfff;
  return doc.saveToBuffer(`encrypt=aes-256,user-password=${password},owner-password=${owner},permissions=${perms},garbage`).asUint8Array().slice();
}

/** The same file without its password (the password must be right). */
export function unlock(m: typeof MuPDF, bytes: Uint8Array, password: string): Uint8Array {
  const doc = m.Document.openDocument(bytes, 'application/pdf').asPDF()!;
  if (doc.needsPassword() && !doc.authenticatePassword(password)) throw new Error('WRONG_PASSWORD');
  return doc.saveToBuffer('decrypt,garbage').asUint8Array().slice();
}
