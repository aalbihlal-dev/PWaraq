// Copies the OCR engine (Tesseract WebAssembly, tesseract.js 6.0.1) and the Arabic + English language data from Waraq 0.3.3
// into public/ocr/ (git-ignored: ~19 MB). The Arabic model there is tessdata's standard LSTM one (the integer form of
// tessdata_best).  node tools/get-ocr.mjs [folder with the files] [--best]
// --best also downloads tessdata_best/ara.traineddata (float model, 12.6 MB; github.com/tesseract-ocr/tessdata_best,
// Apache-2.0 like LICENSE-data.txt) as ara_best.traineddata.gz, for tools/ocr-accuracy.mjs --ara ara_best. Measured 20 Oct
// 2026: +0.5 % words over the standard model, so the app does not use it.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const args = process.argv.slice(2).filter((a) => a !== '--best');
const from = args[0] ?? path.join(import.meta.dirname, '..', '..', 'waraq', 'dist', 'vendor', 'ocr');
const to = path.join(import.meta.dirname, '..', 'public', 'ocr');
fs.mkdirSync(to, { recursive: true });
for (const f of ['tesseract.min.js', 'worker.min.js', 'tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm',
  'ara.traineddata.gz', 'eng.traineddata.gz', 'LICENSE-tesseract.txt', 'LICENSE-core.txt', 'LICENSE-data.txt']) {
  fs.copyFileSync(path.join(from, f), path.join(to, f));
}
console.log('OCR files copied to', to);
if (process.argv.includes('--best')) {
  const bytes = await (await fetch('https://github.com/tesseract-ocr/tessdata_best/raw/main/ara.traineddata')).bytes();
  fs.writeFileSync(path.join(to, 'ara_best.traineddata.gz'), zlib.gzipSync(bytes));
  console.log('tessdata_best Arabic model added as ara_best.traineddata.gz');
}
