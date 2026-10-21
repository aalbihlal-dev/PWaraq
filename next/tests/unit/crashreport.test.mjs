// The crash report keeps no document content and no real file names, and fits in a mail link and a GitHub link.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clean, cleanStack, systemOf, reportText, fit, mailtoUrl, githubUrl, normalise } from '../../src/lib/crashreport.ts';

const entry = (o = {}) => ({ id: '1-error', at: Date.UTC(2026, 9, 21, 12, 0, 5), kind: 'error', version: '1.0.0', system: 'Windows · Edge 131', lang: 'ar', theme: 'dim', task: 'organize',
  job: 'render', message: 'boom', stack: 'Error: boom\n    at x (http://localhost:5188/src/a.ts:1:1)', log: ['12:00:01 task: organize', '12:00:02 [error] boom'], ...o });

test('file names and folders become "file.pdf" and <path>, also Arabic names with spaces the app knows', () => {
  const names = ['تقرير الأسبوع الأول.pdf', 'Sara thesis final.pdf'];
  const out = clean('cannot read تقرير الأسبوع الأول.pdf, then Sara thesis final.pdf, C:\\Users\\Sara\\Documents\\report.pdf and /home/sara/docs/x.docx and \\\\nas\\share\\a.xlsx and file:///C:/x/y.pdf and notes-2026.PDF', names);
  assert.ok(!/تقرير|Sara|sara|thesis|report|notes-2026|nas|\.docx|\.xlsx/i.test(out.replace(/file\.pdf/g, '')), out);
  assert.match(out, /file\.pdf/);
});

test('a long message is cut, a stack keeps only code lines and at most 12 of them', () => {
  assert.ok(clean('x'.repeat(5000)).length <= 301);
  const stack = cleanStack(Array.from({ length: 40 }, (_, i) => `    at f${i} (C:\\Users\\Sara\\app\\a${i}.ts:1:1)`).join('\n'));
  assert.equal(stack.split('\n').length, 12);
  assert.ok(!stack.includes('Sara'));
});

test('the system line names Windows and the browser, or the desktop program', () => {
  const edge = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.2903.51';
  assert.equal(systemOf(edge, false), 'Windows · Edge 131');
  assert.equal(systemOf(edge, true), 'Waraq desktop · Windows · Edge 131');
  assert.equal(systemOf('Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0', false), 'Linux · Firefox 130');
});

test('the preview text has every field and nothing else; the mail and GitHub links carry exactly that text', () => {
  const text = reportText(entry());
  for (const part of ['Time: 2026-10-21 12:00:05 UTC', 'Waraq version: 1.0.0', 'System: Windows · Edge 131', 'Language: ar · Theme: dim', 'Task open: organize', 'Job that failed: render',
    'Message: boom', 'Stack:', 'Last 2 log lines:', '12:00:02 [error] boom']) assert.ok(text.includes(part), part);
  const mail = new URL(mailtoUrl(text)), gh = new URL(githubUrl(text));
  assert.equal(mail.protocol + mail.pathname, 'mailto:support@pwaraq.com');
  assert.equal(mail.searchParams.get('body'), text);
  assert.equal(gh.origin + gh.pathname, 'https://github.com/tshi-dev/PWaraq/issues/new');
  assert.equal(gh.searchParams.get('template'), 'problem.md');
  assert.equal(gh.searchParams.get('body'), text);
});

test('a long report is trimmed to fit a mail link (and a GitHub link), with a note', () => {
  const text = reportText(entry({ log: Array.from({ length: 50 }, (_, i) => `12:00:${i} [warn] ${'word '.repeat(30)}`) }));
  assert.ok(text.length > 2500);
  const mail = new URL(mailtoUrl(text));
  assert.ok(mailtoUrl(text).length < 2300, String(mailtoUrl(text).length));
  assert.match(mail.searchParams.get('body'), /trimmed/);
  assert.ok(githubUrl(text).length < 6600);
  assert.equal(fit('short', 100), 'short');
});

test('an entry the desktop program wrote (fewer fields) is read with defaults', () => {
  const e = normalise({ id: '5-panic', at: 5, kind: 'panic', version: '1.0.0', system: 'Waraq desktop (Windows)', message: 'oops', stack: 'lib.rs:10' });
  assert.deepEqual([e.log, e.task, e.lang, e.seen], [[], '', '', false]);
  assert.ok(reportText(e).includes('desktop program error'));
});
