// Tesseract (WebAssembly) reading a page picture. tesseract.js runs the recognition in a web worker of its own; its files
// (copied into public/ocr by tools/get-ocr.mjs) are all local, nothing is fetched from the internet. The pure parts
// (linesOf, mergePasses) are shared with tools/ocr-accuracy.mjs, which measures the same pipeline in Node.
import type { Line, Word } from './engine/ocr';
import { shrink, turn, sideways, type Gray } from './ocr-clean.ts';

const base = '/ocr';
let loading: Promise<any> | null = null;
function load(): Promise<any> {
  return (loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = base + '/tesseract.min.js';
    s.onload = () => resolve((globalThis as any).Tesseract);
    s.onerror = () => { loading = null; reject(new Error('OCR engine unavailable')); };
    document.head.append(s);
  }));
}

/** Tesseract's result as lines of words in reading order (pixels of the picture, from its top left). */
export function linesOf(data: any): Line[] {
  const lines: any[] = data.blocks?.flatMap((b: any) => b.paragraphs.flatMap((p: any) => p.lines)) ?? [];
  return lines.map((l) => ({ confidence: l.confidence, words: l.words.filter((w: any) => w.text.trim()).map((w: any): Word => ({ text: w.text.trim(), x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 })) }))
    .filter((l) => l.words.length);
}

/** Two passes merged by position: where both read the same printed line, the surer one wins; lines only one pass found
 *  are kept. When the second pass (the one with English) finds two or more Latin words on 30 % of the lines, the page
 *  is bilingual and that pass is kept whole: the first (Arabic-only) pass cannot read its mixed lines. (A lone Latin
 *  "word" on an Arabic line is usually the English model misreading Arabic, so one does not count; the English model
 *  also reads scanned Arabic books as Latin junk, hence 30 %, not 10 %: measured 21 Oct on the real scanned set.) */
export function mergePasses(ara: Line[], eng: Line[]): Line[] {
  if (eng.filter((l) => l.words.filter((w) => /[A-Za-z]{2}/.test(w.text)).length >= 2).length >= eng.length * 0.3) return eng;
  const box = (l: Line) => ({ x0: Math.min(...l.words.map((w) => w.x0)), y0: Math.min(...l.words.map((w) => w.y0)), x1: Math.max(...l.words.map((w) => w.x1)), y1: Math.max(...l.words.map((w) => w.y1)) });
  const overlap = (a: Line, b: Line) => { // of the smaller line's area
    const p = box(a), q = box(b), w = Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0), h = Math.min(p.y1, q.y1) - Math.max(p.y0, q.y0);
    return w > 0 && h > 0 ? (w * h) / Math.min((p.x1 - p.x0) * (p.y1 - p.y0), (q.x1 - q.x0) * (q.y1 - q.y0)) : 0;
  };
  const left = new Set(eng), out: Line[] = [];
  for (const a of ara) {
    const twins = eng.filter((e) => overlap(a, e) > 0.5);
    twins.forEach((e) => left.delete(e));
    const best = twins.reduce<Line | undefined>((b, e) => (b && b.confidence! >= e.confidence!) ? b : e, undefined);
    const numbers = /[\u0660-\u0669]/.test(a.words.map((w) => w.text).join()) && /[A-Za-z]/.test(best?.words.map((w) => w.text).join() ?? ''); // Arabic-Indic numbers read as Latin junk
    out.push(best && !numbers && best.confidence! > a.confidence! ? best : a);
  }
  return [...out, ...left].sort((a, b) => box(a).y0 - box(b).y0);
}

/** What a page needs from an engine: a whole-page read. */
export type PageEngine = { readGray(g: Gray, dpi: number, ruled?: boolean): Promise<Line[]> };

/** A whole page: the first engine, the others merged in by line. (A second look at weak lines, cut out, enlarged and read as
 *  one line, was measured on 27 + 77 scanned pages and lost: 65.0 -> 61.2 % words, the surer-looking rereads of vowelled
 *  text were wrong more often than right — so it is not here.) */
export async function readPage(engines: PageEngine[], g: Gray, dpi: number, ruled = false): Promise<Line[]> {
  let lines = await engines[0].readGray(g, dpi, ruled);
  for (const e of engines.slice(1)) lines = mergePasses(lines, await e.readGray(g, dpi, ruled));
  return lines;
}

/** The picture the right way up. The ink profile says whether the lines run across or up and down (Tesseract reads a
 *  sideways page by turning it itself, so its confidence cannot tell 0° from 90°); a quick read of a small copy at the
 *  two remaining orientations (the sum of line confidence x words) tells right way up from upside down. */
export async function upright(read: (g: Gray, dpi: number) => Promise<Line[]>, g: Gray, dpi: number): Promise<{ gray: Gray; quarter: number }> {
  const small = shrink(g, 2), pair = sideways(small) ? [1, 3] : [0, 2], scores: number[] = [];
  for (const q of pair) scores.push((await read(q ? turn(small, q) : small, dpi / 2)).reduce((s, l) => s + (l.confidence ?? 0) * l.words.length, 0));
  // upside down needs a clear win: a vocalised book page reads badly either way and would flip on noise
  const q = scores[1] > (pair[0] ? 1.2 : 2) * scores[0] ? pair[1] : pair[0];
  return q ? { gray: turn(g, q), quarter: q } : { gray: g, quarter: 0 };
}

function toCanvas(g: Gray): HTMLCanvasElement {
  const canvas = document.createElement('canvas'); canvas.width = g.w; canvas.height = g.h;
  const ctx = canvas.getContext('2d')!, img = ctx.createImageData(g.w, g.h);
  for (let i = 0; i < g.px.length; i++) { img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = g.px[i]; img.data[i * 4 + 3] = 255; }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** A grey picture as PNG bytes (for the strong engine's request). */
export async function pngOf(g: Gray): Promise<Uint8Array> {
  const blob: Blob = await new Promise((r) => toCanvas(g).toBlob((b) => r(b!), 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

/** An OCR engine for `languages` (e.g. 'ara+eng'); `onRatio` gets how far the page being read has come (0..1). */
export async function startOcr(languages: string, onRatio: (ratio: number) => void) {
  const T = await load();
  const worker = await T.createWorker(languages, 1, {
    workerPath: base + '/worker.min.js', corePath: base, langPath: base, gzip: true, workerBlobURL: false, cacheMethod: 'none',
    logger: (m: { status: string; progress: number }) => { if (m.status === 'recognizing text') onRatio(m.progress); },
  });
  await worker.setParameters({ tessedit_pageseg_mode: '3', preserve_interword_spaces: '1' });
  return {
    /** `ruled`: a table or form page, read as one column of mixed sizes (psm 4) instead of auto layout (psm 3). */
    async read(image: HTMLCanvasElement, dpi: number, ruled = false): Promise<Line[]> {
      await worker.setParameters({ user_defined_dpi: String(Math.round(dpi)), tessedit_pageseg_mode: ruled ? '4' : '3' });
      return linesOf((await worker.recognize(image, {}, { blocks: true })).data);
    },
    /** Reads a grey picture (a canvas is made for it). */
    readGray(g: Gray, dpi: number, ruled = false): Promise<Line[]> { return this.read(toCanvas(g), dpi, ruled); },
    stop: () => worker.terminate(),
  };
}
