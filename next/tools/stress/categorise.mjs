// Where the majors are: counts by suite x reason x producer/font x layout x script feature, the top 15 combinations with one
// reproduction and thumbnail each. Reads .stress-cache/stress-results.jsonl (written by `pnpm stress`); no case is read by hand.
// usage: node tools/stress/categorise.mjs [--top 15] [--status major|minor] [--file path]
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const file = arg('file', path.join(import.meta.dirname, '../../.stress-cache/stress-results.jsonl')), top = +arg('top', 15), status = arg('status', 'major');
const rows = fs.readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((r) => r.status === status);

const feature = (t = '') => /[ً-ٰٟ]/.test(t) ? 'tashkeel' : /[پچژگکیھ]/.test(t) ? 'persian/urdu' : /[٠-٩۰-۹]/.test(t) ? 'arabic-indic digits'
  : /[؀-ۿ]/.test(t) && /[A-Za-z0-9]/.test(t) ? 'arabic+latin' : /[؀-ۿ]/.test(t) ? 'pure arabic' : 'latin';
const producer = (f = '') => (/^(edge|word|libreoffice|mupdf-story|waraq|type|real|hybrid|cadlike|mixed)/.exec(f)?.[1] ?? 'other');
const reason = (w = '') => w.replace(/[0-9]+(\.[0-9]+)? ?%/g, '#%').replace(/[0-9]+/g, '#').replace(/\s+/g, ' ').slice(0, 80);

function describe(r) {
  const id = r.id;
  if (r.slice === 'edit') { // edit:<file>__<n-textkind>__<scenario>
    const [, rest] = id.split(':'), [f, kind, scen] = rest.split('__'), k = (kind ?? '').replace(/^\d+-/, '');
    return { suite: 'edit', reason: reason(r.why), producer: producer(f), font: f.replace(/^(edge|word|libreoffice|mupdf-story|waraq|type|real|hybrid|cadlike|mixed)-?/, '') || f, layout: /^type-/.test(f) ? f.slice(5) : 'single line', feature: /tashkeel|lamalef|mixed|table|invoice|letter/.test(k) ? k : k, scenario: scen };
  }
  if (r.slice === 'write') { // write:<manifest>|<reader>|<file>|p<page>|<label>|<text>
    const [m, reader, , page, label, ...t] = id.slice(6).split('|');
    return { suite: 'write', reason: reason(r.why), producer: m.replace(/-.*/, ''), font: reader, layout: label, feature: feature(t.join('|')), scenario: page };
  }
  return { suite: r.slice, reason: reason(r.why), producer: '', font: '', layout: '', feature: '', scenario: '' };
}
const cases = rows.map((r) => ({ r, d: describe(r) }));
const count = (key) => { const m = new Map(); for (const c of cases) { const k = key(c.d); m.set(k, (m.get(k) ?? 0) + 1); } return [...m].sort((a, b) => b[1] - a[1]); };
const table = (title, key, n = 12) => { console.log(`\n### ${title}`); for (const [k, v] of count(key).slice(0, n)) console.log(`${String(v).padStart(5)}  ${k}`); };

console.log(`# ${cases.length} ${status} cases (${path.relative(process.cwd(), file)})`);
table('by suite', (d) => d.suite);
table('by suite x reason', (d) => `${d.suite} | ${d.reason}`);
table('edit: by producer', (d) => (d.suite === 'edit' ? d.producer : null));
table('edit: by text kind', (d) => (d.suite === 'edit' ? d.feature : null));
table('edit: by scenario', (d) => (d.suite === 'edit' ? d.scenario : null));
table('edit: worst fonts / files', (d) => (d.suite === 'edit' ? `${d.producer}-${d.font}` : null), 15);
table('write: by reader', (d) => (d.suite === 'write' ? d.font : null));
table('write: by script feature', (d) => (d.suite === 'write' ? d.feature : null));
table('write: by fixture', (d) => (d.suite === 'write' ? d.producer : null));
const combos = new Map();
for (const c of cases) { const k = [c.d.suite, c.d.reason, c.d.producer, c.d.suite === 'write' ? c.d.font : '', c.d.feature].join(' | '); const e = combos.get(k) ?? { n: 0, first: c.r }; e.n++; combos.set(k, e); }
console.log(`\n## top ${top} combinations: suite | reason | producer | reader | feature`);
for (const [k, e] of [...combos].sort((a, b) => b[1].n - a[1].n).slice(0, top)) console.log(`\n${String(e.n).padStart(5)}  ${k}\n       repro: ${e.first.repro ?? ''}${e.first.thumb ? '\n       thumb: ' + e.first.thumb : ''}\n       e.g. ${e.first.id.slice(0, 110)}`);
