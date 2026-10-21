// Pure, Node-testable parts of the stress orchestrator: sampling, a crash-safe parallel runner (one child process per
// shard: the WASM heap does not shrink and a crash or hang cannot take the run down), baseline comparison, the report.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** Deterministic sample: the same ids are picked for the same seed, whatever else is in the list. */
export const sample = (ids, fraction, seed = 'waraq') => (fraction >= 1 ? ids : ids.filter((id) => parseInt(createHash('sha1').update(seed + id).digest('hex').slice(0, 8), 16) / 0xffffffff < fraction));

/** Runs `cmd` ([exe, ...args]) with a time limit; never throws. Resolves { code, stdout, stderr, timedOut }. */
export function runCommand(cmd, { cwd, timeout, env }) {
  return new Promise((resolve) => {
    let stdout = '', stderr = '', timedOut = false, done = false, timer;
    const finish = (code) => { if (!done) { done = true; clearTimeout(timer); resolve({ code, stdout, stderr, timedOut }); } };
    let child;
    try { child = spawn(cmd[0], cmd.slice(1), { cwd, env: { ...process.env, ...env }, windowsHide: true }); } catch (e) { return resolve({ code: -1, stdout, stderr: String(e), timedOut }); }
    const cap = (s, d) => (s + d).slice(-4_000_000);
    child.stdout.on('data', (d) => (stdout = cap(stdout, d)));
    child.stderr.on('data', (d) => (stderr = cap(stderr, d)));
    child.on('error', (e) => { stderr += String(e); finish(-1); });
    child.on('close', (code) => finish(code ?? -1));
    timer = setTimeout(() => {
      timedOut = true;
      if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); else child.kill('SIGKILL');
    }, timeout);
  });
}

/** Runs `tasks` (async functions) with at most `n` at a time. */
export async function pool(tasks, n) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, tasks.length)) }, async () => { while (next < tasks.length) await tasks[next++](); }));
}

const rate = (c) => (c.total ? (100 * c.pass) / c.total : 100);
/** cases → { slice: { total, pass, minor, major } } */
export function tally(cases) {
  const t = {};
  for (const c of cases) { const s = (t[c.slice] ??= { total: 0, pass: 0, minor: 0, major: 0 }); s.total++; s[c.status === 'pass' ? 'pass' : c.status]++; }
  return t;
}

/** What `--update-baseline` stores: per-slice pass rate, the failing case ids (so only NEW failures are reported), the majors allowed. */
export function makeBaseline(cases, extra = {}) {
  const t = tally(cases);
  return {
    when: new Date().toISOString(), ...extra,
    slices: Object.fromEntries(Object.entries(t).map(([k, v]) => [k, { ...v, rate: +rate(v).toFixed(2) }])),
    failing: cases.filter((c) => c.status !== 'pass').map((c) => c.id).sort(),
    majorAllowed: cases.filter((c) => c.status === 'major').length,
  };
}

export const DEFAULT_LIMITS = { maxMajor: 0, ocrPlacement: 95, sliceDrop: 1, ocrCharsMin: 80, ocrWordsMin: 90 };

/**
 * Compares a run with the baseline. Breaches: majors above the allowed count (baseline.majorAllowed; 0 with `strict` or
 * without a baseline), OCR placement under the limit, a slice whose pass rate is more than `sliceDrop` points under the
 * baseline's. `newFailures` = failing now and not failing in the baseline (what the report lists).
 */
export function compare(cases, baseline, { strict = false, limits = {} } = {}) {
  const L = { ...DEFAULT_LIMITS, ...limits }, t = tally(cases), known = new Set(baseline?.failing ?? []);
  const breaches = [], newFailures = cases.filter((c) => c.status !== 'pass' && !known.has(c.id));
  const majors = cases.filter((c) => c.status === 'major').length, allowed = strict || !baseline ? L.maxMajor : baseline.majorAllowed ?? L.maxMajor;
  if (majors > allowed) breaches.push(`major issues: ${majors} (allowed ${allowed})`);
  const placed = cases.filter((c) => typeof c.metrics?.placed === 'number').map((c) => c.metrics.placed);
  const placement = placed.length ? placed.reduce((a, b) => a + b, 0) / placed.length : null;
  if (placement !== null && placement < L.ocrPlacement) breaches.push(`OCR placement ${placement.toFixed(1)} % (limit ${L.ocrPlacement} %)`);
  const slices = {};
  for (const [k, v] of Object.entries(t)) {
    const now = rate(v), was = baseline?.slices?.[k]?.rate, drop = was === undefined ? 0 : was - now;
    slices[k] = { ...v, rate: +now.toFixed(2), baseline: was ?? null, drop: +drop.toFixed(2) };
    if (drop > L.sliceDrop) breaches.push(`slice ${k}: ${now.toFixed(1)} % vs baseline ${was.toFixed(1)} % (more than ${L.sliceDrop} point worse)`);
  }
  return { breaches, newFailures, slices, majors, placement };
}

/** One page: counts by slice, the 10 worst new failures per slice, each with a reproduction line and a thumbnail path. */
export function report(cmp, meta) {
  const L = [`# Stress report — ${meta.when}`, '', `${meta.mode}, ${meta.cases} cases in ${meta.seconds} s${meta.sampled ? ` (sample ${meta.sampled})` : ''}. ${cmp.breaches.length ? '**BREACH**' : 'No threshold breached.'}`, ''];
  for (const b of cmp.breaches) L.push(`- ${b}`);
  L.push('', '| Slice | Cases | Pass | Minor | Major | Rate | Baseline |', '|---|---|---|---|---|---|---|');
  for (const [k, v] of Object.entries(cmp.slices)) L.push(`| ${k} | ${v.total} | ${v.pass} | ${v.minor} | ${v.major} | ${v.rate} % | ${v.baseline ?? '–'} |`);
  const order = { major: 0, minor: 1 };
  L.push('', `## New failures (${cmp.newFailures.length}; top 10 per slice, majors first)`);
  const by = {};
  for (const c of cmp.newFailures) (by[c.slice] ??= []).push(c);
  if (!cmp.newFailures.length) L.push('', 'None.');
  for (const [k, cs] of Object.entries(by)) {
    L.push('', `### ${k} (${cs.length})`);
    for (const c of cs.sort((a, b) => order[a.status] - order[b.status]).slice(0, 10)) L.push(`- **${c.status}** \`${c.id}\` — ${c.why || ''}${c.repro ? `\n  - repro: \`${c.repro}\`` : ''}${c.thumb ? `\n  - thumbnail: ${c.thumb}` : ''}`);
  }
  return L.join('\n') + '\n';
}

export const writeJson = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.tmp', JSON.stringify(o)); fs.renameSync(f + '.tmp', f); };
