// Measures OCR on the test set tests/fixtures/ocr/ (NN-name.pdf + NN-name.txt with the correct text): words right (how
// many of the page's words come out exactly, in any order) and chars right (100 − character error rate, so the numbers
// compare with published benchmarks), placement (share of words whose text-layer box sits on the recognised box), seconds per page. Same code path as the app (tesseract.js, src/lib/ocr.ts,
// src/lib/ocr-clean.ts), run in Node:  node tools/ocr-accuracy.mjs [--ara ara|ara_best] [--dpi 250] [--no-clean]
// [--passes ara+eng,ara] [--tilt-min 0.1] [--psm 3] [--thin 1] [--no-orient] [--no-tables] [--only 03] [--out folder] [--engine tesseract|surya]   (--out writes what was read + the picture)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import * as m from '../engine/mupdf-wasm/dist/mupdf.js';
import { linesOf, mergePasses, upright, readPage } from '../src/lib/ocr.ts';
import { alignBlocks } from '../src/lib/ocr-align.ts';
import { readBlocks, LONG_SIDE } from '../src/lib/ocr-strong.ts';
import { enlarge } from '../src/lib/ocr-clean.ts';
import { spawn } from 'node:child_process';
import os from 'node:os';
import { inkPlacement } from '../tests/ocr-check.mjs';
import { clean, unturn } from '../src/lib/ocr-clean.ts';
import { addTextLayer, layerWords } from '../src/lib/engine/ocr.ts';

const root = path.join(import.meta.dirname, '..'), set = path.join(root, 'tests', 'fixtures', 'ocr');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const flag = (k) => process.argv.includes('--' + k);
const opt = { ara: arg('ara', 'ara'), dpi: +arg('dpi', 250), clean: !flag('no-clean'), passes: arg('passes', flag('split') ? 'ara,eng' : '').split(',').filter(Boolean), only: arg('only', ''), out: arg('out', ''), engine: arg('engine', 'tesseract'), suryaDir: arg('surya-dir', ''), tiltMin: +arg('tilt-min', 0.1), psm: arg('psm', '3'), thin: +arg('thin', 1), orient: !flag('no-orient'), tables: !flag('no-tables') };

// --- text comparison: tashkeel, tatweel and punctuation ignored (Tesseract drops or moves them), spaces collapsed ---
// Also: lam + alef in either order count the same (the text layers of many Arabic PDFs, the real set's truth, store the
// ligature reversed); Arabic-Indic digits count as Western ones; a number and the letter stuck to it ("2024م") are two words.
const digit = (d) => String('٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹'.indexOf(d) % 10);
const norm = (s) => s.normalize('NFC').replace(/[ً-ْٰـ]/g, '').replace(/([اأإآ])ل/g, 'ل$1').replace(/[٠-٩۰-۹]/g, digit)
  .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/(\p{N})(?=\p{L})|(\p{L})(?=\p{N})/gu, '$1$2 ').replace(/\s+/g, ' ').trim();
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
const toPng = (g) => { const out = new m.Pixmap(m.ColorSpace.DeviceGray, [0, 0, g.w, g.h], false); out.getPixels().set(g.px); return Buffer.from(out.asPNG()); };
async function picture(pdf, engine) {
  const doc = m.Document.openDocument(fs.readFileSync(pdf), 'application/pdf'), k = opt.dpi / 72;
  const pix = doc.loadPage(0).toPixmap(m.Matrix.scale(k, k), m.ColorSpace.DeviceGray, false);
  let g = { w: pix.getWidth(), h: pix.getHeight(), px: new Uint8Array(pix.getPixels()) }, angle = 0, grain = 0, quarter = 0, ruled = false;
  const w = g.w, h = g.h;
  if (opt.clean && opt.orient && engine.readGray) ({ gray: g, quarter } = await upright(engine.readGray, g, opt.dpi)); // a sideways sheet is turned first
  if (opt.clean) ({ gray: g, angle, grain, ruled } = clean(g, opt.tiltMin));
  ruled &&= opt.tables;
  return { png: toPng(g), gray: g, angle, grain, quarter, ruled, w, h, k };
}

