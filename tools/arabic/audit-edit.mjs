// Audit of editing EXISTING Arabic text (page editor, "Change text"): every corpus file × every selectable line of a
// known kind × four replacement scenarios, through the real engine code path the editor uses (pageObjects → the same
// Edit the editor builds in liftLine → pick/fontAt as the fontcheck job → editPage → save → reopen).
//   node tools/arabic/audit-edit.mjs [--files <substring>] [--kinds letter,mixed,...] [--out tests/audit-arabic/out]
// Writes out/results.json (one record per edit), out/<edit>.pdf (the saved page), out/img/<edit>-{before,mupdf}.png
// (the line box before and after, MuPDF at 4×) and out/fonts/<name> (the font bytes each edit was written with, for the
// browser's reference rendering in audit-browser.mjs). Nothing in the app is changed.
import { shown } from '../../src/lib/engine/bidi.ts';
import fs from 'node:fs';
import path from 'node:path';
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import * as hb from 'harfbuzzjs';
import { editPage, pageObjects, BASELINE } from '../../src/lib/engine/editpage.ts';
import { fontAt, fontName, pick } from '../../src/lib/engine/ownfont.ts';
import { TEXTS, SCENARIOS, replacement } from '../../tests/fixtures/arabic/texts.mjs';

const ROOT = path.join(import.meta.dirname, '..', '..'), FIX = path.join(ROOT, 'tests', 'fixtures', 'arabic');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = path.resolve(ROOT, arg('--out', 'tests/audit-arabic/out')), ONLY = arg('--files', ''), KINDS = arg('--kinds', '')?.split(',').filter(Boolean), MERGE = arg('--merge', '');
for (const d of ['', 'img', 'fonts']) fs.mkdirSync(path.join(OUT, d), { recursive: true });

const file = (f) => new Uint8Array(fs.readFileSync(path.join(ROOT, 'public', 'fonts', f)));
import { makeSubsetter } from '../../src/lib/engine/fontstore.ts';
const own = { hb, file, subset: makeSubsetter(fs.readFileSync(path.join(ROOT, 'node_modules/harfbuzzjs/dist/harfbuzz-subset.wasm'))) };
const fonts = { regular: new m.Font('Tajawal-Regular', file('Tajawal-Regular.ttf')), bold: new m.Font('Tajawal-Bold', file('Tajawal-Bold.ttf')) };

