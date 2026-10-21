// Puts a stronger engine's text where the words are printed. A model like Surya OCR 2 reads a page very well but gives its
// text a block at a time (a box and the words in it), not word by word; Tesseract finds every word's box fast but misreads
// many words. Here the model's words of a block are lined up with Tesseract's words inside the block (a sequence
// alignment, like diff), a matched word takes Tesseract's box, an unmatched one is given the free stretch between its
// neighbours on the line. The text is the model's, the positions are Tesseract's, so selection, search and copy land on
// the printed words. Pure functions (no browser, no engine), tested in tests/unit/ocr-align.test.mjs.
import type { Line, Word } from './engine/ocr';

export type Block = { text: string; x0: number; y0: number; x1: number; y1: number }; // a block's words and its box (pixels)

const ARABIC = /[؀-ۿ]/g;
const plain = (s: string) => s.normalize('NFC').replace(/[ً-ْٰـ]/g, '').replace(/[^\p{L}\p{N}]/gu, '');

/** Edit distance of two strings as a share of the longer one (0 same … 1 nothing in common). */
function distance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length || !b.length) return 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i), cur: number[] = [];
  for (let i = 1; i <= a.length; i++) {
    cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length] / Math.max(a.length, b.length);
}

/** Global alignment of the model's words (`m`) with Tesseract's (`t`): the pairs [i, j] of words judged to be the same word
 *  (their strings differ by at most half), found by the cheapest path; a skipped word costs 0.6, a pair its distance. */
export function align(m: string[], t: string[]): [number, number][] {
  const a = m.map(plain), b = t.map(plain), gap = 0.6, n = a.length, k = b.length;
  const cost = Array.from({ length: n + 1 }, () => new Float64Array(k + 1)), back = Array.from({ length: n + 1 }, () => new Uint8Array(k + 1));
  for (let i = 1; i <= n; i++) { cost[i][0] = i * gap; back[i][0] = 1; }
  for (let j = 1; j <= k; j++) { cost[0][j] = j * gap; back[0][j] = 2; }
  for (let i = 1; i <= n; i++) for (let j = 1; j <= k; j++) {
    const d = distance(a[i - 1], b[j - 1]), diag = cost[i - 1][j - 1] + (d <= 0.5 ? d : 2 * gap), up = cost[i - 1][j] + gap, left = cost[i][j - 1] + gap;
    if (diag <= up && diag <= left) { cost[i][j] = diag; back[i][j] = 0; } else if (up <= left) { cost[i][j] = up; back[i][j] = 1; } else { cost[i][j] = left; back[i][j] = 2; }
  }
  const pairs: [number, number][] = [];
  for (let i = n, j = k; i > 0 || j > 0;) {
    const step = back[i][j];
    if (i > 0 && j > 0 && step === 0) { if (distance(a[i - 1], b[j - 1]) <= 0.5) pairs.push([i - 1, j - 1]); i--; j--; } else if (i > 0 && (j === 0 || step === 1)) i--; else j--;
  }
  return pairs.reverse();
}

/** The model's text with Tesseract's positions. `lines` are Tesseract's lines (words in reading order); each block takes the
 *  lines whose centre lies in it. Lines no block claims are dropped (the model left them out on purpose: page numbers,
 *  marks, noise). A block with no Tesseract line under it gets one line over its whole box. */