// --- placement: the text layer written as the app writes it; a word is placed when the box search and selection see for it
// (MuPDF's structured text) covers at least 60 % of the recognised word's box, turned back to the page (box overlap = area of
// the intersection / area of the recognised box). MuPDF glues a Latin word inside an Arabic line to its neighbour (one
// text-layer word, the right box; search still finds either), so the word may be part of the layer word ---
const fontFile = (f) => new m.Font(f, fs.readFileSync(path.join(root, 'public', 'fonts', f + '.ttf')));
const fonts = { regular: fontFile('Tajawal-Regular'), bold: fontFile('Tajawal-Bold') };
function placement(pdf, lines, pic) {
  const words = lines.flatMap((l) => l.words).map((w) => unturn(w, pic.angle, pic.w, pic.h, pic.quarter));
  const out = addTextLayer(m, fs.readFileSync(pdf), [{ page: 0, scale: pic.k, lines, tilt: { angle: pic.angle, w: pic.w, h: pic.h, quarter: pic.quarter } }], fonts);
  const layer = layerWords(m, out, 0), n = norm;
  const overlap = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0)) / ((a.x1 - a.x0) * (a.y1 - a.y0));
  let placed = 0;
  for (const w of words) {
    const box = { x0: w.x0 / pic.k, y0: w.y0 / pic.k, x1: w.x1 / pic.k, y1: w.y1 / pic.k };
    if (layer.some((l) => n(l.text).includes(n(w.text)) && overlap(box, l) >= 0.6)) placed++;
    else if (process.env.PLACE_DEBUG) { const best = layer.map((l) => ({ l, o: overlap(box, l) })).sort((a, b) => b.o - a.o)[0]; console.log('  not placed:', JSON.stringify(w.text), box, '| best:', JSON.stringify(best?.l.text), best?.o.toFixed(2), best?.l); }
  }
  return { placed: words.length ? placed / words.length : 1, ink: inkPlacement(m, out, 0).placed };
}

