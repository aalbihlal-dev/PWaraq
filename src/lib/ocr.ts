// Tesseract (WebAssembly) reading a page picture. tesseract.js runs the recognition in a web worker of its own; its files
// (copied into public/ocr by tools/get-ocr.mjs from Waraq 0.3.3) are all local, nothing is fetched from the internet.
import type { Word } from './engine/ocr';

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

/** An OCR engine for `languages` (e.g. 'ara+eng'); `onRatio` gets how far the page being read has come (0..1). */
export async function startOcr(languages: string, onRatio: (ratio: number) => void) {
  const T = await load();
  const worker = await T.createWorker(languages, 1, {
    workerPath: base + '/worker.min.js', corePath: base, langPath: base, gzip: true, workerBlobURL: false, cacheMethod: 'none',
    logger: (m: { status: string; progress: number }) => { if (m.status === 'recognizing text') onRatio(m.progress); },
  });
  await worker.setParameters({ tessedit_pageseg_mode: '3', preserve_interword_spaces: '1' });
  return {
    async read(image: HTMLCanvasElement, dpi: number): Promise<Word[]> {
      await worker.setParameters({ user_defined_dpi: String(Math.round(dpi)) });
      const { data } = await worker.recognize(image, {}, { blocks: true });
      const words: any[] = data.blocks?.flatMap((b: any) => b.paragraphs.flatMap((p: any) => p.lines.flatMap((l: any) => l.words))) ?? data.words ?? [];
      return words.map((w) => ({ text: w.text, x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 }));
    },
    stop: () => worker.terminate(),
  };
}