// ---- matching a page line to the paragraph it came from (bidi may scramble the order; the letters stay) ----
const letters = (s) => [...s.normalize('NFKC')].filter((c) => /[ء-يٱ-ۓA-Za-z]/.test(c));
const hist = (s) => letters(s).reduce((h, c) => ((h[c] = (h[c] ?? 0) + 1), h), {});
function similarity(a, b) { // shared letters / letters of the longer one
  const ha = hist(a), hb_ = hist(b), keys = new Set([...Object.keys(ha), ...Object.keys(hb_)]);
  let shared = 0, na = 0, nb = 0;
  for (const k of keys) { shared += Math.min(ha[k] ?? 0, hb_[k] ?? 0); na += ha[k] ?? 0; nb += hb_[k] ?? 0; }
  return shared / Math.max(na, nb, 1);
}
const TRUTH = TEXTS.map((t) => ({ kind: t.kind, text: t.cells ? t.cells.join(' ') : t.text, cells: t.cells }));
// files made by make-corpus-types.mjs / make-scans.mjs carry their own paragraphs (the truth) and tags in tags.json
const TAGS = fs.existsSync(path.join(FIX, 'tags.json')) ? JSON.parse(fs.readFileSync(path.join(FIX, 'tags.json'), 'utf8')) : {};
function kindOf(line, truth = TRUTH) {
  let best = null, score = 0;
  for (const t of truth) {
    // a table cell on its own, or the whole row
    const cands = t.cells ? [t.text, ...t.cells] : [t.text];
    for (const c of cands) {
      const s = similarity(line, c) * Math.min(1, letters(line).length / Math.max(1, letters(c).length));
      if (s > score) { score = s; best = { ...t, truth: c }; }
      if (truth !== TRUTH && letters(line).length >= 10 && letters(line).length < letters(c).length * 0.9) { // a fragment of the paragraph
        const ha = hist(line), hc = hist(c); let shared = 0; for (const k of Object.keys(ha)) shared += Math.min(ha[k], hc[k] ?? 0);
        const cont = shared / letters(line).length; if (cont >= 0.95 && cont > score) { score = cont; best = { ...t, truth: c, fragment: true }; }
      }
    }
  }
  return score >= 0.8 ? best : null;
}
const norm = (s) => s.normalize('NFKC').replace(/\s+/g, ' ').trim();
// A mixed-direction line cannot be read back uniquely (bidi is not invertible: a bracket's direction and a number's side depend on the
// pairing chosen), so a lifted line also counts as the typed one when both are DRAWN the same left to right, brackets aside.
const shownKey = (s) => String.fromCodePoint(...shown([...norm(s)].map((c) => c.codePointAt(0)))).replace(/[()\[\]{}<>«»]/g, '·').replace(/ /g, '');
const sameLine = (a, b) => norm(a) === norm(b) || shownKey(a) === shownKey(b);
// Loosely the same: the letters agree (spaces inside words, tatweel, a lam-alef pair's order and U+FFFD, which the source PDF's own text
// gave for a letter it cannot map, set aside) and the marks agree as a multiset (where a mark stands in a letter's cluster varies by reader).
const MARK = /[\u064b-\u065f\u0670]/g, skeleton = (s) => norm(s).replace(/[\ufffd\u0640\s]/g, '').replace(MARK, '').replace(/([اأإآ])ل/g, 'ل$1');
// a mark that follows no letter (the source line's lift left one after a full stop) cannot be drawn on anything: not counted
const marksOf = (s) => [...(norm(s).replace(/([^\u0621-\u064a\u0671-\u06d3\u064b-\u065f\u0670\u0640])[\u064b-\u065f\u0670]+/g, '$1').match(MARK) ?? [])].sort().join('');
const looseLine = (a, b) => skeleton(a) === skeleton(b) && marksOf(a) === marksOf(b);
const marks = /[ً-ٰٟ]/g;
/** How the text the editor shows differs from the real paragraph. */
function liftDiff(lifted, truth) {
  const a = norm(lifted), b = norm(truth);
  if (a === b) return [];
  const out = [];
  const strip = (s) => s.replace(marks, '');
  if (strip(a) === strip(b)) out.push('marks');
  if (/هللا|اإل|األ|اآل|الا|ال(?= |$)/.test(a) && !/هللا|اإل|األ|اآل/.test(b)) out.push('lamalef');
  if (letters(a).join('') !== letters(b).join('') && similarity(a, b) > 0.9) out.push('order');
  const punct = (s) => [...s].filter((c) => /[\p{P}\p{S}]/u.test(c)).join('');
  if (punct(a) !== punct(b) && [...punct(a)].sort().join('') === [...punct(b)].sort().join('')) out.push('punct-order');
  const digits = (s) => s.match(/[0-9٠-٩]+/g)?.join(',') ?? '';
  if (digits(a) !== digits(b)) out.push('digits');
  if (similarity(a, b) < 0.9) out.push('letters');
  return out.length ? out : ['other'];
}

// ---- the page as the editor would see it ----
function lineInfo(l) { return { text: l.text, x: +l.x.toFixed(2), y: +l.y.toFixed(2), w: +l.w.toFixed(2), h: +l.h.toFixed(2), base: +l.base.toFixed(2), size: +l.size.toFixed(2), bold: l.bold, color: l.color.map((c) => +c.toFixed(3)), rtl: l.rtl, font: l.font }; }
const near = (a, b, tol) => Math.abs(a.x - b.x) < tol && Math.abs(a.y - b.y) < tol && Math.abs(a.w - b.w) < tol && Math.abs(a.h - b.h) < tol;

