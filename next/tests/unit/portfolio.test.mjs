import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newPortfolio, build, plan } from '../../src/lib/portfolio.ts';

const page = (id, doc = 1) => ({ id, doc, page: 0, rotate: 0, w: 595, h: 842 });
const words = { contents: 'Contents', section: 'Section', rtl: false };

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
  assert.equal(b.numbers, true);
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
