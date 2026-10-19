// Copies the OCR engine (Tesseract WebAssembly, tesseract.js 6.0.1) and the Arabic + English language data from Waraq 0.3.3
// into public/ocr/ (git-ignored: ~19 MB).  node tools/get-ocr.mjs [folder with the files]
import fs from 'node:fs';
import path from 'node:path';

const from = process.argv[2] ?? path.join(import.meta.dirname, '..', '..', 'waraq', 'dist', 'vendor', 'ocr');
const to = path.join(import.meta.dirname, '..', 'public', 'ocr');
fs.mkdirSync(to, { recursive: true });
for (const f of ['tesseract.min.js', 'worker.min.js', 'tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm',
  'ara.traineddata.gz', 'eng.traineddata.gz', 'LICENSE-tesseract.txt', 'LICENSE-core.txt', 'LICENSE-data.txt']) {
  fs.copyFileSync(path.join(from, f), path.join(to, f));
}
console.log('OCR files copied to', to);
