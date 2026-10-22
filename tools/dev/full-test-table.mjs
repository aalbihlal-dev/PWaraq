// Turns the results.json of tools/dev/full-test.mjs into the markdown table of the report: one row per check, EN and AR side by side.
//   node tools/dev/full-test-table.mjs <results.json> [shots folder prefix to print]
import fs from 'node:fs';
import path from 'node:path';
const file = process.argv[2], r = JSON.parse(fs.readFileSync(file, 'utf8')).results;
const mark = { pass: 'pass', fail: '**FAIL**', note: 'note' };
const rows = new Map();
for (const x of r) { const k = x.task + '\u0000' + x.name.replace(/^Find \(Ctrl F\) types ".*?"/, 'Find (Ctrl F) types a word'); const e = rows.get(k) ?? { task: x.task, name: x.name.replace(/^Find \(Ctrl F\) types ".*?"/, 'Find (Ctrl F) types a word') }; e[x.lang] = x; rows.set(k, e); }
const cell = (x) => (x ? `${mark[x.status]}${x.status !== 'pass' && x.note ? ' — ' + x.note.replace(/\|/g, '/').slice(0, 140) : ''}${x.shot ? ` ([shot](../screenshots/full-test/${x.shot}))` : ''}` : '–');
let last = '';
const out = ['| Task | Check | EN | AR |', '|---|---|---|---|'];
for (const e of rows.values()) { out.push(`| ${e.task === last ? '' : e.task} | ${e.name.replace(/\|/g, '/')} | ${cell(e.en)} | ${cell(e.ar)} |`); last = e.task; }
const c = (s) => r.filter((x) => x.status === s).length;
console.log(`${c('pass')} pass, ${c('fail')} fail, ${c('note')} note (${r.length} checks, ${rows.size} rows)\n`);
console.log(out.join('\n'));
