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
// --- v3 kinds of scan (each in place unless it returns a new picture) ---
const sample = (px, w, h, sx, sy) => { // bilinear, white outside
  const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0, at = (i, j) => (i < 0 || j < 0 || i >= w || j >= h ? 255 : px[j * w + i]);
  return (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
};
export const shadow = (px, w, h, dark = 0.45) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px[y * w + x] *= 1 - dark * (x / w) * (0.4 + 0.6 * (y / h)); }; // one corner in shade
export const uneven = (px, w, h, dark = 0.35) => { const cx = w / 2, cy = h / 2; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px[y * w + x] *= 1 - dark * Math.hypot((x - cx) / cx, (y - cy) / cy) / 1.4; }; // lamp in the middle
export const perspective = (px, w, h, k = 0.08) => { // phone held at an angle: the top narrower than the bottom (keystone)
  const out = new Uint8Array(px.length);
  for (let y = 0; y < h; y++) { const t = y / h, sh = k * w * (1 - t); for (let x = 0; x < w; x++) { const sx = sh + (x / w) * (w - 2 * sh) * 1.0; out[y * w + x] = sample(px, w, h, (x - sh) / (1 - 2 * sh / w), y); } void sh; }
  px.set(out);
};
export const curve = (px, w, h, amp = 0.03) => { // a book's spine: lines bend near the left edge and the page darkens there
  const out = new Uint8Array(px.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const u = Math.max(0, 1 - x / (0.3 * w)); out[y * w + x] = sample(px, w, h, x, y - amp * h * u * u) * (1 - 0.4 * u * u); }
  px.set(out);
};
export const onebit = (px, w, h, t = 128) => { for (let i = 0; i < px.length; i++) px[i] = px[i] < t ? 0 : 255; }; // 1-bit black and white
export const bleed = (px, w, h, k = 0.25) => { for (let y = 0; y < h; y++) for (let x = 0; x < w / 2; x++) { const a = y * w + x, b = y * w + (w - 1 - x), va = px[a], vb = px[b]; px[a] = va - k * (255 - vb); px[b] = vb - k * (255 - va); } }; // the back page shows through, mirrored
export const strokes = (px, w, h, n = 12) => { // pen underlines and crossings over the text
  for (let i = 0; i < n; i++) { const y = Math.floor(rnd() * h), x0 = Math.floor(rnd() * w * 0.6), len = Math.floor((0.1 + 0.3 * rnd()) * w), slope = (rnd() - 0.5) * 0.04; for (let x = x0; x < Math.min(w, x0 + len); x++) for (let d = -2; d <= 2; d++) { const yy = Math.round(y + (x - x0) * slope) + d; if (yy >= 0 && yy < h) px[yy * w + x] = Math.min(px[yy * w + x], 40 + Math.abs(d) * 30); } }
};
export const jpeg = (px, w, h, q = 12) => { // blocky 8x8 quantisation like a hard JPEG
  for (let by = 0; by < h; by += 8) for (let bx = 0; bx < w; bx += 8) {
    let s = 0, n = 0; for (let y = by; y < Math.min(h, by + 8); y++) for (let x = bx; x < Math.min(w, bx + 8); x++) { s += px[y * w + x]; n++; }
    const m = s / n; for (let y = by; y < Math.min(h, by + 8); y++) for (let x = bx; x < Math.min(w, bx + 8); x++) px[y * w + x] = Math.round((m + (px[y * w + x] - m) * 0.6) / q) * q;
  }
};
export const turn = (px, w, h, quarter) => { // the sheet put in sideways or upside down: a new picture (quarter = 1, 2, 3 = 90, 180, 270 clockwise)
  const [W, H] = quarter % 2 ? [h, w] : [w, h], out = new Uint8Array(px.length);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [sx, sy] = quarter === 1 ? [y, h - 1 - x] : quarter === 2 ? [w - 1 - x, h - 1 - y] : [w - 1 - y, x]; out[y * W + x] = px[sy * w + sx]; }
  return { px: out, w: W, h: H };
};
const effects = { blur, noise, fade, tilt, shadow, uneven, perspective, curve, onebit, bleed, strokes, jpeg, turn };

/** A grey pixmap with `fx` (each [name, ...args]) applied, as a picture-only PDF page `w` x `h` points (deflated). */
export function scanPdf(m, pix, fx, w, h) {
  let g = { px: pix.getPixels(), w: pix.getWidth(), h: pix.getHeight() }, turned = false;
  for (const [f, ...a] of fx) { const r = effects[f](g.px, g.w, g.h, ...a); if (r) { g = r; turned = !turned; } }
  if (turned) { const px = Uint8Array.from(g.px); pix = new m.Pixmap(m.ColorSpace.DeviceGray, [0, 0, g.w, g.h], false); pix.getPixels().set(px); [w, h] = [h, w]; } // a new pixmap can move WASM memory: copy first
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
