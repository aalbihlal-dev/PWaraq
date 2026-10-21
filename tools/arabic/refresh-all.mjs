// Regenerates every "create" fixture with the current engine and re-reads it with MuPDF, PDFium (wasm) and pdf.js, then re-checks the text
// (tests/audit-arabic/results/*.check.json: what the stress run's "write" slice reads). Edge's viewer copy is not refreshed (it needs a
// window in front); its old results are removed. usage: node tools/arabic/refresh-all.mjs
import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
import { OUT, ROOT } from './lib.mjs';
const run = (script, args = [], env = {}) => { try { execFileSync('node', [path.join('tools/arabic', script), ...args], { cwd: ROOT, stdio: 'pipe', env: { ...process.env, ...env }, timeout: 280_000 }); } catch (e) { console.log('FAILED', script, args.join(' '), String(e.message).split('\n')[0].slice(0, 100)); } };
for (const g of ['gen-editor', 'gen-comment', 'gen-sign', 'gen-portfolio', 'gen-ocr', 'gen-extra', 'gen-reference', 'proto-forms', 'proto-comment']) run(g + '.mjs');
run('gen-forms.mjs', [], { NA: '0' }); run('gen-forms.mjs', [], { NA: '1' });
const res = path.join(ROOT, 'tests/audit-arabic/results');
for (const f of fs.readdirSync(res).filter((f) => f.endsWith('.edgecopy.json'))) fs.rmSync(path.join(res, f));
const names = fs.readdirSync(OUT).filter((f) => /^manifest-.*\.json$/.test(f)).map((f) => f.slice(9, -5));
for (const n of names) { if (!fs.existsSync(path.join(OUT, n + '.pdf'))) continue; run('render.mjs', [n, '1.0']); run('browser.mjs', [n, 'pdfjs', '1.0']); run('check.mjs', [n]); }
console.log('refreshed', names.length, 'fixtures');
