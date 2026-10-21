// debug: status counts per reader in tests/audit-arabic/results now vs at a git revision.  node tools/arabic/dbg-compare-checks.mjs [rev=HEAD]
import fs from 'node:fs';
import { execSync } from 'node:child_process';
const rev = process.argv[2] ?? 'HEAD', dir = 'tests/audit-arabic/results';
const tally = (rows) => { const t = {}; for (const r of rows) { const k = r.consumer + ' ' + r.status; t[k] = (t[k] ?? 0) + 1; } return t; };
const now = [], was = [];
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.check.json'))) {
  now.push(...JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8')));
  try { was.push(...JSON.parse(execSync(`git show ${rev}:${dir}/${f}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))); } catch {}
}
const a = tally(was), b = tally(now), keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
for (const k of keys) if (a[k] !== b[k]) console.log(k.padEnd(24), String(a[k] ?? 0).padStart(4), '->', String(b[k] ?? 0).padStart(4));
const major = (t) => Object.entries(t).filter(([k]) => !/ (exact|nfkc-only|marks-lost|word-order)$/.test(k)).reduce((s, [, v]) => s + v, 0);
console.log('major-ish', major(a), '->', major(b), ' rows', was.length, '->', now.length);
