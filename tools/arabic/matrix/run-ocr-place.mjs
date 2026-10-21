// Matrix 7: OCR layer placement on varied scans: for hybrids whose geometry equals the base document's, how many of the printed
// words (taken from the base PDF's own text) are covered by a layer word box, and how well do the boxes overlap.
// usage: node tools/arabic/matrix/run-ocr-place.mjs   -> tests/audit-arabic/results/matrix-ocr-place.json
import fs from 'node:fs'; import path from 'node:path';
import { m, OUT } from '../lib.mjs';
import { layerWords } from '../../../src/lib/engine/ocr.ts';
import { subjects, words, iou, Rows, r1 } from './mx.mjs';
const rows = new Rows('ocr-place');
for (const s of subjects((s) => s.source === 'hybrid' && ['flatbed150', 'flatbed300', 'faded'].includes(s.variant))) {
  const truth = words(new Uint8Array(fs.readFileSync(path.join(OUT, 'base', s.doc + '.pdf')))).filter((w) => [...w.text].length >= 3 && w.h > 4);
  const layer = layerWords(m, s.bytes(), 0).map((w) => ({ text: w.text, x: w.x0, y: w.y0, w: w.x1 - w.x0, h: w.y1 - w.y0 }));
  let cov = 0, sum = 0; for (const t of truth) { const best = Math.max(0, ...layer.map((l) => iou(l, t))); if (best >= 0.3) cov++; sum += best; }
  const share = cov / truth.length;
  rows.add('ocr layer', 'layer words sit on the printed words', s, share >= 0.8 ? true : share >= 0.6 ? 'warn' : false, `${r1(share * 100)}% of ${truth.length} printed words covered, mean overlap ${r1((sum / truth.length) * 100)}%`, share >= 0.8 ? '' : 'layer boxes miss many printed words (OCR misses, merged words, or offset)');
}
rows.save();
