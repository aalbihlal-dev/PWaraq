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

/** The picture turned by `quarter` quarter turns clockwise (1, 2, 3): a sheet that was scanned sideways or upside down. */
export function turn(g: Gray, quarter: number): Gray {
  const { w, h, px } = g, [W, H] = quarter % 2 ? [h, w] : [w, h], out = new Uint8Array(px.length);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [sx, sy] = quarter === 1 ? [y, h - 1 - x] : quarter === 2 ? [w - 1 - x, h - 1 - y] : [w - 1 - y, x]; out[y * W + x] = px[sy * w + sx]; }
  return { w: W, h: H, px: out };
}

/** True when the text lines run up and down (a sheet scanned sideways): the ink piles up in columns, not rows. */
export function sideways(g: Gray): boolean {
  const rows = new Float64Array(g.h), cols = new Float64Array(g.w);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.px[y * g.w + x] < 128) { rows[y]++; cols[x]++; }
  const sharp = (p: Float64Array) => { let s = 0, n = 0; for (const v of p) { s += v * v; n += v; } return n ? s / n : 0; }; // mean ink per inked line
  return sharp(cols) > 2 * sharp(rows); // a sparse title page reaches 1.5 the right way up
}

/** The picture k times larger (bilinear). */
export function enlarge(g: Gray, k: number): Gray {
  const w = Math.round(g.w * k), h = Math.round(g.h * k), px = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = Math.min(g.w - 1, x / k), sy = Math.min(g.h - 1, y / k), x0 = Math.floor(sx), y0 = Math.floor(sy), x1 = Math.min(g.w - 1, x0 + 1), y1 = Math.min(g.h - 1, y0 + 1), fx = sx - x0, fy = sy - y0;
    px[y * w + x] = (g.px[y0 * g.w + x0] * (1 - fx) + g.px[y0 * g.w + x1] * fx) * (1 - fy) + (g.px[y1 * g.w + x0] * (1 - fx) + g.px[y1 * g.w + x1] * fx) * fy;
  }
  return { w, h, px };
}

/** The picture at 1/k of its size (box average). */
export function shrink(g: Gray, k: number): Gray {
  const W = Math.floor(g.w / k), H = Math.floor(g.h / k), px = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let s = 0; for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) s += g.px[(y * k + j) * g.w + x * k + i]; px[y * W + x] = s / (k * k); }
  return { w: W, h: H, px };
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
/** Sauvola's adaptive threshold (window `win`, k 0.2): ink black, paper white, judged locally — for a photo whose paper
 *  is light here and in shade there, where one threshold for the whole page turns the shaded part black. */
export function binarize(g: Gray, win = 31, k = 0.2): Gray {
  const { w, h, px } = g, W = w + 1, S = new Float64Array(W * (h + 1)), Q = new Float64Array(W * (h + 1)), r = win >> 1;
  for (let y = 1; y <= h; y++) for (let x = 1; x <= w; x++) { const v = px[(y - 1) * w + x - 1]; S[y * W + x] = v + S[(y - 1) * W + x] + S[y * W + x - 1] - S[(y - 1) * W + x - 1]; Q[y * W + x] = v * v + Q[(y - 1) * W + x] + Q[y * W + x - 1] - Q[(y - 1) * W + x - 1]; }
  const out = new Uint8Array(px.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const x0 = Math.max(0, x - r), y0 = Math.max(0, y - r), x1 = Math.min(w, x + r + 1), y1 = Math.min(h, y + r + 1), n = (x1 - x0) * (y1 - y0);
    const sum = S[y1 * W + x1] - S[y0 * W + x1] - S[y1 * W + x0] + S[y0 * W + x0], sq = Q[y1 * W + x1] - Q[y0 * W + x1] - Q[y1 * W + x0] + Q[y0 * W + x0];
    const m = sum / n, sd = Math.sqrt(Math.max(0, sq / n - m * m));
    out[y * w + x] = px[y * w + x] < m * (1 + k * (sd / 128 - 1)) ? 0 : 255;
  }
  return { w, h, px: out };
}

/** How much the paper's brightness differs across the page (its most common value in each of nine tiles, tiles that are
 *  paper only), for a photo with a shadow or a lamp's hot spot. */
