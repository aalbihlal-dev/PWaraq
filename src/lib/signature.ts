// A signature picture made clean: the paper around the ink taken away (light pixels transparent, threshold found
// automatically, adjustable), cropped to the ink, and the ink in one colour. Works on RGBA pixels, so it runs on a
// canvas in the app and in the Node self-check (tests/unit/sign).
export type Pixels = { data: Uint8ClampedArray; width: number; height: number };

// brightness of a pixel as seen on white paper (a drawn signature has transparent paper)
const light = (d: Uint8ClampedArray, i: number) => {
  const a = d[i + 3] / 255;
  return (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) * a + 255 * (1 - a);
};

/** Otsu's threshold: the brightness that best splits ink from paper. */
export function autoThreshold(p: Pixels): number {
  const hist = new Array(256).fill(0), n = p.width * p.height;
  for (let i = 0; i < p.data.length; i += 4) hist[Math.round(light(p.data, i))]++;
  let sum = 0;
  hist.forEach((c, v) => (sum += c * v));
  let best = 0, at = 128, end = 128, wB = 0, sB = 0;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (!wB) continue;
    const wF = n - wB; if (!wF) break;
    sB += t * hist[t];
    const between = wB * wF * (sB / wB - (sum - sB) / wF) ** 2;
    if (between > best * 1.000001) { best = between; at = end = t; } else if (between >= best * 0.999999) end = t;
  }
  return Math.round((at + end) / 2); // no pixels between ink and paper: the middle of the gap, not its dark edge
}

const SOFT = 24; // the last 24 brightness steps below the threshold fade out, so the ink's edges stay smooth

/** The ink only: pixels lighter than `threshold` transparent, the rest in `colour` (0..255 RGB), cropped to the ink with
 *  a small margin. An empty result (no ink) is 1 x 1 transparent. */
export function cleanSignature(p: Pixels, threshold: number, colour: number[]): Pixels {
  const { width: W, height: H, data: d } = p, alpha = new Uint8ClampedArray(W * H);
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = Math.round(255 * Math.min(1, Math.max(0, (threshold - light(d, (y * W + x) * 4)) / SOFT)));
    alpha[y * W + x] = a;
    if (a > 32) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  }
  if (x1 < 0) return { data: new Uint8ClampedArray(4), width: 1, height: 1 };
  const pad = 2;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
  const w = x1 - x0 + 1, h = y1 - y0 + 1, out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4;
    out[o] = colour[0]; out[o + 1] = colour[1]; out[o + 2] = colour[2]; out[o + 3] = alpha[(y + y0) * W + x + x0];
  }
  return { data: out, width: w, height: h };
}

/** Ink colours offered for a signature (0..255 RGB): black, Waraq ink, blue (pen), Waraq green. */
export const INKS = { black: [0, 0, 0], inkColour: [35, 60, 54], blueColour: [21, 64, 160], greenColour: [21, 119, 93] } as const;
