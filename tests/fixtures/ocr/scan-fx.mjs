// Scanner and photocopier effects on an 8-bit grey picture (w x h bytes), and the wrapping of such a picture into a
// picture-only PDF page like a scan. Shared by make-ocr-set.mjs (synthetic pages) and tools/get-ocr-set.mjs (real pages).
import { assemble } from '../../../src/lib/engine/assemble.ts';

export const blur = (px, w, h, r) => { // box blur, radius r, separable
  const tmp = new Uint8Array(px.length), n = 2 * r + 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let k = -r; k <= r; k++) s += px[y * w + Math.min(w - 1, Math.max(0, x + k))]; tmp[y * w + x] = s / n; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let k = -r; k <= r; k++) s += tmp[Math.min(h - 1, Math.max(0, y + k)) * w + x]; px[y * w + x] = s / n; }
};
let seed = 7; const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; // mulberry32: repeatable, no stripes
export const noise = (px, w, h, sigma) => { for (let i = 0; i < px.length; i++) { const g = Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd()); px[i] = Math.min(255, Math.max(0, px[i] + g * sigma)); } };
export const fade = (px, w, h, lo, hi) => { for (let i = 0; i < px.length; i++) px[i] = lo + (px[i] * (hi - lo)) / 255; }; // low contrast
export const tilt = (px, w, h, deg) => { // turned by deg about the centre, bilinear, white outside
  const out = new Uint8Array(px.length), c = Math.cos((deg * Math.PI) / 180), s = Math.sin((deg * Math.PI) / 180), cx = w / 2, cy = h / 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = c * (x - cx) + s * (y - cy) + cx, sy = -s * (x - cx) + c * (y - cy) + cy, x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0;
    const at = (i, j) => (i < 0 || j < 0 || i >= w || j >= h ? 255 : px[j * w + i]);
    out[y * w + x] = (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
  }
  px.set(out);
};
const effects = { blur, noise, fade, tilt };

/** A grey pixmap with `fx` (each [name, ...args]) applied, as a picture-only PDF page `w` x `h` points (deflated). */
export function scanPdf(m, pix, fx, w, h) {
  const px = pix.getPixels(), pw = pix.getWidth(), ph = pix.getHeight();
  for (const [f, ...a] of fx) effects[f](px, pw, ph, ...a);
  const png = pix.asPNG(), photo = { doc: m.Document.openDocument(png, 'image/png'), bytes: png };
  const pdf = assemble(m, () => photo, { items: [{ doc: 1, page: 0, fit: { w, h } }] });
  return m.Document.openDocument(pdf, 'application/pdf').asPDF().saveToBuffer('compress').asUint8Array();
}

/** A picture file (PNG/JPEG, a real scan) as a picture-only PDF page, `dpi` deciding the page size in points. */
export function pictureAsPdf(m, bytes, dpi) {
  const img = new m.Image(bytes), w = (img.getWidth() * 72) / dpi, h = (img.getHeight() * 72) / dpi;
  const pdf = assemble(m, () => ({ doc: m.Document.openDocument(bytes, 'image/jpeg'), bytes }), { items: [{ doc: 1, page: 0, fit: { w, h } }] });
  return m.Document.openDocument(pdf, 'application/pdf').asPDF().saveToBuffer('compress').asUint8Array();
}
