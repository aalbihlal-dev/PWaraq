// Text-extraction check: does each consumer read back the exact logical-order Unicode that was written?
// usage: node tools/arabic/check.mjs <name>   (needs tests/fixtures/arabic-create/manifest-<name>.json and results/<name>.<consumer>.json)
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, OUT, m } from './lib.mjs';

const name = process.argv[2], res = path.join(ROOT, 'tests/audit-arabic/results');
const man = JSON.parse(fs.readFileSync(path.join(OUT, `manifest-${name}.json`), 'utf8'));
const consumers = fs.readdirSync(res).filter((f) => f.startsWith(name + '.') && f.endsWith('.json') && !f.includes('.check.')).map((f) => f.split('.')[1]);
const ws = (s) => s.replace(/[\s‎‏‪-‮⁦-⁩]+/g, '');
const marks = (s) => s.replace(/[ً-ٰٟـ]/g, '');
const rev = (s) => [...s].reverse().join('');
const out = [];
// comment text boxes are annotations: their text is the annotation's /Contents, not page text (no reader's text extraction returns it)
if (man[0]?.writer === 'comment' || man[0]?.writer === 'proto-comment') {
  const doc = m.Document.openDocument(new Uint8Array(fs.readFileSync(path.join(OUT, man[0].file))), 'application/pdf');
  for (const p of man) { const pg = doc.loadPage(p.page), contents = pg.getAnnotations().map((x) => x.getContents()); pg.destroy();
    for (const e of p.expect) out.push({ writer: p.writer, file: p.file, page: p.page, label: p.label, consumer: 'annotation', text: e.slice(0, 40), status: contents.includes(e) ? 'exact' : 'wrong' }); }
  fs.writeFileSync(path.join(res, `${name}.check.json`), JSON.stringify(out, null, 1)); console.log(name, 'annotation contents', out.filter((o) => o.status === 'exact').length, 'of', out.length); process.exit(0);
}
for (const c of consumers) {
  const pages = JSON.parse(fs.readFileSync(path.join(res, `${name}.${c}.json`), 'utf8'));
  for (const p of man) {
    const raw = (c === 'edgecopy' ? pages[0] : pages[p.page]) ?? '', got = ws(raw), nf = ws(raw.normalize('NFKC'));
    for (const e of p.expect) {
      const want = ws(e);
      let st;
      if (got.includes(want)) st = 'exact';
      else if (nf.includes(ws(e.normalize('NFKC')))) st = 'nfkc-only';
      else if (marks(nf).includes(marks(ws(e.normalize('NFKC'))))) st = 'marks-lost';
      else if (marks(nf).includes(marks(ws(rev(e.normalize('NFKC')))))) st = 'reversed';
      else st = 'wrong';
      out.push({ writer: p.writer, file: p.file, page: p.page, label: p.label, consumer: c, text: e.slice(0, 40), status: st });
    }
  }
}
fs.writeFileSync(path.join(res, `${name}.check.json`), JSON.stringify(out, null, 1));
const tally = {};
for (const o of out) { const k = `${o.consumer}/${o.status}`; tally[k] = (tally[k] ?? 0) + 1; }
console.log(name, tally);
for (const o of out.filter((o) => o.status !== 'exact')) console.log(' ', o.consumer, o.status, 'p' + o.page, o.label, JSON.stringify(o.text));