// --- engines: lines of words in reading order ---
async function tesseract() {
  const T = createRequire(import.meta.url)('tesseract.js'), langs = (opt.passes.length ? opt.passes : ['ara+eng']).map((l) => l.replace(/ara/, opt.ara));
  const workers = [];
  for (const lang of langs) {
    const w = await T.createWorker(lang, 1, { langPath: path.join(root, 'public', 'ocr'), gzip: true, cacheMethod: 'none' });
    await w.setParameters({ tessedit_pageseg_mode: opt.psm, preserve_interword_spaces: '1', user_defined_dpi: String(opt.dpi) });
    workers.push(w);
  }
  const one = (w) => ({
    readGray: async (g, dpi, ruled = false) => { await w.setParameters({ user_defined_dpi: String(Math.round(dpi)), tessedit_pageseg_mode: ruled ? '4' : opt.psm }); const lines = linesOf((await w.recognize(toPng(g), {}, { blocks: true })).data); await w.setParameters({ user_defined_dpi: String(opt.dpi) }); return lines; },
  }), engines = workers.map(one);
  return {
    page: (g, dpi, ruled) => readPage(engines, g, dpi, ruled),
    readGray: async (g, dpi) => { await workers[0].setParameters({ user_defined_dpi: String(Math.round(dpi)) }); const lines = linesOf((await workers[0].recognize(toPng(g), {}, { blocks: true })).data); await workers[0].setParameters({ user_defined_dpi: String(opt.dpi) }); return lines; },
    async read(png, _file, ruled = false) {
      const passes = [];
      for (const w of workers) { await w.setParameters({ tessedit_pageseg_mode: ruled ? '4' : opt.psm }); passes.push(linesOf((await w.recognize(png, {}, { blocks: true })).data)); }
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
  return { seconds: 0, async read(_png, file) { const r = done[i++]; this.seconds = r.seconds; if (opt.out) { fs.mkdirSync(path.dirname(file + '.x'), { recursive: true }); fs.writeFileSync(file + '.surya.json', JSON.stringify(r)); } return r.lines; }, stop: async () => {} };
}

// the committed synthetic pages, then real/ (tools/get-ocr-set.mjs: r-* rendered from public PDFs, s-* real scans)
const real = fs.existsSync(path.join(set, 'real')) ? fs.readdirSync(path.join(set, 'real')).filter((f) => f.endsWith('.pdf')).sort().map((f) => 'real/' + f) : [];
// v3 (tests/fixtures/ocr/make-ocr-v3.mjs): synthetic pages tagged by document type, arrangement and kind of scan
const v3 = fs.existsSync(path.join(set, 'v3', 'manifest.json')) ? JSON.parse(fs.readFileSync(path.join(set, 'v3', 'manifest.json'), 'utf8')) : [];
const realTags = fs.existsSync(path.join(set, 'real', 'manifest.json')) ? JSON.parse(fs.readFileSync(path.join(set, 'real', 'manifest.json'), 'utf8')) : [];
const tags = new Map([...v3.map((e) => ['v3/' + e.file, { ...e, set: 'v3' }]), ...realTags.map((e) => ['real/' + e.file, e])]);
const pages = [...fs.readdirSync(set).filter((f) => f.endsWith('.pdf')).sort(), ...real, ...v3.map((e) => 'v3/' + e.file)].filter((f) => opt.only.split(',').some((o) => f.startsWith(o) || path.basename(f).startsWith(o))).filter((f) => !f.startsWith('real/m-') || +f.slice(7, 10) % opt.thin === 0); // --thin N: every Nth bulk page
const group = (f) => (f.startsWith('real/s') ? 'real, scanned' : f.startsWith('real/m') ? 'Misraj bulk' : f.startsWith('real/') ? 'real, rendered' : f.startsWith('v3/') ? 'v3 synthetic' : 'synthetic');
/** `--engine live`: the app's own best-quality path — llama.cpp's server with Surya OCR 2's model (the pack on a desktop;
 *  here .venv-surya/llama and the Hugging Face cache), the page sent through src/lib/ocr-strong.ts, its text blocks placed
 *  on Tesseract's word boxes (src/lib/ocr-align.ts). */
async function live() {
  const snap = path.join(os.homedir(), '.cache', 'huggingface', 'hub', 'models--datalab-to--surya-ocr-2-gguf', 'snapshots'), dirn = fs.readdirSync(snap)[0];
  const port = 8099, url = 'http://127.0.0.1:' + port;
  const server = spawn(path.join(root, '.venv-surya', 'llama', 'llama-server.exe'), ['-m', path.join(snap, dirn, 'surya-2.gguf'), '--mmproj', path.join(snap, dirn, 'surya-2-mmproj.gguf'), '--host', '127.0.0.1', '--port', String(port), '--parallel', '1', '--ctx-size', '16384', '--alias', 'datalab-to/surya-ocr-2', '--jinja'], { stdio: 'ignore' });
  for (let i = 0; i < 120; i++) { try { if ((await fetch(url + '/health')).ok) break; } catch {} await new Promise((r) => setTimeout(r, 1000)); }
  const base = await tesseract();
  return {
    async page(g, dpi, ruled) {
      const tl = await base.page(g, dpi, ruled), s = Math.min(1, LONG_SIDE / Math.max(g.w, g.h)), small = s < 1 ? enlarge(g, s) : g;
      try {
        const blocks = (await readBlocks(url, new Uint8Array(toPng(small)), small.w, small.h)).map((b) => ({ ...b, x0: b.x0 / s, x1: b.x1 / s, y0: b.y0 / s, y1: b.y1 / s }));
        if (opt.out) { const f = path.join(opt.out, this.name + '.blocks.json'); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify({ blocks, tess: tl })); } // to debug the alignment without the model
        return alignBlocks(blocks, tl);
      } catch (e) { console.log('  (strong failed, Tesseract kept:', e.message + ')'); return tl; }
    },
    readGray: base.readGray, read: base.read,
    stop: async () => { server.kill(); await base.stop(); },
  };
}
/** `--engine saved --surya-dir DIR`: the blocks and Tesseract lines a `--engine live --out DIR` run saved, aligned again with the current code (no model, no OCR). */
const saved = () => ({ page: async () => { const j = JSON.parse(fs.readFileSync(path.join(opt.suryaDir, engine.name + '.blocks.json'), 'utf8')); return alignBlocks(j.blocks, j.tess); }, readGray: async () => [], stop: async () => {} });
const engine = await (opt.engine === 'surya' ? surya(pages) : opt.engine === 'live' ? live() : opt.engine === 'saved' ? saved() : tesseract());
if (opt.engine === 'strong') { // Surya's text (from --surya-dir, written by an earlier --engine surya --out run) on Tesseract's word boxes
  const base = engine.page;
  engine.page = async (g, dpi, ruled) => { const tl = await base(g, dpi, ruled), j = path.join(opt.suryaDir, engine.name + '.surya.json'); if (!fs.existsSync(j)) return tl; const r = JSON.parse(fs.readFileSync(j, 'utf8')); engine.seconds = r.seconds; return alignBlocks(r.lines.map((l) => ({ text: l.words[0].text, ...l.words[0] })), tl); };
}
const rows = [], groups = new Map();
console.log(`engine ${opt.engine}${opt.engine === 'tesseract' ? ` (${opt.ara}; passes ${(opt.passes.length ? opt.passes : ['ara+eng']).join(', ')})` : ''}, ${opt.dpi} dpi, clean-up ${opt.clean ? 'on' : 'off'}`);
console.log('page                        words  words right  chars right  placed   ink  grain  tilt    s');
for (const f of pages) {
  const name = f.slice(0, -4), truth = fs.readFileSync(path.join(set, name + '.txt'), 'utf8');
  if (!groups.has(group(f))) { groups.set(group(f), []); if (real.length) console.log('-- ' + group(f)); }
  engine.name = name; const t0 = Date.now(), pic = await picture(path.join(set, f), engine), { png, angle, grain } = pic;
  const lines = engine.page ? await engine.page(pic.gray, opt.dpi, pic.ruled) : await engine.read(png, path.join(opt.out || set, name), pic.ruled), s = engine.seconds || (Date.now() - t0) / 1000;
  const read = lines.map((l) => l.words.map((w) => w.text).join(' ')).join('\n');
  if (opt.out) { fs.mkdirSync(path.join(opt.out, path.dirname(name)), { recursive: true }); fs.writeFileSync(path.join(opt.out, name + '.txt'), read + '\n'); fs.writeFileSync(path.join(opt.out, name + '.png'), png); }
  const w = wordsRight(truth, read), c = charsRight(truth, read), pl = placement(path.join(set, f), lines, pic), p = pl.placed;
  rows.push({ words: w.of, ok: w.ok, chars: c, placed: p, ink: pl.ink, s, tag: tags.get(f) }); groups.get(group(f)).push(rows.at(-1));
  console.log(`${path.basename(name).padEnd(28)}${String(w.of).padStart(5)}  ${(100 * w.ok / w.of).toFixed(1).padStart(10)} %  ${(100 * c).toFixed(1).padStart(10)} %  ${(100 * p).toFixed(1).padStart(5)} %${(100 * pl.ink).toFixed(0).padStart(5)} %  ${(grain ? grain.toFixed(0) : '').padStart(5)}  ${(pic.ruled ? 'T' : '').padStart(2)}${(pic.quarter ? pic.quarter * 90 + '°+' : '').padStart(5)}${(angle ? angle.toFixed(2) + '°' : '').padStart(6)}  ${s.toFixed(1).padStart(4)}`);
}
await engine.stop();
const total = (label, rows) => {
  const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
  console.log(`${label.padEnd(28)}${String(sum('words')).padStart(5)}  ${(100 * sum('ok') / sum('words')).toFixed(1).padStart(10)} %  ${(100 * rows.reduce((a, r) => a + r.chars, 0) / rows.length).toFixed(1).padStart(10)} %  ${(100 * rows.reduce((a, r) => a + r.placed, 0) / rows.length).toFixed(1).padStart(5)} %${(100 * rows.reduce((a, r) => a + r.ink, 0) / rows.length).toFixed(0).padStart(5)} %               ${(sum('s') / rows.length).toFixed(1).padStart(4)}`);
};
if (groups.size > 1) for (const [g, r] of groups) total(`${g} (${r.length})`, r);
total('all pages', rows);
// the v3 pages sliced three ways (a page counts in one slice per dimension)
for (const dim of ['type', 'arrangement', 'scan']) {
  const slices = new Map();
  for (const r of rows) if (r.tag) { const k = `${r.tag.set === 'real' ? 'real: ' : ''}${r.tag[dim]}`; (slices.get(k) ?? slices.set(k, []).get(k)).push(r); }
  if (!slices.size) continue;
  console.log(`-- v3 by ${dim}`);
  for (const [k, r] of [...slices].sort((a, b) => a[0].localeCompare(b[0]))) total(`${k} (${r.length})`.slice(0, 28), r);
}