function fontsOf(page) { // the page's font resources: name, kind, embedded program, ToUnicode
  const out = [], dict = page.getObject().get('Resources', 'Font');
  if (!dict?.isDictionary()) return out;
  dict.forEach((f, k) => {
    const sub = f.get('Subtype').asName?.(), desc = sub === 'Type0' ? f.get('DescendantFonts').get(0) : f, fd = desc.get('FontDescriptor');
    const prog = ['FontFile', 'FontFile2', 'FontFile3'].find((x) => fd?.get(x)?.isStream?.());
    out.push({ res: String(k), base: f.get('BaseFont').asName?.() ?? '', subtype: sub, cid: sub === 'Type0' ? desc.get('Subtype').asName?.() : undefined, program: prog ? `${prog}${prog === 'FontFile3' ? '/' + fd.get(prog).get('Subtype').asName?.() : ''}` : 'none', bytes: prog ? (() => { const b = fd.get(prog).readStream(), n = b.length; b.destroy(); return n; })() : 0, toUnicode: !!f.get('ToUnicode')?.isStream?.(), encoding: f.get('Encoding').isName?.() ? f.get('Encoding').asName() : f.get('Encoding').isDictionary?.() ? 'dict' : undefined });
  });
  return out;
}
function lastContent(page) { // what stamp() appended: the new text's drawing commands
  const c = page.getObject().get('Contents');
  const s = c.isArray() ? c.get(c.length - 1) : c;
  const buf = s.readStream(), str = buf.asString(); buf.destroy(); return str;
}
function crop(page, box, scale, pad) { // the line box as a PNG, rendering only that region
  const b = [Math.max(0, box.x - pad), Math.max(0, box.y - pad), box.x + box.w + pad, box.y + box.h + pad];
  const pix = new m.Pixmap(m.ColorSpace.DeviceRGB, [Math.floor(b[0] * scale), Math.floor(b[1] * scale), Math.ceil(b[2] * scale), Math.ceil(b[3] * scale)], false);
  pix.clear(255);
  const dev = new m.DrawDevice(m.Matrix.scale(scale, scale), pix);
  page.run(dev, m.Matrix.identity); dev.close(); dev.destroy();
  const png = pix.asPNG(); pix.destroy();
  return { png, box: b, scale };
}

// --all: every file in its own process (the WASM heap does not shrink), partial results merged at the end
if (process.argv.includes('--all')) {
  const { spawnSync } = await import('node:child_process');
  const sub = (d) => (fs.existsSync(path.join(FIX, d)) ? fs.readdirSync(path.join(FIX, d)).filter((f) => f.endsWith('.pdf')).map((f) => d + '/' + f) : []);
  const all = fs.readdirSync(FIX).filter((f) => f.endsWith('.pdf')).concat(sub('real'), sub('scans'));
  fs.mkdirSync(path.join(OUT, 'parts'), { recursive: true });
  for (const f of all) {
    const part = path.join(OUT, 'parts', path.basename(f, '.pdf') + '.json');
    if (fs.existsSync(part)) continue;
    const r = spawnSync(process.execPath, [import.meta.filename, '--files', f, '--out', OUT, '--merge', part], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    process.stdout.write(r.stdout.split(/\r?\n/).filter((l) => l && !l.startsWith('warning')).join('\n') + '\n');
    if (r.status) console.log('FAILED', f, r.stderr.split(/\r?\n/).filter((l) => /Error|error/.test(l)).slice(0, 2).join(' | '));
  }
  const parts = fs.readdirSync(path.join(OUT, 'parts')).map((p) => JSON.parse(fs.readFileSync(path.join(OUT, 'parts', p), 'utf8')));
  const merged = { when: new Date().toISOString(), files: parts.flatMap((p) => p.files), results: parts.flatMap((p) => p.results) };
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(merged, null, 1));
  const rs = merged.results;
  console.log(`\n${rs.length} edits in ${merged.files.length} files, ${rs.filter((r) => r.error).length} errors, text read back exactly (MuPDF): ${rs.filter((r) => r.extract?.mupdfLineOk).length}, own font kept: ${rs.filter((r) => r.font && !r.font.using).length}`);
  process.exit(0);
}
const sub = (d) => (fs.existsSync(path.join(FIX, d)) ? fs.readdirSync(path.join(FIX, d)).filter((f) => f.endsWith('.pdf')).map((f) => d + '/' + f) : []);
const results = [], files = fs.readdirSync(FIX).filter((f) => f.endsWith('.pdf')).concat(sub('real'), sub('scans'))
  .filter((f) => !ONLY || f === ONLY || (!MERGE && f.includes(ONLY)));
