// Measures OCR on the test set tests/fixtures/ocr/ (NN-name.pdf + NN-name.txt with the correct text): words right (how
// many of the page's words come out exactly, in any order) and chars right (100 − character error rate, so the numbers
// compare with published benchmarks), seconds per page. Same code path as the app (tesseract.js, src/lib/ocr.ts,
// src/lib/ocr-clean.ts), run in Node:  node tools/ocr-accuracy.mjs [--ara ara|ara_best] [--dpi 250] [--no-clean]
// [--passes ara+eng,ara] [--tilt-min 0.1] [--only 03] [--out folder] [--engine tesseract|surya]   (--out writes what was read + the picture)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import * as m from '../engine/mupdf-wasm/dist/mupdf.js';
import { linesOf, mergePasses } from '../src/lib/ocr.ts';
import { clean } from '../src/lib/ocr-clean.ts';

const root = path.join(import.meta.dirname, '..'), set = path.join(root, 'tests', 'fixtures', 'ocr');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const flag = (k) => process.argv.includes('--' + k);
const opt = { ara: arg('ara', 'ara'), dpi: +arg('dpi', 250), clean: !flag('no-clean'), passes: arg('passes', flag('split') ? 'ara,eng' : '').split(',').filter(Boolean), only: arg('only', ''), out: arg('out', ''), engine: arg('engine', 'tesseract'), tiltMin: +arg('tilt-min', 0.1) };

// --- text comparison: tashkeel, tatweel and punctuation ignored (Tesseract drops or moves them), spaces collapsed ---
const norm = (s) => s.normalize('NFC').replace(/[ً-ْٰـ]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
const wordsRight = (truth, read) => {
  const have = new Map();
  for (const w of norm(read).split(' ')) have.set(w, (have.get(w) ?? 0) + 1);
  const t = norm(truth).split(' ');
  let ok = 0;
  for (const w of t) if (have.get(w)) { ok++; have.set(w, have.get(w) - 1); }
  return { ok, of: t.length };
};
const editDistance = (a, b) => { // Levenshtein, two rows
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i), cur = new Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
};
const charsRight = (truth, read) => { const t = [...norm(truth)], r = [...norm(read)]; return Math.max(0, 1 - editDistance(t, r) / t.length); };

// --- the page picture, as the app makes it: drawn at `dpi`, grey, cleaned ---
function picture(pdf) {
  const doc = m.Document.openDocument(fs.readFileSync(pdf), 'application/pdf'), k = opt.dpi / 72;
  const pix = doc.loadPage(0).toPixmap(m.Matrix.scale(k, k), m.ColorSpace.DeviceGray, false);
  let g = { w: pix.getWidth(), h: pix.getHeight(), px: new Uint8Array(pix.getPixels()) }, angle = 0, grain = 0;
  if (opt.clean) ({ gray: g, angle, grain } = clean(g, opt.tiltMin));
  const out = new m.Pixmap(m.ColorSpace.DeviceGray, [0, 0, g.w, g.h], false);
  out.getPixels().set(g.px);
  return { png: Buffer.from(out.asPNG()), angle, grain };
}

// --- engines: lines of words in reading order ---
async function tesseract() {
  const T = createRequire(import.meta.url)('tesseract.js'), langs = (opt.passes.length ? opt.passes : ['ara+eng']).map((l) => l.replace(/ara/, opt.ara));
  const workers = [];
  for (const lang of langs) {
    const w = await T.createWorker(lang, 1, { langPath: path.join(root, 'public', 'ocr'), gzip: true, cacheMethod: 'none' });
    await w.setParameters({ tessedit_pageseg_mode: '3', preserve_interword_spaces: '1', user_defined_dpi: String(opt.dpi) });
    workers.push(w);
  }
  return {
    async read(png) {
      const passes = [];
      for (const w of workers) passes.push(linesOf((await w.recognize(png, {}, { blocks: true })).data));
      return passes.reduce((a, b) => mergePasses(a, b));
    },
    stop: () => Promise.all(workers.map((w) => w.terminate())),
  };
}
function surya(pages) { // tools/ocr-surya.py (Python venv .venv-surya) reads every page's picture in one go, one JSON line a page
  const py = path.join(root, '.venv-surya', 'Scripts', 'python.exe'), files = pages.map((f) => path.join(set, f.slice(0, -4) + '.ocr.png'));
  pages.forEach((f, i) => fs.writeFileSync(files[i], picture(path.join(set, f)).png));
  let done;
  try { done = execFileSync(py, [path.join(root, 'tools', 'ocr-surya.py'), ...files], { maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim().split('\n').map((l) => JSON.parse(l)); }
  finally { files.forEach((f) => fs.rmSync(f, { force: true })); }
  let i = 0;
  return { seconds: 0, async read() { const r = done[i++]; this.seconds = r.seconds; return r.lines; }, stop: async () => {} };
}

const pages = fs.readdirSync(set).filter((f) => f.endsWith('.pdf') && f.startsWith(opt.only)).sort();
const engine = await (opt.engine === 'surya' ? surya(pages) : tesseract());
const rows = [];
console.log(`engine ${opt.engine}${opt.engine === 'tesseract' ? ` (${opt.ara}; passes ${(opt.passes.length ? opt.passes : ['ara+eng']).join(', ')})` : ''}, ${opt.dpi} dpi, clean-up ${opt.clean ? 'on' : 'off'}`);
console.log('page                        words  words right  chars right  grain  tilt    s');
for (const f of pages) {
  const name = f.slice(0, -4), truth = fs.readFileSync(path.join(set, name + '.txt'), 'utf8');
  const { png, angle, grain } = picture(path.join(set, f)), t0 = Date.now();
  const lines = await engine.read(png, path.join(opt.out || set, name)), s = engine.seconds || (Date.now() - t0) / 1000;
  const read = lines.map((l) => l.words.map((w) => w.text).join(' ')).join('\n');
  if (opt.out) { fs.mkdirSync(opt.out, { recursive: true }); fs.writeFileSync(path.join(opt.out, name + '.txt'), read + '\n'); fs.writeFileSync(path.join(opt.out, name + '.png'), png); }
  const w = wordsRight(truth, read), c = charsRight(truth, read);
  rows.push({ words: w.of, ok: w.ok, chars: c, s });
  console.log(`${name.padEnd(28)}${String(w.of).padStart(5)}  ${(100 * w.ok / w.of).toFixed(1).padStart(10)} %  ${(100 * c).toFixed(1).padStart(10)} %  ${(grain ? grain.toFixed(0) : '').padStart(5)}  ${(angle ? angle.toFixed(2) + '°' : '').padStart(6)}  ${s.toFixed(1).padStart(4)}`);
}
await engine.stop();
const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
console.log(`${'all pages'.padEnd(28)}${String(sum('words')).padStart(5)}  ${(100 * sum('ok') / sum('words')).toFixed(1).padStart(10)} %  ${(100 * rows.reduce((a, r) => a + r.chars, 0) / rows.length).toFixed(1).padStart(10)} %                 ${(sum('s') / rows.length).toFixed(1).padStart(4)}`);
