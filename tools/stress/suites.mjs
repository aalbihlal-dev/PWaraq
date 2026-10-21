// Adapters over the existing checkers. A suite lists SHARDS (one child process each: a command line) and judges what a
// shard printed or wrote into CASES { id, slice, status: pass|minor|major, why, repro, thumb, metrics }. The checkers keep
// their own command lines and exit codes; only these small adapters know how to read them. Add a suite = add an entry.
import fs from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '..', '..');
const node = process.execPath, rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
const ls = (d, ext) => (fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.endsWith(ext)) : []);
const crash = (shard, r) => (r.timedOut ? `timeout after ${shard.timeout / 1000} s` : r.code !== 0 ? `exit ${r.code}: ${(r.stderr || r.stdout).trim().split(/\r?\n/).slice(-2).join(' | ').slice(0, 200)}` : null);
export const fail = (shard, slice, why) => [{ id: `${slice}:${shard.id}`, slice, status: 'major', why, repro: shard.cmd.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ') }];

/** Engine-only judgement of one edit record from tools/arabic/audit-edit.mjs (the "major" rules of report.mjs that need no second reader). */
// the rest of the page is the same picture: at 144 dpi under 0.5 % of it changed and no changed blob is taller than 2 px (a line moved by a point is one)
const pictureSame = (side) => side?.outsideFrac != null && side.outsideDiff >= 0 && side.outsideFrac <= 0.005 && side.outsideBlobH <= 2;
export function judgeEdit(r, c, b) {
  if (r.error) return ['engine error: ' + r.error];
  // without second readers (c = PDFium/qpdf/PyMuPDF checks, b = pdf.js + browser picture) MuPDF alone cannot condemn a line: see `unconfirmed`
  const why = [], deep = !!(c || b); c ??= {}; b ??= {};
  // marks / spaces in another order are excused only where the ORIGINAL line already read back in that order (the source file's own text layer, srcLoose);
  // text Waraq wrote that comes back that way is what a user copies out: a defect
  const looseOnly = r.extract && !r.extract.mupdfLineOk && r.extract.mupdfLineLoose;
  const readBack = r.extract?.mupdfLineOk || (looseOnly && r.extract.srcLoose) || c.pdfium?.lineOk || c.pdfium?.lettersOk || b.pdfjs?.lettersOk, pageHas = r.extract?.mupdfPageHas || c.pdfium?.pageHas || c.pymupdf?.pageHas || b.pdfjs?.pageHas;
  const corpusOverlap = /^(waraq|cadlike)/.test(r.file) && /small|large/.test(r.kind);
  if (!r.after) why.push('new line not found on the page');
  else if (!readBack && !pageHas && !r.fidelity?.wrapped && deep) why.push('typed text not read back by any reader');
  if (looseOnly && !r.extract.srcLoose) why.push('the line Waraq wrote reads back with its marks / spaces in another order (the source line read exactly)');
  if (r.drawn?.notdef) why.push(`${r.drawn.notdef} .notdef glyph box(es) drawn`);
  // on a scan with an OCR layer the "lines" lost or moved are invisible layer text (the picture is not touched): minor, see minorEdit
  const layerOnly = /(^|\/)(hybrid-|mixed-text-scan)/.test(r.file);
  // lines "lost" or "moved" are judged by the picture: when the pixels outside the edited line are the same (outsideDiff small) the line is still
  // there and only reads back differently (a Type 3 font, a joined piece): minor, see minorEdit; without the picture measure the text rule stays
  const sameRest = pictureSame(r.side);
  if (r.side && (r.side.othersGone || r.side.othersMoved) && !corpusOverlap && !layerOnly && !sameRest) why.push(`${r.side.othersGone} other line(s) lost, ${r.side.othersMoved} moved`);
  if (c.pdfium && !c.pdfium.opens) why.push('PDFium cannot open the file');
  if (b.pdfjs?.error) why.push('pdf.js cannot open the file: ' + String(b.pdfjs.error).slice(0, 60));
  if (c.qpdf && !c.qpdf.ok) why.push('qpdf reports ' + c.qpdf.problems?.[0]);
  if (b.compare?.inkMupdf && b.compare.inkPdfjs && b.compare.mupdfVsRef.iou < 0.45 && b.compare.pdfjsVsRef.iou < 0.45 && !r.fidelity?.wrapped) why.push(`drawn line differs from the browser's rendering of the same text (overlap ${b.compare.mupdfVsRef.iou})`);
  if (r.extract && !r.extract.oldGone && /similar|mixed/.test(r.scenario) && r.lifted?.length >= 15 && r.kind !== 'real') why.push('old text still in the file');
  return why;
}
export function minorEdit(r) {
  const why = [];
  if (!r.extract?.mupdfLineOk && !(r.extract?.mupdfLineLoose && r.extract.srcLoose)) why.push('unconfirmed: MuPDF alone does not read the line back (--deep asks PDFium, pdf.js)');
  else if (!r.extract?.mupdfLineOk) why.push('marks / spaces read back in another order (as the source file already did)');
  if (/(^|\/)(hybrid-|mixed-text-scan)/.test(r.file) && r.side && (r.side.othersGone || r.side.othersMoved)) why.push(`${r.side.othersGone} line(s) of the invisible OCR layer lost, ${r.side.othersMoved} moved`);
  if (r.side && (r.side.othersGone || r.side.othersMoved) && pictureSame(r.side)) why.push(`${r.side.othersGone + r.side.othersMoved} other line(s) read differently (the picture outside the line is unchanged)`);
  if (r.fidelity?.wrapped) why.push('wrapped');
  if (r.fidelity && Math.abs(r.fidelity.dEdge) > 2) why.push(`edge moved ${r.fidelity.dEdge} pt`);
  if (r.fidelity && Math.abs(r.fidelity.dBase) > 1) why.push(`baseline moved ${r.fidelity.dBase} pt`);
  if (r.fidelity && !r.fidelity.boldKept) why.push('bold lost');
  if (r.side?.growth > 250_000) why.push(`file grew ${Math.round(r.side.growth / 1024)} kB`);
  return why;
}

/** One printed OCR page row of tools/ocr-accuracy.mjs: name, words, words right %, chars right %, placed %. */
export const OCR_ROW = /^(\d\d-\S+)\s+(\d+)\s+([\d.]+) %\s+([\d.]+) %\s+([\d.]+) %/;

export const suites = {
  // Unit tests: one shard per test file.
  unit: {
    shards: () => ls(path.join(ROOT, 'tests/unit'), '.test.mjs').map((f) => ({ id: f, cmd: [node, '--test', 'tests/unit/' + f], timeout: 300_000 })),
    judge: (s, r) => { const w = crash(s, r); return w ? fail(s, 'unit', w) : [{ id: 'unit:' + s.id, slice: 'unit', status: 'pass' }]; },
  },
  // Editing existing Arabic text: every corpus PDF in its own process (audit-edit.mjs, the same code the page editor runs).
  // --deep: the lines MuPDF alone does not read back go to the second readers (pdf.js + the browser's own drawing of the text
  // via audit-browser.mjs; PDFium/qpdf/PyMuPDF via audit-check.py when STRESS_PYTHON names a python that has them) and are re-judged.
  edit: {
    async deep({ jobs, dir, root, cases, run }) {
      const merged = path.join(dir, 'deep'), recs = [];
      fs.rmSync(merged, { recursive: true, force: true });
      for (const sub of ['img', 'fonts', 'strip']) fs.mkdirSync(path.join(merged, sub), { recursive: true });
      for (const j of jobs.filter((j) => j.suite === 'edit' && j.shard.part && fs.existsSync(j.shard.part))) {
        for (const e of JSON.parse(fs.readFileSync(j.shard.part, 'utf8')).results) {
          if (e.error || e.extract?.mupdfLineOk) continue;
          const pdf = path.join(j.shard.out, e.id + '.pdf'); if (!fs.existsSync(pdf)) continue;
          fs.copyFileSync(pdf, path.join(merged, e.id + '.pdf')); recs.push(e);
          for (const f of ['img/' + e.id + '-before.png', 'img/' + e.id + '-mupdf.png']) if (fs.existsSync(path.join(j.shard.out, f))) fs.copyFileSync(path.join(j.shard.out, f), path.join(merged, f));
          if (e.font?.file && fs.existsSync(path.join(j.shard.out, 'fonts', e.font.file))) fs.copyFileSync(path.join(j.shard.out, 'fonts', e.font.file), path.join(merged, 'fonts', e.font.file));
        }
      }
      if (!recs.length) return;
      fs.writeFileSync(path.join(merged, 'results.json'), JSON.stringify({ when: new Date().toISOString(), files: [], results: recs }));
      const py = process.env.STRESS_PYTHON;
      if (py) await run([py, 'tools/arabic/audit-check.py', '--out', merged], { cwd: root, timeout: 900_000 });
      await run([node, 'tools/arabic/audit-browser.mjs', '--out', merged], { cwd: root, timeout: 1_800_000 });
      const read = (f) => (fs.existsSync(path.join(merged, f)) ? JSON.parse(fs.readFileSync(path.join(merged, f), 'utf8')) : {});
      const checks = read('checks.json'), browser = read('browser.json'), byId = new Map(cases.map((c) => [c.id, c]));
      for (const e of recs) {
        const c = byId.get('edit:' + e.id); if (!c) continue;
        const major = judgeEdit(e, checks[e.id] ?? {}, browser[e.id] ?? {}), minor = major.length ? [] : minorEdit(e).filter((w) => !w.startsWith('unconfirmed'));
        Object.assign(c, { status: major.length ? 'major' : minor.length ? 'minor' : 'pass', why: [...major, ...minor].join('; ') || 'confirmed by the second readers' });
      }
    },
    shards: ({ dir }) => {
      const fx = path.join(ROOT, 'tests/fixtures/arabic'), sub = (d) => ls(path.join(fx, d), '.pdf').map((f) => d + '/' + f);
      return [...ls(fx, '.pdf'), ...sub('real'), ...sub('scans')].map((f) => {
        const out = path.join(dir, 'edit', path.basename(f, '.pdf')), part = path.join(out, 'part.json');
        return { id: f, part, out, cmd: [node, 'tools/arabic/audit-edit.mjs', '--files', f, '--out', out, '--merge', part], timeout: 240_000 };
      });
    },
    judge: (s, r) => {
      const w = crash(s, r); if (w) return fail(s, 'edit', w);
      if (!fs.existsSync(s.part)) return fail(s, 'edit', 'no result file written');
      return JSON.parse(fs.readFileSync(s.part, 'utf8')).results.map((e) => {
        const major = judgeEdit(e), minor = major.length ? [] : minorEdit(e), bad = major.length || minor.length;
        return { id: 'edit:' + e.id, slice: 'edit', status: major.length ? 'major' : minor.length ? 'minor' : 'pass', why: [...major, ...minor].join('; '), thumb: bad ? rel(path.join(s.out, 'img', e.id + '-mupdf.png')) : undefined, repro: `node tools/arabic/audit-edit.mjs --files ${s.id} --out tests/audit-arabic/out`, metrics: { size: e.side?.growth } };
      });
    },
  },
  // OCR: tools/ocr-accuracy.mjs per page; reads its printed table.
  ocr: {
    shards: () => {
      const d = path.join(ROOT, 'tests/fixtures/ocr');
      return [...new Set([...ls(d, '.pdf'), ...ls(path.join(d, 'v3'), '.pdf')].map((f) => f.replace(/\.pdf$/, '')))].map((n) => ({ id: n, cmd: [node, 'tools/ocr-accuracy.mjs', '--only', n], timeout: 600_000 }));
    },
    judge: (s, r, { limits }) => {
      const w = crash(s, r); if (w) return fail(s, 'ocr', w);
      const rows = r.stdout.split(/\r?\n/).map((l) => OCR_ROW.exec(l)).filter(Boolean).map(([, name, words, wr, cr, placed]) => {
        const m = { words: +words, wordsRight: +wr, charsRight: +cr, placed: +placed }, why = [];
        if (m.charsRight < limits.ocrCharsMin) why.push(`chars right ${m.charsRight} % (< ${limits.ocrCharsMin})`);
        else if (m.wordsRight < limits.ocrWordsMin) why.push(`words right ${m.wordsRight} %`);
        return { id: 'ocr:' + name, slice: 'ocr', status: m.charsRight < limits.ocrCharsMin ? 'major' : why.length ? 'minor' : 'pass', why: why.join('; '), repro: `node tools/ocr-accuracy.mjs --only ${name}`, metrics: m };
      });
      return rows.length ? rows : fail(s, 'ocr', 'no result row printed');
    },
  },
  // Writing Arabic (create audit): tools/arabic/check.mjs per manifest, on the readers' results already in tests/audit-arabic/results.
  write: {
    shards: () => {
      const res = path.join(ROOT, 'tests/audit-arabic/results'), have = ls(res, '.json');
      return ls(path.join(ROOT, 'tests/fixtures/arabic-create'), '.json').filter((f) => f.startsWith('manifest-')).map((f) => f.slice(9, -5)).filter((n) => have.some((f) => f.startsWith(n + '.') && !f.includes('.check.'))).map((n) => ({ id: n, cmd: [node, 'tools/arabic/check.mjs', n], timeout: 120_000 }));
    },
    judge: (s, r) => {
      const w = crash(s, r); if (w) return fail(s, 'write', w);
      const f = path.join(ROOT, 'tests/audit-arabic/results', s.id + '.check.json');
      if (!fs.existsSync(f)) return fail(s, 'write', 'no check file written');
      return JSON.parse(fs.readFileSync(f, 'utf8')).map((o) => ({ id: `write:${s.id}|${o.consumer}|${o.file}|p${o.page}|${o.label}|${o.text}`, slice: 'write', status: o.status === 'exact' ? 'pass' : /nfkc|word-order/.test(o.status) ? 'minor' : 'major', why: o.status === 'exact' ? '' : `${o.consumer} reads it back as ${o.status}`, repro: `node tools/arabic/check.mjs ${s.id}` }));
    },
  },
  // Playwright journeys (only with --e2e): the JSON reporter lists every spec.
  e2e: {
    optional: true,
    shards: () => [{ id: 'playwright', cmd: [node, 'node_modules/@playwright/test/cli.js', 'test', '--reporter=json'], timeout: 1_800_000 }],
    judge: (s, r) => {
      let j; try { j = JSON.parse(r.stdout.slice(r.stdout.indexOf('{'))); } catch { return fail(s, 'e2e', crash(s, r) ?? 'no JSON report'); }
      const out = [], walk = (su, trail) => { for (const sp of su.specs ?? []) out.push({ id: `e2e:${trail}${sp.title}`, slice: 'e2e', status: sp.ok ? 'pass' : 'major', why: sp.ok ? '' : 'journey failed', repro: `npx playwright test ${su.file ?? ''} -g "${sp.title.replace(/"/g, '')}"` }); for (const c of su.suites ?? []) walk(c, trail + (su.title ? su.title + ' › ' : '')); };
      for (const su of j.suites ?? []) walk(su, '');
      return out;
    },
  },
};