const fileSummaries = [];
for (const f of files) {
  const bytes = new Uint8Array(fs.readFileSync(path.join(FIX, f))), id = path.basename(f, '.pdf');
  const doc = new m.PDFDocument(bytes), page = doc.loadPage(0), [, , pw, ph] = page.getBounds();
  const objs = pageObjects(page), stAll = page.toStructuredText('preserve-whitespace');
  let allLines = 0; stAll.walk({ beginLine() { allLines++; } }); stAll.destroy();
  const summary = { file: f, pageW: +pw.toFixed(1), pageH: +ph.toFixed(1), bytes: bytes.length, linesOnPage: allLines, linesSelectable: objs.lines.length, fonts: fontsOf(page), lift: [] };
  const seen = new Set(), picked = [], ownTruth = TAGS[f]?.lines?.length ? TAGS[f].lines.map((text, i) => ({ kind: 'doc' + i, text })) : null;
  summary.tags = TAGS[f] ? { type: TAGS[f].type, arrangement: TAGS[f].arrangement, source: TAGS[f].source, dpi: TAGS[f].dpi } : undefined;
  for (const [i, l] of objs.lines.entries()) {
    const k = ownTruth ? kindOf(l.text, ownTruth) : kindOf(l.text);
    if (!k) continue;
    const diff = k.fragment ? [/هللا|اإل|األ|اآل|امل[^ ]/.test(l.text) && 'lamalef', / [ً-ٰٟ]/.test(l.text) && 'mark-space'].filter(Boolean) : liftDiff(l.text, k.truth);
    summary.lift.push({ line: i, kind: k.kind, shown: l.text, truth: k.truth, fragment: !!k.fragment, diff, font: l.font, size: +l.size.toFixed(1), rtl: l.rtl });
    const key = k.kind + (k.cells ? ':' + k.truth : '');
    if (seen.has(k.kind) || (KINDS.length && !KINDS.includes(k.kind))) continue;
    seen.add(k.kind); picked.push({ i, l, k, key });
  }
  if (ownTruth) picked.splice(6); // typed documents: the first six matched paragraphs
  // real documents and scans with a text layer (no known paragraphs): the first six Arabic lines
  if (!picked.length && (f.startsWith('real/') || f.startsWith('scans/'))) objs.lines.filter((l) => l.rtl && l.text.length > 8).slice(0, 6).forEach((l) => picked.push({ i: objs.lines.indexOf(l), l, k: { kind: 'real', truth: l.text }, key: 'real' }));
  fileSummaries.push(summary);
  console.log(`${f}: ${objs.lines.length}/${allLines} lines selectable, ${picked.length} kinds; lift problems: ${summary.lift.filter((x) => x.diff.length).length}/${summary.lift.length}`);

  for (const { i, l, k } of picked) for (const scenario of SCENARIOS) {
    const id2 = `${id}__${i}-${k.kind}__${scenario}`;
    // the user types into the box what the editor showed (the lifted text), so "one word changed" starts from that
    const text = replacement(scenario === 'oneword' ? l.text : k.truth, scenario);
    const w = Math.max(l.w, l.rtl ? l.x + l.w - 24 : pw - l.x - 24);
    const edit = { kind: 'text', from: { x: l.x, y: l.y, w: l.w, h: l.h }, text, size: +l.size.toFixed(1), color: [...l.color], bold: l.bold, align: l.rtl ? 'right' : 'left', x: l.rtl ? l.x + l.w - w : l.x, y: l.base - BASELINE * l.size, w, h: l.h };
    const r = { id: id2, file: f, line: i, kind: k.kind, scenario, truth: k.truth, lifted: l.text, intended: text, before: lineInfo(l), edit: { x: edit.x, y: edit.y, w: edit.w, size: edit.size, bold: edit.bold, align: edit.align } };
    const before = crop(page, { x: Math.min(l.x, edit.x), y: l.y, w: Math.max(l.w, edit.w), h: l.h }, 4, 4);
    fs.writeFileSync(path.join(OUT, 'img', id2 + '-before.png'), before.png);
    r.cropBox = before.box;
    try {
      const own0 = fontAt(page, edit.from);
      const p = pick(hb, own0, text, edit.bold, file);
      r.font = { own: own0 ? fontName(own0) : null, ownRaw: own0?.getName() ?? null, ownBytes: own0?.getBuffer()?.length ?? 0, using: p.using, missing: p.missing, written: p.shaper.name, bold: p.shaper.bold };
      const fname = (p.shaper.name + '-' + p.shaper.bytes.length).replace(/[^A-Za-z0-9.-]/g, '_') + (p.shaper.bytes[0] === 0x4f ? '.otf' : '.ttf');
      if (!fs.existsSync(path.join(OUT, 'fonts', fname))) fs.writeFileSync(path.join(OUT, 'fonts', fname), p.shaper.bytes);
      r.font.file = fname;
      const t0 = performance.now();
      const src = new m.PDFDocument(bytes), out = editPage(m, src, 0, [edit], [], () => fonts, false, own);
      const saved = out.saveToBuffer('garbage=compact').asUint8Array().slice();
      r.ms = Math.round(performance.now() - t0);
      out.destroy(); src.destroy();
      fs.writeFileSync(path.join(OUT, id2 + '.pdf'), saved);
      r.sizeBefore = bytes.length; r.sizeAfter = saved.length;
      const d2 = m.Document.openDocument(saved, 'application/pdf'), p2 = d2.loadPage(0), o2 = pageObjects(p2);
      // (a) correctness, as MuPDF reads it back (the editor's own reader)
      const st2 = p2.toStructuredText('preserve-whitespace'), text2 = st2.asText(); st2.destroy();
      const cand = o2.lines.filter((x) => Math.abs(x.base - l.base) < l.size * 0.6 && x.x < edit.x + edit.w && x.x + x.w > edit.x);
      const newLine = cand.sort((a, b) => b.w - a.w)[0] ?? null;
      r.after = newLine ? lineInfo(newLine) : null;
      r.extract = { mupdfLine: newLine?.text ?? null, mupdfLineOk: !!newLine && sameLine(newLine.text, text), mupdfLineLoose: !!newLine && looseLine(newLine.text, text), srcLoose: looseLine(l.text, text) && !sameLine(l.text, text), mupdfPageHas: norm(text2).includes(norm(text)), oldGone: !norm(text2).includes(norm(l.text)) || norm(l.text) === norm(text) || norm(text).includes(norm(l.text)) };
      r.extract.diff = newLine ? liftDiff(newLine.text, text) : ['lost'];
      // (b) what was drawn: glyph 0 (tofu) in the new commands, how many text objects
      const ops = lastContent(p2);
      r.drawn = { notdef: (ops.match(/<0000>/g) ?? []).length, glyphs: (ops.match(/<[0-9a-f]{4}>/gi) ?? []).length, actualText: (ops.match(/ActualText/g) ?? []).length, fakeBold: /2 Tr/.test(ops) };
      // (c) fidelity vs the old line
      if (newLine) {
        const edge = l.rtl ? (l.x + l.w) - (newLine.x + newLine.w) : newLine.x - l.x;
        r.fidelity = { dEdge: +edge.toFixed(2), dBase: +(newLine.base - l.base).toFixed(2), dSize: +(newLine.size - l.size).toFixed(2), dH: +(newLine.h - l.h).toFixed(2), sameColor: l.color.every((c, j) => Math.abs(c - newLine.color[j]) < 0.02), boldKept: l.bold === newLine.bold, fontKept: fontName({ getName: () => newLine.font }) === l.font, fontAfter: newLine.font, overflowsPage: newLine.x < 0 || newLine.x + newLine.w > pw + 0.5, wrapped: cand.length > 1 || o2.lines.some((x) => x !== newLine && x.base > l.base + l.size * 0.6 && x.base < l.base + l.size * 2 && !objs.lines.some((y) => Math.abs(y.base - x.base) < 0.5 && norm(y.text) === norm(x.text))) };
      }
      // (d) side effects
      const others = objs.lines.filter((x) => x !== l);
      const kept = others.filter((x) => o2.lines.some((y) => norm(y.text) === norm(x.text) && near(x, y, 0.6)));
      const gone = others.filter((x) => !o2.lines.some((y) => norm(y.text) === norm(x.text)));
      r.side = { othersBefore: others.length, othersKept: kept.length, othersGone: gone.length, othersMoved: others.length - kept.length - gone.length, goneSample: gone.slice(0, 2).map((x) => x.text.slice(0, 40)), imagesBefore: objs.images.length, imagesAfter: o2.images.length, fontsAfter: fontsOf(p2), growth: saved.length - bytes.length };
      // is the rest of the page the same PICTURE? Rendered at 144 dpi; the pixels outside the edited line's band (three lines allowed for a
      // wrap) that changed: how many (as a share of that area) and the tallest connected blob of them (a neighbour line moved by a point is a blob)
      {
        const S = m.Matrix.scale(2, 2), grey = (pg) => { const x = pg.toPixmap(S, m.ColorSpace.DeviceGray, false); return { w: x.getWidth(), h: x.getHeight(), px: x.getPixels().slice() }; };
        const g1 = grey(page), g2 = grey(p2), x0 = (Math.min(l.x, edit.x) - 6) * 2, x1 = (Math.max(l.x + l.w, edit.x + edit.w) + 6) * 2, y0 = (l.y - 6) * 2, y1 = (Math.max(l.y + l.h, edit.y + edit.h) + 3 * l.h + 6) * 2;
        if (g1.w === g2.w && g1.h === g2.h) {
          const { w, h } = g1, ch = new Uint8Array(w * h); let n = 0;
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { if (x >= x0 && x <= x1 && y >= y0 && y <= y1) continue; if (Math.abs(g1.px[y * w + x] - g2.px[y * w + x]) > 60) { ch[y * w + x] = 1; n++; } }
          let tall = 0; const stack = [];
          for (let i = 0; i < ch.length; i++) if (ch[i] === 1) { // 8-connected blobs: their tallest bounding box
            let top = h, bot = 0; ch[i] = 2; stack.push(i);
            while (stack.length) { const j = stack.pop(), jy = (j / w) | 0, jx = j - jy * w; top = Math.min(top, jy); bot = Math.max(bot, jy);
              for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = jy + dy, xx = jx + dx; if (yy < 0 || xx < 0 || yy >= h || xx >= w) continue; const k = yy * w + xx; if (ch[k] === 1) { ch[k] = 2; stack.push(k); } } }
            tall = Math.max(tall, bot - top + 1);
          }
          const inside = Math.max(0, Math.min(x1, w) - Math.max(x0, 0)) * Math.max(0, Math.min(y1, h) - Math.max(y0, 0));
          r.side.outsideDiff = n; r.side.outsideFrac = +(n / Math.max(1, w * h - inside)).toFixed(5); r.side.outsideBlobH = tall;
        } else r.side.outsideDiff = -1;
      }
      // the new line and its neighbours, after
      const after = crop(p2, { x: before.box[0] + 4, y: before.box[1] + 4, w: before.box[2] - before.box[0] - 8, h: before.box[3] - before.box[1] - 8 }, 4, 4);
      fs.writeFileSync(path.join(OUT, 'img', id2 + '-mupdf.png'), after.png);
      if (newLine) { const nb = crop(p2, { x: newLine.x, y: newLine.y, w: newLine.w, h: newLine.h }, 4, 2); fs.writeFileSync(path.join(OUT, 'img', id2 + '-newline.png'), nb.png); r.newLineBox = nb.box; }
      p2.destroy(); d2.destroy();
    } catch (e) {
      r.error = String(e?.message ?? e).slice(0, 300);
    }
    results.push(r);
  }
  page.destroy(); doc.destroy();
}
fs.writeFileSync(MERGE || path.join(OUT, 'results.json'), JSON.stringify({ when: new Date().toISOString(), files: fileSummaries, results }, null, 1));
const n = results.length, errs = results.filter((r) => r.error).length, textOk = results.filter((r) => r.extract?.mupdfLineOk).length, ownKept = results.filter((r) => r.font && !r.font.using).length;
console.log(`\n${n} edits, ${errs} errors, text read back exactly (MuPDF): ${textOk}, own font kept: ${ownKept}, notdef drawn: ${results.filter((r) => r.drawn?.notdef).length}, others moved/gone: ${results.filter((r) => r.side && (r.side.othersMoved || r.side.othersGone)).length}`);
