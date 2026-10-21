// `pnpm stress` — the low-token stress pipeline: scripts do everything, an AI only reads the one-page report.
//   node tools/stress/run.mjs [--quick | --sample 0.25] [--suites unit,edit,ocr,write] [--e2e] [--jobs N] [--seed s]
//        [--no-deep] [--resume] [--strict] [--generate] [--fetch] [--update-baseline] [--baseline file] [--cache dir]
// Stages: 1 corpus (existing fixtures; --generate rebuilds them, --fetch downloads the public OCR sets into the cache),
// 2 shards (one child process per file/page/test file, all cores but 2, per-shard time limit, a crash is a case not a
// stop), 3 numeric judges (suites.mjs), 4 comparison with tests/stress/baseline.json → stress-report.md (new failures
// only) + stress-results.jsonl, exit 1 on a breach, 5 --update-baseline. See tools/stress/README.md.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compare, DEFAULT_LIMITS, makeBaseline, pool, report, runCommand, sample, writeJson } from './lib.mjs';
import { fail, ROOT, suites as defaultSuites } from './suites.mjs';

const hash = (s) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7).toString(36);

/** Runs the pipeline. `o` = parsed options (see parse()); `suites` and the paths can be replaced (the tests do). Returns { code, cases, cmp }. */
export async function runStress(o, { suites = defaultSuites, root = ROOT, log = console.log } = {}) {
  const t0 = Date.now(), cache = path.resolve(root, o.cache), baselineFile = path.resolve(root, o.baseline);
  fs.mkdirSync(cache, { recursive: true });
  fs.writeFileSync(path.join(cache, '.gitignore'), '*\n');
  const current = path.join(cache, 'current');
  const runId = o.resume && fs.existsSync(current) ? fs.readFileSync(current, 'utf8').trim() : new Date().toISOString().replace(/[:.]/g, '-');
  fs.writeFileSync(current, runId);
  const dir = path.join(cache, 'runs', runId), shardDir = path.join(dir, 'shards');
  fs.mkdirSync(shardDir, { recursive: true });
  const baseline = fs.existsSync(baselineFile) ? JSON.parse(fs.readFileSync(baselineFile, 'utf8')) : null;
  const limits = { ...DEFAULT_LIMITS, ...(baseline?.limits ?? {}) };

  // stage 1: corpus
  const prep = [];
  if (o.generate) prep.push(['node', 'tools/arabic/make-corpus.mjs'], ['node', 'tools/arabic/make-scans.mjs']);
  if (o.fetch) prep.push(['node', 'tools/get-ocr-set.mjs']);
  for (const [, ...args] of prep) { const r = await runCommand([process.execPath, ...args], { cwd: root, timeout: 1_800_000, env: { STRESS_CACHE: cache } }); log(`corpus: ${args.join(' ')} → exit ${r.code}`); }

  // stage 2: shards
  const names = o.suites.filter((n) => suites[n] && (!suites[n].optional || o.e2e || o.suites.includes(n)));
  const jobs = [];
  for (const n of names) {
    const all = suites[n].shards({ dir, cache, root });
    const pick = new Set(sample(all.map((s) => s.id), o.sample, o.seed + n));
    const shards = all.filter((s) => pick.has(s.id));
    if (!shards.length && all.length) shards.push(all[0]);
    for (const s of shards) jobs.push({ suite: n, shard: s, file: path.join(shardDir, `${n}__${hash(s.id)}.json`) });
  }
  log(`${jobs.length} shards in ${names.join(', ')}, ${o.jobs} at a time${o.sample < 1 ? `, sample ${o.sample}` : ''}`);
  let finished = 0;
  await pool(jobs.map((j) => async () => {
    const prev = fs.existsSync(j.file) ? JSON.parse(fs.readFileSync(j.file, 'utf8')) : null;
    if (o.resume && prev && !prev.crashed) { j.cases = prev.cases; finished++; return; }
    j.shard.timeout ??= 300_000;
    const r = await runCommand(j.shard.cmd.map((a, i) => (i === 0 ? a : String(a))), { cwd: root, timeout: j.shard.timeout });
    let cases;
    try { cases = suites[j.suite].judge(j.shard, r, { limits, cache, dir }); } catch (e) { cases = fail(j.shard, j.suite, 'judge error: ' + e.message); }
    for (const c of cases) c.slice ??= j.suite;
    j.cases = cases;
    writeJson(j.file, { cases, crashed: r.timedOut || r.code !== 0, ms: Date.now() - t0 });
    if (++finished % 10 === 0) log(`  ${finished}/${jobs.length}`);
  }), o.jobs);

  // stages 3-4: judge → (deep: second readers) → compare → report
  const cases = jobs.flatMap((j) => j.cases ?? []);
  if (o.deep) for (const n of names) if (suites[n].deep) { log(`deep: ${n}`); await suites[n].deep({ jobs, dir, root, cases, run: (cmd, opt) => runCommand(cmd, opt) }); }
  const cmp = compare(cases, baseline, { strict: o.strict, limits, sampled: o.sample < 1 });
  const seconds = Math.round((Date.now() - t0) / 1000);
  fs.writeFileSync(path.join(cache, 'stress-results.jsonl'), cases.map((c) => JSON.stringify(c)).join('\n') + '\n');
  const md = report(cmp, { when: new Date().toISOString().slice(0, 16).replace('T', ' '), mode: o.quick ? 'quick' : 'full', cases: cases.length, seconds, sampled: o.sample < 1 ? o.sample : 0 });
  fs.writeFileSync(path.join(cache, 'stress-report.md'), md);
  fs.writeFileSync(path.join(dir, 'done'), '');
  fs.rmSync(current, { force: true });
  if (o.updateBaseline) {
    if (o.sample < 1) log('baseline NOT written: it needs a full run (no --quick / --sample)');
    else { fs.mkdirSync(path.dirname(baselineFile), { recursive: true }); fs.writeFileSync(baselineFile, JSON.stringify({ ...makeBaseline(cases, { seconds, cases: cases.length }), limits: baseline?.limits }, null, 1) + '\n'); log('baseline written: ' + path.relative(root, baselineFile)); }
  }
  log(`${cases.length} cases, ${cmp.majors} major, ${cmp.newFailures.length} new failures, ${seconds} s → ${path.relative(root, path.join(cache, 'stress-report.md'))}`);
  for (const b of cmp.breaches) log('BREACH: ' + b);
  return { code: cmp.breaches.length && !o.updateBaseline ? 1 : 0, cases, cmp };
}

export function parse(argv) {
  const has = (k) => argv.includes('--' + k), val = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
  const quick = has('quick');
  return {
    quick, sample: +val('sample', quick ? 0.1 : 1), seed: val('seed', 'waraq'), jobs: +val('jobs', Math.max(1, os.cpus().length - 2)),
    suites: val('suites', 'unit,edit,ocr,write' + (has('e2e') ? ',e2e' : '')).split(','), e2e: has('e2e'), resume: has('resume'), strict: has('strict'),
    generate: has('generate'), deep: !has('no-deep'), fetch: has('fetch'), updateBaseline: has('update-baseline'),
    baseline: val('baseline', 'tests/stress/baseline.json'), cache: val('cache', '.stress-cache'),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  runStress(parse(process.argv.slice(2))).then((r) => process.exit(r.code), (e) => { console.error(e); process.exit(2); });
}
