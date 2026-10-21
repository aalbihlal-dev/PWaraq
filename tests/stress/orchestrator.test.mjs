// The stress orchestrator itself, on tiny fake suites (child processes that print, crash or hang): no corpus needed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { compare, makeBaseline, pool, report, runCommand, sample, tally } from '../../tools/stress/lib.mjs';
import { parse, runStress } from '../../tools/stress/run.mjs';
import { fail, judgeEdit, OCR_ROW } from '../../tools/stress/suites.mjs';

const node = process.execPath, c = (id, slice, status, extra = {}) => ({ id, slice, status, ...extra });

test('sample is deterministic and about the right size', () => {
  const ids = Array.from({ length: 1000 }, (_, i) => 'case' + i), a = sample(ids, 0.1, 's');
  assert.deepEqual(a, sample(ids, 0.1, 's'));
  assert.ok(a.length > 60 && a.length < 140, String(a.length));
  assert.equal(sample(ids, 1).length, 1000);
});

test('runCommand: output, crash exit code, time limit (the tree is killed)', async () => {
  assert.equal((await runCommand([node, '-e', 'console.log("hi")'], { timeout: 10_000 })).stdout.trim(), 'hi');
  assert.equal((await runCommand([node, '-e', 'process.exit(3)'], { timeout: 10_000 })).code, 3);
  const t = Date.now(), r = await runCommand([node, '-e', 'setTimeout(()=>{},60000)'], { timeout: 500 });
  assert.ok(r.timedOut && Date.now() - t < 10_000);
  assert.equal((await runCommand(['no-such-program-xyz'], { timeout: 5000 })).code, -1);
});

test('pool never runs more than n at once', async () => {
  let now = 0, peak = 0;
  await pool(Array.from({ length: 12 }, () => async () => { peak = Math.max(peak, ++now); await new Promise((r) => setTimeout(r, 5)); now--; }), 3);
  assert.equal(peak, 3);
});

test('compare: only new failures are listed; breaches for majors, slice drops and OCR placement', () => {
  const base = makeBaseline([c('a', 'edit', 'pass'), c('b', 'edit', 'major'), c('o', 'ocr', 'pass', { metrics: { placed: 99 } })]);
  assert.deepEqual(base.failing, ['b']);
  assert.equal(base.majorAllowed, 1);
  // same state: nothing new, no breach
  let r = compare([c('a', 'edit', 'pass'), c('b', 'edit', 'major'), c('o', 'ocr', 'pass', { metrics: { placed: 99 } })], base);
  assert.deepEqual([r.newFailures.length, r.breaches.length], [0, 0]);
  // a new major beyond the allowance, a slice that fell by more than a point, placement under 95
  r = compare([c('a', 'edit', 'major'), c('b', 'edit', 'major'), c('o', 'ocr', 'pass', { metrics: { placed: 90 } })], base);
  assert.deepEqual(r.newFailures.map((x) => x.id), ['a']);
  assert.equal(r.breaches.length, 3, r.breaches.join(' / '));
  // strict: any major breaches
  assert.equal(compare([c('b', 'edit', 'major')], base, { strict: true }).breaches.length >= 1, true);
  // a drop of exactly one point is allowed
  const many = Array.from({ length: 200 }, (_, i) => c('x' + i, 'edit', 'pass')), b2 = makeBaseline(many);
  assert.equal(compare([...many.slice(2), c('x0', 'edit', 'minor'), c('x1', 'minor-only', 'pass')], b2).breaches.length, 0);
  assert.equal(compare([...many.slice(5), ...many.slice(0, 5).map((x) => ({ ...x, status: 'minor' }))], b2).breaches.length, 1);
});

test('report: one page, new failures with repro and thumbnail, top 10 per slice', () => {
  const cases = Array.from({ length: 15 }, (_, i) => c('e' + i, 'edit', i < 3 ? 'minor' : 'major', { why: 'w', repro: 'node x ' + i, thumb: 't' + i + '.png' }));
  const md = report(compare(cases, null), { when: 'now', mode: 'full', cases: 15, seconds: 1 });
  assert.match(md, /BREACH/);
  assert.equal(md.match(/repro:/g).length, 10);
  assert.match(md, /thumbnail: t3\.png/);
  assert.ok(md.split('\n').length < 60);
  assert.match(report(compare([c('a', 'x', 'pass')], null), { when: 'now', mode: 'quick', cases: 1, seconds: 0 }), /None\./);
});

