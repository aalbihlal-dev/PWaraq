// Can Waraq's own search (MuPDF page.search, what the Find box uses) find what Waraq wrote? Per writer: the whole typed text, and each word of it.
// usage: node tools/arabic/search-check.mjs   (reads tests/fixtures/arabic-create/manifest-*.json)
import fs from 'node:fs';
import path from 'node:path';
import { m, OUT } from './lib.mjs';
const tot = {}, bad = [];
for (const f of fs.readdirSync(OUT).filter((f) => /^manifest-.*\.json$/.test(f))) {
  const man = JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8')), name = f.slice(9, -5);
  if (!man.length || !fs.existsSync(path.join(OUT, man[0].file)) || /^(comment|proto-comment)$/.test(name) || /forms(-na|-one)?$/.test(name) && !/flat/.test(name)) continue;
  const doc = m.Document.openDocument(new Uint8Array(fs.readFileSync(path.join(OUT, man[0].file))), 'application/pdf'), cache = new Map();
  const fam = name.replace(/^proto-/, '').replace(/-(flat|na|one|visible).*/, '').replace(/^marks.*/, 'marks'), t = (tot[fam] ??= { phrase: [0, 0], word: [0, 0] });
  for (const p of man) {
    const pg = cache.get(p.page) ?? doc.loadPage(p.page); cache.set(p.page, pg);
    for (const e of p.expect) {
      const hit = (q) => pg.search(q, '').length > 0, ok = hit(e); t.phrase[1]++; t.phrase[0] += ok;
      const words = e.split(/\s+/).filter((w) => w.length > 1).map((w) => w.replace(/[،؛.,:()«»"]/g, '')).filter(Boolean);
      for (const w of words) { const k = hit(w); t.word[1]++; t.word[0] += k; if (!k && bad.length < 400) bad.push(`${fam}: ${w}`); }
    }
  }
}
for (const [f, t] of Object.entries(tot)) console.log(f.padEnd(11), `whole text ${Math.round((100 * t.phrase[0]) / t.phrase[1])} % of ${t.phrase[1]}`.padEnd(26), `single words ${Math.round((100 * t.word[0]) / t.word[1])} % of ${t.word[1]}`);
const miss = {}; for (const b of bad) miss[b] = (miss[b] ?? 0) + 1;
console.log('\nwords not found (sample):', Object.keys(miss).slice(0, 25).join('  '));
