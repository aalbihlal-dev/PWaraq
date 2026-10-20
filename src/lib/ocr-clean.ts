// Picture clean-up before OCR: grey, contrast stretched (faded copies), straightened (tilted scans). Pure functions on
// 8-bit grey pixels, so the browser (Ocr.svelte, from a canvas) and Node (tools/ocr-accuracy.mjs, tests) run the same code.
export type Gray = { w: number; h: number; px: Uint8Array };

export function toGray(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number, channels = 4): Gray {
  const px = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < px.length; i++, j += channels) px[i] = (rgba[j] * 77 + rgba[j + 1] * 151 + rgba[j + 2] * 28) >> 8;
  return { w, h, px };
}

/** The ink's darkness (the darkest half-percent of pixels: ink is only a few percent of a text page) and the paper's
 *  lightness (the most common value). Between them lies the ink/paper split. */
export function levels(g: Gray): { lo: number; hi: number; t: number } {
  const hist = new Uint32Array(256);
  for (const v of g.px) hist[v]++;
  let lo = 0, n = 0, hi = 0;
  while (lo < 255 && (n += hist[lo]) < g.px.length * 0.005) lo++;
  for (let v = 1; v < 256; v++) if (hist[v] > hist[hi]) hi = v;
  return { lo, hi, t: (lo + hi) / 2 };
}

/** The grain of the paper: the noise level (about one standard deviation) of the light pixels. */
export function noise(g: Gray, t: number): number {
  let n = 0, s = 0;
  for (let i = 0; i + 1 < g.px.length; i += 7) if (g.px[i] > t && g.px[i + 1] > t) { n++; s += Math.abs(g.px[i] - g.px[i + 1]); }
  return n ? (s / n) / 1.128 : 0; // the mean difference of two noisy values is 1.128 sigma
}

/** A 3x3 box blur, in place (takes the grain out of a noisy copy before Tesseract looks for ink). */
export function smooth(g: Gray): Gray {
  const { w, h, px } = g, tmp = new Uint8Array(px.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) tmp[y * w + x] = (px[y * w + Math.max(0, x - 1)] + px[y * w + x] + px[y * w + Math.min(w - 1, x + 1)]) / 3;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px[y * w + x] = (tmp[Math.max(0, y - 1) * w + x] + tmp[y * w + x] + tmp[Math.min(h - 1, y + 1) * w + x]) / 3;
  return g;
}

/** Contrast stretch in place when the copy is faded (grey paper or pale ink): the ink becomes black, the paper white. */
export function stretch(g: Gray, { lo, hi } = levels(g)): Gray {
  if (hi - lo < 40 || hi >= 240) return g; // white paper: Tesseract's own thresholding copes with the ink as it is
  const k = 255 / (hi - lo);
  for (let i = 0; i < g.px.length; i++) g.px[i] = Math.min(255, Math.max(0, (g.px[i] - lo) * k));
  return g;
}

/** The angle (degrees) that `rotate` needs to straighten the text lines, from the row profile of a small copy; 0 if the
 *  picture looks straight. Lines are straight when the ink piles up in few rows (the profile is sharpest). */
export function skew(g: Gray): number {
  const k = Math.max(1, Math.round(g.w / 500)), w = Math.floor(g.w / k), h = Math.floor(g.h / k);
  const ink: number[] = []; // x, y of dark pixels in the small copy
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (g.px[y * k * g.w + x * k] < 128) ink.push(x - w / 2, y);
  if (ink.length < 200) return 0;
  const rows = new Float64Array(h + 2 * w);
  const score = (deg: number) => {
    const t = Math.tan((deg * Math.PI) / 180);
    rows.fill(0);
    for (let i = 0; i < ink.length; i += 2) rows[Math.round(ink[i + 1] + ink[i] * t) + w]++;
    let s = 0;
    for (const r of rows) s += r * r;
    return s;
  };
  let best = 0, bestScore = score(0);
  for (let deg = -3; deg <= 3; deg += 0.25) { const s = score(deg); if (s > bestScore) { bestScore = s; best = deg; } }
  for (let deg = best - 0.2; deg <= best + 0.2; deg += 0.05) { const s = score(deg); if (s > bestScore) { bestScore = s; best = deg; } }
  return Math.abs(best) < 0.1 ? 0 : best;
}

/** The picture turned by `deg` degrees about its centre (bilinear, white outside). */
export function rotate(g: Gray, deg: number): Gray {
  const { w, h, px } = g, out = new Uint8Array(px.length);
  const c = Math.cos((deg * Math.PI) / 180), s = Math.sin((deg * Math.PI) / 180), cx = w / 2, cy = h / 2;
  const at = (i: number, j: number) => (i < 0 || j < 0 || i >= w || j >= h ? 255 : px[j * w + i]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = c * (x - cx) + s * (y - cy) + cx, sy = -s * (x - cx) + c * (y - cy) + cy, x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0;
    out[y * w + x] = (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
  }
  return { w, h, px: out };
}

/** The picture ready for OCR and the angle it was turned by (so word boxes can be turned back, see `unturn`). */
export function clean(g: Gray, minTilt = 0.1): { gray: Gray; angle: number; grain: number } {
  const l = levels(g), grain = noise(g, l.t);
  if (grain > 3) smooth(g);
  stretch(g, l);
  const angle = skew(g);
  return { gray: Math.abs(angle) >= minTilt ? rotate(g, angle) : g, angle, grain };
}

/** A box found on the straightened picture, moved back to where it is on the original (its centre turned back). */
export function unturn<B extends { x0: number; y0: number; x1: number; y1: number }>(b: B, angle: number, w: number, h: number): B {
  if (!angle) return b;
  const c = Math.cos((-angle * Math.PI) / 180), s = Math.sin((-angle * Math.PI) / 180), cx = w / 2, cy = h / 2;
  const mx = (b.x0 + b.x1) / 2 - cx, my = (b.y0 + b.y1) / 2 - cy, dx = c * mx - s * my + cx - (b.x0 + b.x1) / 2, dy = s * mx + c * my + cy - (b.y0 + b.y1) / 2;
  return { ...b, x0: b.x0 + dx, x1: b.x1 + dx, y0: b.y0 + dy, y1: b.y1 + dy };
}