test('judges: edit rules, OCR row, fail() carries a repro line', () => {
  const ok = { id: 'f__a', file: 'f.pdf', kind: 'letter', scenario: 'similar', after: {}, extract: { mupdfLineOk: true, oldGone: true }, lifted: 'x' };
  assert.deepEqual(judgeEdit(ok), []);
  assert.match(judgeEdit({ ...ok, error: 'boom' })[0], /boom/);
  assert.match(judgeEdit({ ...ok, drawn: { notdef: 2 } })[0], /notdef/);
  assert.match(judgeEdit({ ...ok, side: { othersGone: 1, othersMoved: 0 } })[0], /lost/);
  const bad = { ...ok, extract: { mupdfLineOk: false, oldGone: true } };
  assert.deepEqual(judgeEdit(bad), []); // MuPDF alone does not condemn
  assert.match(judgeEdit(bad, {}, { pdfjs: { lettersOk: false } })[0], /not read back/);
  assert.deepEqual(judgeEdit(bad, {}, { pdfjs: { lettersOk: true } }), []);
  const m = OCR_ROW.exec('01-letter-naskh-300            93        96.8 %        98.6 %  100.0 %      0                  3.8');
  assert.deepEqual(m.slice(1, 6), ['01-letter-naskh-300', '93', '96.8', '98.6', '100.0']);
  assert.match(fail({ id: 's', cmd: ['node', 'a b'] }, 'x', 'why')[0].repro, /"a b"/);
});

test('runStress end to end: pass, crash, hang; baseline; resume; exit code', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stress-test-'));
  try {
    const mk = (code) => ({ id: 's' + code, cmd: [node, '-e', code], timeout: 1500 });
    const fake = {
      fake: {
        shards: () => [mk('console.log("ok")'), mk('process.exit(7)'), mk('setTimeout(()=>{},60000)'), mk('console.log("ok2")')],
        judge: (s, r) => (r.code === 0 && !r.timedOut ? [{ id: 'fake:' + s.id, slice: 'fake', status: 'pass' }] : fail(s, 'fake', r.timedOut ? 'timeout' : 'exit ' + r.code)),
      },
    };
    const o = { ...parse(['--suites', 'fake', '--jobs', '4']), cache: 'cache', baseline: 'base/baseline.json' }, quiet = { suites: fake, root, log: () => {} };
    let r = await runStress(o, quiet);
    assert.equal(r.code, 1, 'two majors, none allowed');
    assert.deepEqual(r.cases.map((x) => x.status).sort(), ['major', 'major', 'pass', 'pass']);
    assert.match(r.cases.find((x) => /timeout/.test(x.why ?? '')).why, /timeout/);
    const report1 = fs.readFileSync(path.join(root, 'cache/stress-report.md'), 'utf8');
    assert.match(report1, /BREACH/);
    assert.equal(fs.readFileSync(path.join(root, 'cache/stress-results.jsonl'), 'utf8').trim().split('\n').length, 4);
    // record the baseline (a breach does not fail that run), then the same state is clean
    r = await runStress({ ...o, updateBaseline: true }, quiet);
    assert.equal(r.code, 0);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'base/baseline.json'), 'utf8')).majorAllowed, 2);
    r = await runStress(o, quiet);
    assert.equal(r.code, 0);
    assert.match(fs.readFileSync(path.join(root, 'cache/stress-report.md'), 'utf8'), /None\./);
    // a sample never writes a baseline
    const before = fs.readFileSync(path.join(root, 'base/baseline.json'), 'utf8');
    await runStress({ ...o, sample: 0.5, updateBaseline: true }, quiet);
    assert.equal(fs.readFileSync(path.join(root, 'base/baseline.json'), 'utf8'), before);
    // the cache folder keeps itself out of git
    assert.equal(fs.readFileSync(path.join(root, 'cache/.gitignore'), 'utf8').trim(), '*');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('resume re-uses finished shards and re-runs crashed ones', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stress-test-'));
  try {
    const marker = path.join(root, 'ran.txt').replace(/\\/g, '/');
    const fake = { fake: {
      shards: () => [{ id: 'good', cmd: [node, '-e', `require('fs').appendFileSync('${marker}','g');`], timeout: 5000 }, { id: 'flaky', cmd: [node, '-e', `require('fs').appendFileSync('${marker}','f'); if (!require('fs').existsSync('${marker}.second')) { require('fs').writeFileSync('${marker}.second',''); process.exit(1); }`], timeout: 5000 }],
      judge: (s, r) => (r.code === 0 ? [{ id: 'fake:' + s.id, slice: 'fake', status: 'pass' }] : fail(s, 'fake', 'exit ' + r.code)),
    } };
    const o = { ...parse(['--suites', 'fake', '--jobs', '1']), cache: 'cache', baseline: 'none.json' };
    // first run is interrupted by hand: keep `current` so --resume finds it
    const quiet = { suites: fake, root, log: () => {} };
    await runStress(o, quiet);
    const run = fs.readdirSync(path.join(root, 'cache/runs'))[0];
    fs.writeFileSync(path.join(root, 'cache/current'), run);
    const r = await runStress({ ...o, resume: true }, quiet);
    assert.equal(fs.readFileSync(marker.replace(/\//g, path.sep), 'utf8'), 'gff', 'good ran once, flaky twice');
    assert.deepEqual(r.cases.map((x) => x.status), ['pass', 'pass']);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('tally counts per slice', () => {
  assert.deepEqual(tally([c('a', 'x', 'pass'), c('b', 'x', 'minor'), c('c', 'y', 'major')]), { x: { total: 2, pass: 1, minor: 1, major: 0 }, y: { total: 1, pass: 0, minor: 0, major: 1 } });
});
