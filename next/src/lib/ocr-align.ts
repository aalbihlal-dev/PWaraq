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
      out.push({ confidence: 100, words: fill(placed.map((p) => ({ text: words[p.i], box: p.box })), f.b, rtl, { x0: Math.min(blk.x0, f.b.x0), x1: Math.max(blk.x1, f.b.x1) }) });
    });
  }
  return out;
}

/** The words of one line in reading order, each with a box: a matched word its Tesseract box, the others share the stretch
 *  between their neighbours by the number of letters. A run of words before the first (or after the last) matched word, which
 *  Tesseract did not see, is set next to its neighbour at the width letters have on this line, outside the line's box if need
 *  be. Right to left for an Arabic line. */
function fill(items: { text: string; box?: Word }[], line: { x0: number; x1: number; y0: number; y1: number }, rtl: boolean, bounds: { x0: number; x1: number }): Word[] {
  const res: Word[] = new Array(items.length), minW = 3, dir = rtl ? -1 : 1;
  const anchored = items.filter((x) => x.box), chars = (t: string) => t.length + 0.5;
  const natural = anchored.length ? anchored.reduce((s, x) => s + (x.box!.x1 - x.box!.x0), 0) / anchored.reduce((s, x) => s + chars(x.text), 0) : (line.x1 - line.x0) / Math.max(1, items.reduce((s, x) => s + chars(x.text), 0));
  const put = (q: number, from: number, wdt: number, y: { y0: number; y1: number }) => { const a = rtl ? from - wdt : from, b = rtl ? from : from + wdt; res[q] = { text: items[q].text, x0: a, x1: b, y0: y.y0, y1: y.y1 }; };
  const first = items.findIndex((x) => x.box), last = items.length - 1 - [...items].reverse().findIndex((x) => x.box);
  for (let a = 0; a < items.length;) {
    if (items[a].box) { const b = items[a].box!; res[a] = { text: items[a].text, x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1 }; a++; continue; }
    let z = a; while (z < items.length && !items[z].box) z++;
    if (first < 0) { // nothing matched on this line: all words share its box
      const total = items.reduce((s, x) => s + chars(x.text), 0), span = Math.max(minW * items.length, line.x1 - line.x0);
      let pos = rtl ? line.x1 : line.x0;
      for (let q = 0; q < items.length; q++) { const wdt = (span * chars(items[q].text)) / total; put(q, pos, wdt, line); pos += dir * wdt; }
      return res;
    }
    if (a < first) { // before the first matched word: next to it, going outward, the last of them closest
      let pos = rtl ? items[first].box!.x1 : items[first].box!.x0;
      const f = shrinkTo(items.slice(a, z), natural, rtl ? bounds.x1 - pos : pos - bounds.x0, minW);
      for (let q = z - 1; q >= a; q--) { const wdt = Math.max(minW, natural * f * chars(items[q].text)); res[q] = { text: items[q].text, x0: rtl ? pos : pos - wdt, x1: rtl ? pos + wdt : pos, y0: line.y0, y1: line.y1 }; pos += rtl ? wdt : -wdt; }
    } else if (z > last) { // after the last matched word: next to it, going on in reading direction
      let pos = rtl ? items[last].box!.x0 : items[last].box!.x1;
      const f = shrinkTo(items.slice(a, z), natural, rtl ? pos - bounds.x0 : bounds.x1 - pos, minW);
      for (let q = a; q < z; q++) { const wdt = Math.max(minW, natural * f * chars(items[q].text)); put(q, pos, wdt, line); pos += dir * wdt; }
    } else { // between two matched words: the free stretch, shared by letters
      const from = rtl ? items[a - 1].box!.x0 : items[a - 1].box!.x1, stop = rtl ? items[z].box!.x1 : items[z].box!.x0;
      const span = Math.max(minW * (z - a), rtl ? from - stop : stop - from), total = items.slice(a, z).reduce((s, x) => s + chars(x.text), 0);
      let pos = from;
      for (let q = a; q < z; q++) { const wdt = (span * chars(items[q].text)) / total; put(q, pos, wdt, line); pos += dir * wdt; }
    }
    a = z;
  }
  return res;
}

/** How much to shrink natural widths so a run of words fits the room it has (1 when it fits; the room at least `minW` a word). */
function shrinkTo(run: { text: string }[], natural: number, room: number, minW: number): number {
  const need = run.reduce((s, x) => s + natural * (x.text.length + 0.5), 0);
  return need <= Math.max(room, minW * run.length) ? 1 : Math.max(room, minW * run.length) / need;
}

/** All the words on one line over `r`, shared out by the number of letters (no Tesseract line to go by). */
function spread(words: string[], r: { x0: number; x1: number; y0: number; y1: number }): Line {
  const rtl = (words.join('').match(ARABIC) ?? []).length > words.join('').length / 2;
  return { confidence: 100, words: fill(words.map((text) => ({ text })), r, rtl, r) };
}