export function unevenness(g: Gray): number {
  const modes: number[] = [];
  for (let ty = 0; ty < 3; ty++) for (let tx = 0; tx < 3; tx++) {
    const hist = new Uint32Array(256);
    for (let y = Math.floor((ty * g.h) / 3); y < Math.floor(((ty + 1) * g.h) / 3); y += 2) for (let x = Math.floor((tx * g.w) / 3); x < Math.floor(((tx + 1) * g.w) / 3); x += 2) hist[g.px[y * g.w + x]]++;
    let mode = 0; for (let v = 1; v < 256; v++) if (hist[v] > hist[mode]) mode = v;
    modes.push(mode);
  }
  const paper = modes.filter((v) => v >= 110); // tiles that are paper, not a dark picture or a coloured band
  return paper.length >= 6 ? Math.max(...paper) - Math.min(...paper) : 0;
}

/** Counts the long, thin ruled lines (table borders, form boxes): runs of dark pixels at least a tenth of the page long
 *  (across) or 40 pixels (up and down), at most about 5 pixels thick with light pixels beside them, so the joined
 *  baseline of an Arabic line or a tall letter is not taken for a rule. Gives distinct lines across and up and down. */
export function countRules(g: Gray): { across: number; down: number } {
  const { w, h, px } = g, minW = w * 0.1, minH = 40, dark = 128, gap = 3;
  const lightRow = (y: number, x0: number, x1: number) => { if (y < 0 || y >= h) return true; let d = 0; for (let x = x0; x < x1; x++) if (px[y * w + x] < dark) d++; return d < (x1 - x0) * 0.2; };
  const lightCol = (x: number, y0: number, y1: number) => { if (x < 0 || x >= w) return true; let d = 0; for (let y = y0; y < y1; y++) if (px[y * w + x] < dark) d++; return d < (y1 - y0) * 0.2; };
  let across = 0, down = 0, lastY = -9, lastX = -9;
  for (let y = 0; y < h; y++) { let run = 0; for (let x = 0; x <= w; x++) { if (x < w && px[y * w + x] < dark) run++; else { if (run >= minW && lightRow(y - gap, x - run, x) && lightRow(y + gap, x - run, x)) { if (y - lastY > gap) across++; lastY = y; } run = 0; } } }
  for (let x = 0; x < w; x++) { let run = 0; for (let y = 0; y <= h; y++) { if (y < h && px[y * w + x] < dark) run++; else { if (run >= minH && lightCol(x - gap, y - run, y) && lightCol(x + gap, y - run, y)) { if (x - lastX > gap) down++; lastX = x; } run = 0; } } }
  return { across, down };
}

/** `ruled`: the page has a table or form (ruled lines both ways): read it as one block of mixed sizes (psm 4). */
export function clean(g: Gray, minTilt = 0.1): { gray: Gray; angle: number; grain: number; ruled: boolean } {
  const l = levels(g), grain = noise(g, l.t);
  if (grain > 3) smooth(g);
  if (unevenness(g) > 45) g = binarize(g); else stretch(g, l);
  const rules = countRules(g), ruled = rules.across >= 3 && rules.down >= 3; // a table or form has rules both ways; a book's footnote rule runs one way
  const angle = skew(g);
  return { gray: Math.abs(angle) >= minTilt ? rotate(g, angle) : g, angle, grain, ruled };
}

/** A box found on the picture as read (turned by `quarter` quarter turns, then straightened by `angle`), moved back to
 *  where it is on the original w x h picture: its centre turned back, its size kept (swapped for a sideways page). */
export function unturn<B extends { x0: number; y0: number; x1: number; y1: number }>(b: B, angle: number, w: number, h: number, quarter = 0): B {
  const [W, H] = quarter % 2 ? [h, w] : [w, h]; // the size of the picture as read
  let x = (b.x0 + b.x1) / 2, y = (b.y0 + b.y1) / 2, bw = b.x1 - b.x0, bh = b.y1 - b.y0;
  if (angle) { const c = Math.cos((-angle * Math.PI) / 180), s = Math.sin((-angle * Math.PI) / 180), mx = x - W / 2, my = y - H / 2; x = c * mx - s * my + W / 2; y = s * mx + c * my + H / 2; }
  if (quarter === 1) [x, y, bw, bh] = [y, h - x, bh, bw]; else if (quarter === 2) [x, y] = [w - x, h - y]; else if (quarter === 3) [x, y, bw, bh] = [w - y, x, bh, bw];
  return { ...b, x0: x - bw / 2, x1: x + bw / 2, y0: y - bh / 2, y1: y + bh / 2 };
}
