// Slices the matrix results by writer check, by kind of source (geometry / scan kind), and by document type: tests/audit-arabic/results/matrix-slices.md
import fs from 'node:fs'; import path from 'node:path';
import { RES } from './mx.mjs';
const rows = fs.readdirSync(RES).filter((f) => /^matrix-.*\.json$/.test(f) && f !== 'matrix-slices.json').flatMap((f) => JSON.parse(fs.readFileSync(path.join(RES, f), 'utf8')));
const group = (r) => {
  if (r.source === 'case') return 'whole portfolio';
  if (r.source === 'scan') return { flatbed150: 'scan: flatbed 150 dpi', flatbed300: 'scan: flatbed 300 dpi', phone: 'scan: phone photo (keystone, shade)', skew3: 'scan: skewed 3°', faded: 'scan: faded', onebit: 'scan: 1-bit', photocopy: 'scan: photocopy (noise, pen marks)', curved: 'scan: curved book page' }[r.variant] ?? 'scan: other';
  if (r.source === 'hybrid') return 'scan + real OCR layer';
  if (r.variant === 'plain') return 'PDF: upright';
  if (/^rot/.test(r.variant)) return 'PDF: sheet turned 90 / 180 / 270 (content sideways when seen)';
  if (/^stored/.test(r.variant)) return 'PDF: stored turned, shown upright by /Rotate';
  if (r.variant === 'origin') return 'PDF: MediaBox origin (100, 200)';
  if (r.variant === 'crop') return 'PDF: CropBox inset 24 pt';
  return 'PDF: offset + crop + turn';
};
const cell = (rs) => { const p = rs.filter((r) => r.pass === true).length, w = rs.filter((r) => r.pass === 'warn').length, f = rs.filter((r) => r.pass === false).length; return rs.length ? `${p} / ${w} / ${f}` : '—'; };
const table = (title, keyOf, colOf, cols) => {
  const keys = [...new Set(rows.map(keyOf))].sort(); let md = `### ${title}\n\ncells: ✅ / ⚠️ / ❌ (number of checks)\n\n| | ${cols.join(' | ')} | all |\n|---|${cols.map(() => '---').join('|')}|---|\n`;
  for (const k of keys) { const mine = rows.filter((r) => keyOf(r) === k); md += `| ${k} | ${cols.map((c) => cell(mine.filter((r) => colOf(r) === c))).join(' | ')} | ${cell(mine)} |\n`; }
  const all = rows; md += `| **all** | ${cols.map((c) => cell(all.filter((r) => colOf(r) === c))).join(' | ')} | **${cell(all)}** |\n\n`; return md;
};
const label = (r) => `${r.writer}: ${r.check.replace(/ \(.*/, '')}`;
const writers = [...new Set(rows.map((r) => r.writer))];
let md = `# Varied-document matrix: results sliced (${rows.length} checks)\n\n`;
md += table('By source (rows) and writer (columns)', group, (r) => r.writer, writers);
md += table('By document type (rows) and writer (columns)', (r) => (r.source === 'case' ? 'portfolio cases' : `${r.type} (${r.arrangement.replace(/[|]/g, "/")})`), (r) => r.writer, writers);
md += table('By check (rows) and kind of source: upright PDF / turned or offset PDF / scan / scan + OCR (columns)', label, (r) => (r.source === 'scan' ? 'scan' : r.source === 'hybrid' ? 'scan + OCR' : r.source === 'case' ? 'case' : r.variant === 'plain' ? 'upright PDF' : 'turned / offset / cropped PDF'), ['upright PDF', 'turned / offset / cropped PDF', 'scan', 'scan + OCR', 'case']);
fs.writeFileSync(path.join(RES, 'matrix-slices.md'), md); console.log(md.slice(0, 3500));
