// The Unicode bidirectional algorithm (UAX #9) for one line, as far as PDF text needs it: character classes, the weak
// and neutral rules (W1–W7, N1–N2), implicit levels (I1–I2) and reordering (L2). No explicit embeddings (LRE/RLE/… are
// treated as neutral). Two directions of use: `runs` turns text in reading order into the runs drawn left to right
// (the writers), `logical` turns characters found left to right on a page back into reading order (the page editor).
export type Class = 'L' | 'R' | 'AL' | 'EN' | 'ES' | 'ET' | 'AN' | 'CS' | 'NSM' | 'BN' | 'B' | 'S' | 'WS' | 'ON';

export const isMark = (c: number) => (c >= 0x64b && c <= 0x65f) || c === 0x670 || (c >= 0x6d6 && c <= 0x6ed && c !== 0x6dd && c !== 0x6de && c !== 0x6e9) || (c >= 0x300 && c <= 0x36f) || (c >= 0xfe00 && c <= 0xfe0f) || c === 0x200d || c === 0x200c;
const isArabicLetter = (c: number) => (c >= 0x608 && c <= 0x60b) || c === 0x60d || (c >= 0x61b && c <= 0x64a && c !== 0x61f + 1) || (c >= 0x66d && c <= 0x6d5) || (c >= 0x6ee && c <= 0x6ef) || (c >= 0x6fa && c <= 0x6ff) || (c >= 0x750 && c <= 0x77f) || (c >= 0x8a0 && c <= 0x8ff && !isMark(c)) || (c >= 0xfb50 && c <= 0xfdff) || (c >= 0xfe70 && c <= 0xfefc);
const isHebrew = (c: number) => (c >= 0x590 && c <= 0x5ff) || c === 0x200f;
export const isRtl = (c: number) => isArabicLetter(c) || isHebrew(c);
const isLatinLetter = (c: number) => (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || c === 0xaa || c === 0xb5 || c === 0xba || (c >= 0xc0 && c <= 0x2af && c !== 0xd7 && c !== 0xf7) || (c >= 0x370 && c <= 0x58f && !isMark(c)) || (c >= 0x1e00 && c <= 0x1fff) || (c >= 0x2c00 && c <= 0x2dff) || (c >= 0x3040 && c <= 0x9fff) || (c >= 0xac00 && c <= 0xd7af) || c === 0x200e;

/** The bidi class of a code point. */
export function classOf(c: number): Class {
  if (c === 0x0a || c === 0x0d || c === 0x1c || c === 0x1d || c === 0x1e || c === 0x85 || c === 0x2029) return 'B';
  if (c === 0x09 || c === 0x0b || c === 0x1f) return 'S';
  if (c === 0x20 || c === 0x0c || c === 0x1680 || (c >= 0x2000 && c <= 0x200a) || c === 0x2028 || c === 0x205f || c === 0x3000) return 'WS';
  if (c === 0x200c || c === 0x200d || (c >= 0x200b && c <= 0x200b) || (c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069) || c === 0xfeff || (c < 0x20 && c !== 0x09)) return 'BN';
  if (isMark(c)) return 'NSM';
  if ((c >= 0x30 && c <= 0x39) || (c >= 0x6f0 && c <= 0x6f9) || (c >= 0xb2 && c <= 0xb3) || c === 0xb9 || (c >= 0x2070 && c <= 0x2079) || (c >= 0x2080 && c <= 0x2089) || (c >= 0xff10 && c <= 0xff19)) return 'EN';
  if ((c >= 0x660 && c <= 0x669) || c === 0x66b || c === 0x66c || c === 0x600 || c === 0x601 || c === 0x602 || c === 0x603 || c === 0x604 || c === 0x605 || c === 0x6dd || (c >= 0x10e60 && c <= 0x10e7e)) return 'AN';
  if (c === 0x2b || c === 0x2d || c === 0x207a || c === 0x207b || c === 0x208a || c === 0x208b || c === 0x2212 || c === 0xfb29 || c === 0xfe62 || c === 0xfe63 || c === 0xff0b || c === 0xff0d) return 'ES';
  if (c === 0x2c || c === 0x2e || c === 0x2f || c === 0x3a || c === 0xa0 || c === 0x60c || c === 0x202f || c === 0x2044 || c === 0xfe50 || c === 0xfe52 || c === 0xfe55 || c === 0xff0c || c === 0xff0e || c === 0xff0f || c === 0xff1a) return 'CS';
  if (c === 0x23 || c === 0x24 || c === 0x25 || (c >= 0xa2 && c <= 0xa5) || c === 0xb0 || c === 0xb1 || c === 0x609 || c === 0x60a || c === 0x66a || c === 0x2030 || c === 0x2031 || (c >= 0x20a0 && c <= 0x20cf) || c === 0x2032 || c === 0x2033 || c === 0x2034 || c === 0x212e || c === 0xfdfc || c === 0xfe5f || c === 0xfe69 || c === 0xfe6a || c === 0xff03 || c === 0xff04 || c === 0xff05 || c === 0xffe0 || c === 0xffe1 || c === 0xffe5 || c === 0xffe6) return 'ET';
  if (isArabicLetter(c) || c === 0x608 || c === 0x60b || c === 0x60d || c === 0x61b || c === 0x61c || c === 0x61e || c === 0x61f || c === 0x66d || c === 0x66e || c === 0x66f) return 'AL';
  if (isHebrew(c) || (c >= 0x7c0 && c <= 0x85f) || (c >= 0x10800 && c <= 0x10fff) || (c >= 0x1e800 && c <= 0x1efff)) return 'R';
  if (isLatinLetter(c) || (c >= 0x1100 && c <= 0x11ff) || (c >= 0x3041 && c <= 0x30ff) || (c >= 0x4e00 && c <= 0x9fff) || (c >= 0xac00 && c <= 0xd7a3) || (c >= 0x10000 && c <= 0x1ffff && !(c >= 0x10800 && c <= 0x10fff) && !(c >= 0x1e800 && c <= 0x1efff) && !(c >= 0x10e60 && c <= 0x10e7e))) return 'L';
  return 'ON';
}

/** The paragraph direction of `cs` (P2/P3): the first strong letter decides; digits never do. `fallback` when none. */
export function direction(cs: number[], fallback: 'ltr' | 'rtl' = 'ltr'): 'ltr' | 'rtl' {
  for (const c of cs) { const k = classOf(c); if (k === 'L') return 'ltr'; if (k === 'R' || k === 'AL') return 'rtl'; }
  return fallback;
}

/** The embedding level of every character of `cs` (reading order) for a paragraph of direction `dir`. */
export function levels(cs: number[], dir?: 'ltr' | 'rtl'): number[] {
  const base = (dir ?? direction(cs)) === 'rtl' ? 1 : 0, n = cs.length, t: Class[] = cs.map(classOf), orig = [...t];
  // W1: NSM takes the class of the previous character (sos at the start)
  for (let i = 0; i < n; i++) if (t[i] === 'NSM') t[i] = i ? t[i - 1] : base ? 'R' : 'L';
  // W2: EN after AL becomes AN
  for (let i = 0; i < n; i++) if (t[i] === 'EN') for (let j = i - 1; j >= 0; j--) { if (t[j] === 'R' || t[j] === 'L') break; if (t[j] === 'AL') { t[i] = 'AN'; break; } }
  // W3: AL → R
  for (let i = 0; i < n; i++) if (t[i] === 'AL') t[i] = 'R';
  // W4: a single ES between two EN → EN; a single CS between two numbers of the same kind → that kind
  for (let i = 1; i < n - 1; i++) {
    if (t[i] === 'ES' && t[i - 1] === 'EN' && t[i + 1] === 'EN') t[i] = 'EN';
    else if (t[i] === 'CS' && t[i - 1] === t[i + 1] && (t[i - 1] === 'EN' || t[i - 1] === 'AN')) t[i] = t[i - 1];
  }
  // W5: ET next to EN → EN
  for (let i = 0; i < n; i++) if (t[i] === 'ET') {
    let j = i; while (j < n && t[j] === 'ET') j++;
    const en = (i > 0 && t[i - 1] === 'EN') || (j < n && t[j] === 'EN');
    if (en) for (let k = i; k < j; k++) t[k] = 'EN';
    i = j;
  }
  // W6: separators and terminators → ON
  for (let i = 0; i < n; i++) if (t[i] === 'ES' || t[i] === 'ET' || t[i] === 'CS') t[i] = 'ON';
  // W7: EN after L (or sos in an LTR paragraph) → L
  for (let i = 0; i < n; i++) if (t[i] === 'EN') { let k: Class = base ? 'R' : 'L'; for (let j = i - 1; j >= 0; j--) if (t[j] === 'L' || t[j] === 'R') { k = t[j]; break; } if (k === 'L') t[i] = 'L'; }
  // N1/N2: a run of neutrals (ON, WS, B, S; BN rides along) takes the direction of its neighbours when they agree
  // (EN and AN count as R), else the embedding direction
  const strongOf = (k: Class) => (k === 'L' ? 'L' : k === 'R' || k === 'EN' || k === 'AN' ? 'R' : null);
  for (let i = 0; i < n; i++) if (strongOf(t[i]) === null) {
    let j = i; while (j < n && strongOf(t[j]) === null) j++;
    const before = i ? strongOf(t[i - 1]) : base ? 'R' : 'L', after = j < n ? strongOf(t[j]) : base ? 'R' : 'L';
    const k: Class = before === after ? (before as Class) : base ? 'R' : 'L';
    for (let x = i; x < j; x++) t[x] = k;
    i = j;
  }
  // I1/I2
  const out = cs.map((_, i) => (base === 0 ? (t[i] === 'R' ? 1 : t[i] === 'AN' || t[i] === 'EN' ? 2 : 0) : t[i] === 'L' || t[i] === 'EN' || t[i] === 'AN' ? 2 : 1));
  // L1: trailing whitespace and separators go to the paragraph level
  for (let i = n - 1; i >= 0 && (orig[i] === 'WS' || orig[i] === 'B' || orig[i] === 'S' || orig[i] === 'BN'); i--) out[i] = base;
  for (let i = 0; i < n; i++) if (orig[i] === 'B' || orig[i] === 'S') { out[i] = base; for (let j = i - 1; j >= 0 && (orig[j] === 'WS' || orig[j] === 'BN'); j--) out[j] = base; }
  return out;
}

/** L2: the reading-order indices in the order they are shown left to right. */
export function visualOrder(lv: number[]): number[] {
  const idx = lv.map((_, i) => i), max = Math.max(0, ...lv), min = Math.min(...lv.filter((l) => l % 2 === 1), Infinity);
  for (let level = max; level >= Math.max(1, min === Infinity ? 1 : min); level--) {
    for (let i = 0; i < idx.length; i++) if (lv[idx[i]] >= level) {
      let j = i; while (j < idx.length && lv[idx[j]] >= level) j++;
      idx.splice(i, j - i, ...idx.slice(i, j).reverse()); i = j;
    }
  }
  return idx;
}

export type Run = { rtl: boolean; cs: number[]; from: number }; // cs in reading order; from: index of cs[0] in the text
/** Text in reading order → its runs as they stand left to right on the page (each run's letters still in reading
 *  order). `dir`: the paragraph direction when known (else the first strong letter decides). */
export function runs(cs: number[], dir?: 'ltr' | 'rtl'): Run[] {
  if (!cs.length) return [];
  const lv = levels(cs, dir), order = visualOrder(lv), out: Run[] = [];
  for (let i = 0; i < order.length;) {
    const level = lv[order[i]];
    let j = i; while (j < order.length && lv[order[j]] === level) j++;
    const idx = order.slice(i, j), rtl = level % 2 === 1, logical = rtl ? [...idx].reverse() : idx;
    out.push({ rtl, cs: logical.map((k) => cs[k]), from: logical[0] });
    i = j;
  }
  return out;
}

/** What a line in reading order looks like left to right on a page: right-to-left runs reversed, their brackets mirrored. */
export function shown(cs: number[], dir?: 'ltr' | 'rtl'): number[] {
  return runs(cs, dir).flatMap((r) => (r.rtl ? [...r.cs].reverse().map((c) => MIRROR.get(c) ?? c) : r.cs));
}
/** The direction of a line found on a page: a right-to-left paragraph shows its first word at the right, so a
 *  right-to-left letter at the right end decides; Latin at both ends is a left-to-right line; otherwise any
 *  right-to-left letter makes it right-to-left (an Arabic product), else `fallback`. */
export function guessDirection(visual: number[], fallback: 'ltr' | 'rtl' = 'ltr'): 'ltr' | 'rtl' {
  const strong = (c: number) => { const k = classOf(c); return k === 'L' ? 'L' : k === 'R' || k === 'AL' ? 'R' : null; };
  let left: string | null = null, right: string | null = null, any = false;
  for (const c of visual) { const k = strong(c); if (k) { left ??= k; right = k; if (k === 'R') any = true; } }
  if (right === 'R') return 'rtl';
  if (left === 'L' && right === 'L') return 'ltr';
  return any ? 'rtl' : fallback;
}
/** Characters as found left to right on a page (`visual`) → reading order. More than one reading order can show
 *  the same line (bidi is not invertible), so candidates are made two ways — by iteration (resolve the levels of a
 *  guess, rebuild the reading order from them, repeat) and greedily (the widest pieces of the other direction) — and
 *  of those that `shown` turns back into `visual`, the one with the fewest direction runs wins. */
export function logical(visual: number[], dir?: 'ltr' | 'rtl'): number[] { return logicalOrder(visual, dir).cs; }
/** As `logical`, with the permutation too: `order[k]` is the visual index of the k-th character in reading order. */
export function logicalOrder(visual: number[], dir?: 'ltr' | 'rtl'): { cs: number[]; order: number[] } {
  if (!visual.length) return { cs: [], order: [] };
  const d = dir ?? guessDirection(visual), rtl = d === 'rtl';
  const same = (a: number[], b: number[]) => a.length === b.length && a.every((c, i) => c === b[i]);
  // the reading order from a flip mask over the visual positions (true = belongs to a piece of the other direction)
  const build = (flip: boolean[]) => {
    const order = visual.map((_, i) => i); if (rtl) order.reverse();
    for (let i = 0; i < order.length;) { if (flip[order[i]]) { let j = i; while (j < order.length && flip[order[j]]) j++; order.splice(i, j - i, ...order.slice(i, j).reverse()); i = j; } else i++; }
    return order;
  };
  const finish = (perm: number[]) => { const g = perm.map((i) => visual[i]), lv = levels(g, d); return { order: perm, cs: g.map((c, i) => (lv[i] % 2 === 1 ? MIRROR.get(c) ?? c : c)) }; };
  const candidates: { order: number[]; cs: number[] }[] = [];
  // 1. iteration from the line reversed (or as is)
  let perm = build(visual.map(() => false));
  for (let round = 0; round < 5; round++) {
    candidates.push(finish(perm));
    const lv = levels(perm.map((i) => visual[i]), d), flip: boolean[] = [];
    perm.forEach((vi, k) => (flip[vi] = rtl ? lv[k] % 2 === 0 : lv[k] % 2 === 1));
    const next = build(flip);
    if (same(next, perm)) break;
    perm = next;
  }
  // 2. greedy: the widest spans without a letter of this direction, trimmed to letters or digits at both ends
  const strongOther = (c: number) => { const k = classOf(c); return rtl ? k === 'L' || k === 'EN' || k === 'AN' : k === 'R' || k === 'AL'; };
  const strongThis = (c: number) => { const k = classOf(c); return rtl ? k === 'R' || k === 'AL' : k === 'L'; };
  const greedy: boolean[] = visual.map(() => false);
  for (let i = 0; i < visual.length;) {
    if (strongThis(visual[i]) || classOf(visual[i]) === 'NSM') { i++; continue; }
    let j = i; while (j < visual.length && !strongThis(visual[j])) j++;
    let a = i, z = j - 1; while (a <= z && !strongOther(visual[a])) a++; while (z >= a && !strongOther(visual[z]) && classOf(visual[z]) !== 'NSM') z--;
    for (let k = a; k <= z; k++) greedy[k] = true;
    i = j;
  }
  candidates.push(finish(build(greedy)));
  const good = candidates.filter((c) => same(shown(c.cs, d), visual));
  // brackets that do not pair in reading order (a ")" before its "(") mark a wrong reading
  const unpaired = (cs: number[]) => { let open = 0, bad = 0; for (const c of cs) { if (c === 0x28 || c === 0x5b || c === 0xab) open++; else if (c === 0x29 || c === 0x5d || c === 0xbb) { if (open) open--; else bad++; } } return bad + open; };
  const pick = (good.length ? good : candidates).map((c) => ({ c, n: runs(c.cs, d).length + 10 * unpaired(c.cs) })).sort((x, y) => x.n - y.n)[0];
  return pick.c;
}
const MIRROR = new Map<number, number>([[0x28, 0x29], [0x29, 0x28], [0x5b, 0x5d], [0x5d, 0x5b], [0x7b, 0x7d], [0x7d, 0x7b], [0x3c, 0x3e], [0x3e, 0x3c], [0xab, 0xbb], [0xbb, 0xab], [0x2039, 0x203a], [0x203a, 0x2039]]);
/** The mirrored form of a bracket shown inside right-to-left text. */
export const mirror = (c: number) => MIRROR.get(c) ?? c;
