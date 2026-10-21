// Turns the audit's JSON (results.json from audit-edit.mjs, checks.json from audit-check.py, browser.json from
// audit-browser.mjs, out/ui/ui-*.json from ui.spec.ts) into the result table of the report and copies the strips the
// report links to. Each edit is graded: major = the text or the page is wrong (not read back by any reader, a glyph box
// drawn, a neighbouring line lost, a reader fails to open); minor = the look changed (another font, wrapped, moved,
// bold/colour/size lost, copies badly in one reader); OK otherwise.
//   node tools/arabic/report.mjs [--out tests/audit-arabic/out] [--shots <folder for the images>]
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = path.resolve(ROOT, arg('--out', 'tests/audit-arabic/out')), SHOTS = path.resolve(ROOT, arg('--shots', '../Archive-2026-10-12/screenshots/arabic-edit-audit-2026-10-21'));
const data = JSON.parse(fs.readFileSync(path.join(OUT, 'results.json'), 'utf8'));
const checks = fs.existsSync(path.join(OUT, 'checks.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'checks.json'), 'utf8')) : {};
const browser = fs.existsSync(path.join(OUT, 'browser.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'browser.json'), 'utf8')) : {};
fs.mkdirSync(path.join(SHOTS, 'strips'), { recursive: true });
// does the font a line was written with carry OpenType shaping rules? (Word and Edge subsets drop GSUB/GPOS)
const gsubCache = new Map();
export function hasGsub(file) {
  if (!file) return true;
  if (!gsubCache.has(file)) {
    const f = path.join(OUT, 'fonts', file);
    if (!fs.existsSync(f)) gsubCache.set(file, true);
    else { const b = fs.readFileSync(f), n = b.readUInt16BE(4); let found = false; for (let i = 0; i < n && 12 + i * 16 + 4 <= b.length; i++) if (b.toString('latin1', 12 + i * 16, 16 + i * 16) === 'GSUB') found = true; gsubCache.set(file, found); }
  }
  return gsubCache.get(file);
}

/** Grade one edit and say why. */
export function grade(r) {
  const c = checks[r.id] ?? {}, b = browser[r.id] ?? {}, why = [], notes = [];
  if (r.error) return { grade: 'major', why: ['engine error: ' + r.error] };
  const readBack = r.extract?.mupdfLineOk || c.pdfium?.lineOk || c.pdfium?.lettersOk || b.pdfjs?.lettersOk;
  const pageHas = r.extract?.mupdfPageHas || c.pdfium?.pageHas || c.pymupdf?.pageHas || b.pdfjs?.pageHas;
  const corpusOverlap = /^(waraq|cadlike)/.test(r.file) && /small|large/.test(r.kind); // the corpus itself overlaps these two lines
  if (!r.after) why.push('major: new line not found on the page');
  else if (!readBack && !pageHas && !r.fidelity?.wrapped) why.push('major: no reader gives the typed text back');
  if (r.font && !r.font.using && !hasGsub(r.font.file) && /[؀-ۿ]/.test(r.intended)) why.push("major: written in the PDF's own subset, which has no GSUB/GPOS - letters cannot join (isolated forms, wide spacing)");
  if (r.drawn?.notdef) why.push('major: ' + r.drawn.notdef + ' glyph box(es) drawn (letter the fallback font lacks)');
  if (r.side && (r.side.othersGone || r.side.othersMoved) && !corpusOverlap) why.push(`major: ${r.side.othersGone} other line(s) lost, ${r.side.othersMoved} moved`);
  if (c.pdfium && !c.pdfium.opens) why.push('major: PDFium cannot open the file');
  if (b.pdfjs?.error) why.push('major: pdf.js cannot open the file: ' + b.pdfjs.error.slice(0, 60));
  if (c.qpdf && !c.qpdf.ok) why.push('major: qpdf reports ' + c.qpdf.problems[0]);
  // both readers' pictures differ from the browser's picture of the same text in the same font: the file is wrong, not the reader
  if (b.compare && b.compare.inkMupdf && b.compare.inkPdfjs && b.compare.mupdfVsRef.iou < 0.45 && b.compare.pdfjsVsRef.iou < 0.45 && !r.fidelity?.wrapped) why.push(`major: drawn line differs from the browser's rendering of the same text in the same font (overlap ${b.compare.mupdfVsRef.iou} / ${b.compare.pdfjsVsRef.iou})`);
  if (r.extract && !r.extract.oldGone && /similar|mixed/.test(r.scenario) && r.lifted.length >= 15 && r.kind !== 'real') why.push('major: the old text is still in the file');
  if (why.some((w) => w.startsWith('major'))) return { grade: 'major', why, notes };
  // a font that cannot shape Arabic (no GSUB, no cmap, Type 3) is not kept by design since the font service: a note, not a defect
  if (r.font?.using && r.font.missing.length) why.push(`minor: own font ${r.font.own || '?'} lacks ${r.font.missing.slice(0, 8).join('')} → ${r.font.using}`);
  else if (r.font?.using) notes.push(`own font ${r.font.own || '?'} cannot shape Arabic → ${r.font.using}`);
  if (r.fidelity?.wrapped) why.push('minor: wrapped onto a second line (over the line below)');
  if (r.fidelity && Math.abs(r.fidelity.dEdge) > 2) why.push(`minor: line edge moved ${r.fidelity.dEdge} pt`);
  if (r.fidelity && Math.abs(r.fidelity.dBase) > 1) why.push(`minor: baseline moved ${r.fidelity.dBase} pt`);
  if (r.fidelity && !r.fidelity.boldKept) why.push('minor: bold lost');
  if (r.fidelity && !r.fidelity.sameColor) why.push('minor: colour changed');
  if (r.fidelity && Math.abs(r.fidelity.dSize) > 0.3) why.push('minor: size changed ' + r.fidelity.dSize);
  if (!r.extract?.mupdfLineOk) why.push('minor: MuPDF (Waraq) reads the new line back differently: ' + (r.extract?.diff ?? []).join(','));
  if (c.pdfium && !c.pdfium.lettersOk) why.push('minor: PDFium (Edge/Chrome) copies the line differently' + (c.pdfium.junk ? ' with junk ' + c.pdfium.junk : ''));
  if (b.pdfjs && !b.pdfjs.lettersOk && !b.pdfjs.lettersReversed) why.push('minor: pdf.js copies the line differently' + (b.pdfjs.junk ? ' with junk ' + b.pdfjs.junk : ''));
  if (b.compare && b.compare.inkMupdf && b.compare.mupdfVsRef.iou < 0.6 && !r.fidelity?.wrapped) why.push(`minor: drawn line differs from the browser's rendering (overlap ${b.compare.mupdfVsRef.iou})`);
  if (r.side && r.side.growth > 250_000) why.push('minor: file grew by ' + Math.round(r.side.growth / 1024) + ' kB');
  return { grade: why.length ? 'minor' : 'OK', why, notes };
}

const graded = data.results.map((r) => ({ r, ...grade(r) }));
const byFile = new Map();
for (const g of graded) { const f = byFile.get(g.r.file) ?? []; f.push(g); byFile.set(g.r.file, f); }
const producer = (f) => f.startsWith('real/') ? 'real document' : f.startsWith('edge-') ? 'Edge print' : f.startsWith('word-') ? 'Word' : f.startsWith('libreoffice') ? 'LibreOffice' : f.startsWith('mupdf-story') ? 'MuPDF Story' : f.startsWith('waraq-') ? 'Waraq writer' : f.startsWith('cadlike') ? 'CAD-like' : 'other';
const cell = (gs) => { if (!gs.length) return '–'; const n = { OK: 0, minor: 0, major: 0 }; for (const g of gs) n[g.grade]++; return `${n.major ? '**' + n.major + ' major**' : ''}${n.major && (n.minor || n.OK) ? ' · ' : ''}${n.minor ? n.minor + ' minor' : ''}${n.minor && n.OK ? ' · ' : ''}${n.OK ? n.OK + ' OK' : ''}`; };
// one strip per file goes to the archive: the worst "oneword" edit (what a user does most)
const thumb = (gs) => {
  const pick = [...gs].sort((a, b) => ({ major: 0, minor: 1, OK: 2 })[a.grade] - ({ major: 0, minor: 1, OK: 2 })[b.grade] || (a.r.scenario === 'oneword' ? -1 : 1))[0];
  const src = path.join(OUT, 'strip', pick.r.id + '.png');
  if (!fs.existsSync(src)) return '';
  fs.copyFileSync(src, path.join(SHOTS, 'strips', pick.r.id + '.png'));
  return `strips/${pick.r.id}.png`;
};
let md = `| File | Producer / fonts | Lines shown wrongly in the box | (i) similar | (ii) one word | (iii) mixed | (iv) longer | Own font kept | Strip |\n|---|---|---|---|---|---|---|---|---|\n`;
const files = [...byFile.keys()].sort();
for (const f of files) {
  const gs = byFile.get(f), info = data.files.find((x) => x.file === f), sc = (s) => gs.filter((g) => g.r.scenario === s);
  const fonts = [...new Set(info.fonts.map((x) => `${x.subtype}${x.cid ? '/' + x.cid : ''} ${x.program}${x.toUnicode ? '' : ' no-ToUnicode'}`))].slice(0, 3).join('; ');
  const lift = info.lift.length ? `${info.lift.filter((l) => l.diff.length).length}/${info.lift.length}` : 'n/a';
  const own = gs.filter((g) => g.r.font && !g.r.font.using).length + '/' + gs.length;
  md += `| ${f} | ${producer(f)}: ${fonts} | ${lift} | ${cell(sc('similar'))} | ${cell(sc('oneword'))} | ${cell(sc('mixed'))} | ${cell(sc('longer'))} | ${own} | ${thumb(gs) ? `[strip](${thumb(gs)})` : ''} |\n`;
}
const n = { OK: 0, minor: 0, major: 0 };
for (const g of graded) n[g.grade]++;
const reasons = {};
for (const g of graded) for (const w of g.why) { const k = w.replace(/^(major|minor): /, '$1 — ').replace(/ ?(→|\(|: |- letters).*$/, '').replace(/-?\d+(\.\d+)? ?(pt|kB)?/g, 'N').trim(); reasons[k] = (reasons[k] ?? 0) + 1; }
const summary = `${graded.length} edits in ${files.length} files: **${n.major} major**, ${n.minor} minor, ${n.OK} OK (${Math.round((n.OK / graded.length) * 100)} % pass).\n\n`
  + `Most frequent findings (one edit can have several):\n\n` + Object.entries(reasons).sort((a, b) => b[1] - a[1]).map(([k, v]) => `- ${v} × ${k}`).join('\n') + '\n';
// slices by the corpus tags (type, arrangement, source): files made by make-corpus-types.mjs and make-scans.mjs
const TAGS = fs.existsSync(path.join(ROOT, 'tests/fixtures/arabic/tags.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/arabic/tags.json'), 'utf8')) : {};
const slice = (title, keyOf) => {
  const rows = new Map();
  for (const info of data.files) {
    const t = TAGS[info.file]; if (!t) continue;
    for (const key of [keyOf(t)].flat().filter(Boolean)) {
      const r = rows.get(key) ?? { files: 0, noText: 0, lines: 0, liftWrong: 0, edits: 0, major: 0, minor: 0, OK: 0 };
      r.files++; if (!info.linesSelectable) r.noText++;
      r.lines += info.lift.length; r.liftWrong += info.lift.filter((l) => l.diff.length).length;
      for (const g of byFile.get(info.file) ?? []) { r.edits++; r[g.grade]++; }
      rows.set(key, r);
    }
  }
  if (!rows.size) return '';
  return `\n### ${title}\n\n| ${title} | Files | No text layer | Lines shown wrongly | Edits | Major | Minor | OK |\n|---|---|---|---|---|---|---|---|\n`
    + [...rows].sort((a, b) => b[1].major - a[1].major || b[1].edits - a[1].edits).map(([k, r]) => `| ${k} | ${r.files} | ${r.noText || ''} | ${r.lines ? r.liftWrong + '/' + r.lines : '-'} | ${r.edits} | ${r.major} | ${r.minor} | ${r.OK} |`).join('\n') + '\n';
};
const slices = slice('Document type', (t) => t.type) + slice('Arrangement', (t) => t.arrangement) + slice('Source', (t) => (t.source === 'digital' ? 'digital (' + t.producer + ')' : t.source + (t.dpi ? ' ' + t.dpi + ' dpi' : '')));
fs.writeFileSync(path.join(OUT, 'slices.md'), slices);
fs.writeFileSync(path.join(OUT, 'table.md'), summary + '\n' + md + slices);
fs.writeFileSync(path.join(OUT, 'graded.json'), JSON.stringify(graded.map((g) => ({ id: g.r.id, grade: g.grade, why: g.why })), null, 1));
console.log(summary);