export function alignBlocks(blocks: Block[], lines: Line[]): Line[] {
  const box = (l: Line) => ({ x0: Math.min(...l.words.map((w) => w.x0)), y0: Math.min(...l.words.map((w) => w.y0)), x1: Math.max(...l.words.map((w) => w.x1)), y1: Math.max(...l.words.map((w) => w.y1)) });
  const free = lines.filter((l) => l.words.length).map((l) => ({ l, b: box(l) })), out: Line[] = [];
  for (const blk of blocks) {
    const words = blk.text.split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    const mine = free.filter((f) => { const cx = (f.b.x0 + f.b.x1) / 2, cy = (f.b.y0 + f.b.y1) / 2; return cx >= blk.x0 - 8 && cx <= blk.x1 + 8 && cy >= blk.y0 - 8 && cy <= blk.y1 + 8; }).sort((p, q) => p.b.y0 - q.b.y0);
    for (const f of mine) free.splice(free.indexOf(f), 1);
    if (!mine.length) { out.push(spread(words, { x0: blk.x0, x1: blk.x1, y0: blk.y0, y1: Math.min(blk.y1, blk.y0 + (blk.y1 - blk.y0) / Math.max(1, Math.ceil(words.join(' ').length / 60))) })); continue; }
    const tess: { w: Word; line: number }[] = mine.flatMap((f, line) => f.l.words.map((w) => ({ w, line })));
    const pairs = align(words, tess.map((x) => x.w.text)), anchor = new Map(pairs.map(([i, j]) => [i, j]));
    // which Tesseract line each model word belongs to: a matched word to its own, an unmatched one to its neighbour's
    const lineOf: number[] = new Array(words.length).fill(-1);
    for (const [i, j] of pairs) lineOf[i] = tess[j].line;
    let last = pairs.length ? lineOf[pairs[0][0]] : 0;
    for (let i = 0; i < words.length; i++) { if (lineOf[i] < 0) lineOf[i] = last; else last = lineOf[i]; }
    mine.forEach((f, line) => {
      const idx = words.map((_, i) => i).filter((i) => lineOf[i] === line);
      if (!idx.length) return;
      const rtl = (idx.map((i) => words[i]).join('').match(ARABIC) ?? []).length > idx.join('').length / 2;
      const placed = idx.map((i) => ({ i, box: anchor.has(i) ? tess[anchor.get(i)!].w : undefined }));
      out.push({ confidence: 100, words: fill(placed.map((p) => ({ text: words[p.i], box: p.box })), f.b, rtl) });
    });
  }
  return out;
}

/** The words of one line in reading order, each with a box: a matched word its Tesseract box, the others share the stretch
 *  between their neighbours (or the line's edge) by the number of letters. Right to left for an Arabic line. */
function fill(items: { text: string; box?: Word }[], line: { x0: number; x1: number; y0: number; y1: number }, rtl: boolean): Word[] {
  const res: Word[] = new Array(items.length), minW = 3;
  let from = rtl ? line.x1 : line.x0; // the pen: where the next free stretch starts, in reading direction
  for (let a = 0; a < items.length;) {
    if (items[a].box) { const b = items[a].box!; res[a] = { text: items[a].text, x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1 }; from = rtl ? b.x0 : b.x1; a++; continue; }
    let z = a; while (z < items.length && !items[z].box) z++;
    const stop = z < items.length ? (rtl ? items[z].box!.x1 : items[z].box!.x0) : (rtl ? line.x0 : line.x1), span = Math.max(minW * (z - a), rtl ? from - stop : stop - from);
    const chars = items.slice(a, z).map((x) => x.text.length + 0.5), total = chars.reduce((s, v) => s + v, 0);
    let pos = from;
    for (let q = a; q < z; q++) {
      const wdt = (span * chars[q - a]) / total, x0 = rtl ? pos - wdt : pos, x1 = rtl ? pos : pos + wdt;
      res[q] = { text: items[q].text, x0, x1, y0: line.y0, y1: line.y1 }; pos = rtl ? pos - wdt : pos + wdt;
    }
    from = pos; a = z;
  }
  return res;
}

/** All the words on one line over `r`, shared out by the number of letters (no Tesseract line to go by). */
function spread(words: string[], r: { x0: number; x1: number; y0: number; y1: number }): Line {
  const rtl = (words.join('').match(ARABIC) ?? []).length > words.join('').length / 2;
  return { confidence: 100, words: fill(words.map((text) => ({ text })), r, rtl) };
}
