// Tesseract (WebAssembly) reading a page picture. tesseract.js runs the recognition in a web worker of its own; its files
// (copied into public/ocr by tools/get-ocr.mjs) are all local, nothing is fetched from the internet. The pure parts
// (linesOf, mergePasses) are shared with tools/ocr-accuracy.mjs, which measures the same pipeline in Node.
import type { Line, Word } from './engine/ocr';

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
 *  are kept. When the second pass (the one with English) finds two or more Latin words on a tenth of the lines, the page
 *  is bilingual and that pass is kept whole: the first (Arabic-only) pass cannot read its mixed lines. (A lone Latin
 *  "word" on an Arabic line is usually the English model misreading Arabic, so one does not count.) */
export function mergePasses(ara: Line[], eng: Line[]): Line[] {
  if (eng.filter((l) => l.words.filter((w) => /[A-Za-z]{2}/.test(w.text)).length >= 2).length >= eng.length / 10) return eng;
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
    out.push(best && best.confidence! > a.confidence! ? best : a);
  }
  return [...out, ...left].sort((a, b) => box(a).y0 - box(b).y0);
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
    async read(image: HTMLCanvasElement, dpi: number): Promise<Line[]> {
      await worker.setParameters({ user_defined_dpi: String(Math.round(dpi)) });
      return linesOf((await worker.recognize(image, {}, { blocks: true })).data);
    },
    stop: () => worker.terminate(),
  };
}
