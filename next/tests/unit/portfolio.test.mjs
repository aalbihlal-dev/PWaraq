import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newPortfolio, build, plan } from '../../src/lib/portfolio.ts';

const page = (id, doc = 1) => ({ id, doc, page: 0, rotate: 0, w: 595, h: 842 });
const words = { contents: 'Contents', section: 'Section', supervisor: 'Supervisor:', rtl: false };

test('portfolio plan: contents first, dividers lead their sections, numbers follow every change', () => {
  const p = newPortfolio('Course');
  p.sections = [
    { id: 's1', title: 'Week 1', fromFile: true, divider: true, note: '', items: [page('a'), page('b')] },
    { id: 's2', title: 'Week 2', fromFile: false, divider: false, note: '', items: [page('c')] },
    { id: 's3', title: 'Empty', fromFile: false, divider: false, note: '', items: [] },
  ];
  let b = build(p, words);
  assert.deepEqual(b.items.map((it) => (it.toc ? 'toc' : it.divider ? 'div' : 'page')), ['toc', 'div', 'page', 'page', 'page']);
  assert.deepEqual(b.items[0].toc.entries.map((e) => [e.title, e.number, e.to]), [['Week 1', 2, 1], ['Week 2', 5, 4]]);
  assert.equal(b.items[1].divider.label, 'Section 1');
  assert.deepEqual(b.numbers, [0, 1, 2, 3, 4]);
  assert.deepEqual(b.bookmarks.map((x) => [x.title, x.at]), [['Contents', 0], ['Week 1', 1], ['Week 2', 4]]);
  // remove a page: Week 2 moves up one page, and so does its contents entry
  p.sections[0].items.pop();
  b = build(p, words);
  assert.deepEqual(b.items[0].toc.entries.map((e) => e.number), [2, 4]);
  // number one section only: its pages, counted from 1
  p.options.numbers = 's2';
  assert.deepEqual(build(p, words).numbers, [3]);
  assert.equal(plan(p).at.get('c'), 3);
});

test('portfolio cover: first page, not numbered but counted; contents and bookmarks follow it', () => {
  const p = newPortfolio('Course');
  p.sections = [{ id: 's1', title: 'Week 1', fromFile: false, divider: true, note: '', items: [page('a')] }];
  p.options.cover.on = true; p.options.cover.names = ['Abdullah', 'Sara'].join('\n'); p.options.numberPos = 'right';
  const b = build(p, words);
  assert.deepEqual(b.items.map((it) => (it.cover ? 'cover' : it.toc ? 'toc' : it.divider ? 'div' : 'page')), ['cover', 'toc', 'div', 'page']);
  assert.deepEqual(b.items[0].cover.names, ['Abdullah', 'Sara']);
  assert.deepEqual(b.numbers, [1, 2, 3]);
  assert.deepEqual(b.numberStyle, { position: 'br', start: 2 });
  assert.deepEqual(b.items[1].toc.entries.map((e) => e.number), [3]);
  assert.deepEqual(b.bookmarks.map((x) => x.at), [1, 2]);
});
