// A very long title never overflows or gets cut on the pages Waraq writes: it wraps (and shrinks a little) inside the margins.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import { assemble } from '../../src/lib/engine/assemble.ts';
import { wrap } from '../../src/lib/engine/textpage.ts';
import { DESIGNS, COLOURS } from '../../src/lib/engine/designs.ts';

const font = (f) => new m.Font(f, fs.readFileSync(new URL('../../public/fonts/' + f + '.ttf', import.meta.url)));
const fonts = { regular: font('Tajawal-Regular'), bold: font('Tajawal-Bold') };
const A4 = { w: 595, h: 842 }, MARGIN = 30;
const EN = Array.from({ length: 200 }, (_, i) => (i % 8 === 7 ? ' ' : String.fromCharCode(97 + ((i * 7) % 26)))).join('').replace(/ +/g, ' ').trim();
const EN200 = ('Introduction to the principles of structural analysis and design of reinforced concrete buildings, ' + 'with worked examples from the first semester of the course and laboratory notes ').repeat(2).slice(0, 200).trim();
const AR150 = ('مقدمة في مبادئ التحليل الإنشائي وتصميم المباني الخرسانية المسلحة مع أمثلة محلولة من الفصل الدراسي الأول ومذكرات المختبر ').repeat(2).slice(0, 150).trim();
const OUT = new URL('../../test-results/longnames/', import.meta.url);

/** Text lines of a page: their words and boxes. */
function lines(doc, n) {
  const j = JSON.parse(doc.loadPage(n).toStructuredText('preserve-whitespace').asJSON());
  return j.blocks.filter((b) => b.type === 'text').flatMap((b) => b.lines.map((l) => ({ text: l.text, x0: l.bbox.x, x1: l.bbox.x + l.bbox.w, y0: l.bbox.y, y1: l.bbox.y + l.bbox.h, size: l.font.size, bold: /bold/i.test(l.font.name + l.font.weight) })));
}
const words = (t) => t.split(/\s+/).filter(Boolean);

for (const [lang, title, rtl] of [['English 200', EN200, false], ['Arabic 150', AR150, true]]) {
  test(`long title (${lang} characters): cover and section page, every design — wrapped on 2+ lines, inside the page, nothing cut`, () => {
    fs.mkdirSync(OUT, { recursive: true });
    for (const [i, design] of DESIGNS.entries()) {
      const color = COLOURS[i % COLOURS.length];
      const bytes = assemble(m, () => { throw new Error('no logos'); }, { items: [
        { cover: { ...A4, design, color, rtl, title, subtitle: 'Sub', names: ['Name'], supervisor: '', supervisorLabel: '', logos: {} } },
        { divider: { ...A4, design, color, rtl, label: rtl ? 'القسم 1' : 'Section 1', title, note: 'Note' } },
      ] }, () => fonts);
      const doc = m.Document.openDocument(bytes, 'application/pdf');
      for (const page of [0, 1]) {
        const ls = lines(doc, page), body = ls.filter((l) => l.bold); // the title lines are the only bold ones
        const text = words(body.map((l) => l.text).join(' ')), want = words(title);
        assert.ok(body.length >= 2, `${design} p${page}: ${body.length} title lines`);
        assert.deepEqual([...text].sort(), [...want].sort(), `${design} p${page}: every word is there, none cut`);
        for (const l of ls) {
          assert.ok(l.x0 >= MARGIN && l.x1 <= A4.w - MARGIN, `${design} p${page}: "${l.text.slice(0, 20)}" x ${l.x0.toFixed(0)}..${l.x1.toFixed(0)} inside the page`);
          assert.ok(l.y0 >= 0 && l.y1 <= A4.h - 20, `${design} p${page}: line inside the page vertically (${l.y0.toFixed(0)}..${l.y1.toFixed(0)})`);
        }
        assert.ok(Math.min(...body.map((l) => l.size)) >= 13, `${design} p${page}: title not tiny`);
        if (i % 4 === 0) fs.writeFileSync(new URL(`${lang.replace(' ', '')}-${design}-${page}.png`, OUT), doc.loadPage(page).toPixmap(m.Matrix.scale(0.6, 0.6), m.ColorSpace.DeviceRGB, false).asPNG());
      }
    }
  });
}

test('contents: a 200-character English and a 150-character Arabic title are written whole on 2-3 lines, with the number and inside the margins', () => {
  for (const [title, rtl] of [[EN200, false], [AR150, true], ['Short', false]]) {
    const entries = [{ title: 'Week 1', number: 3, to: 0 }, { title, number: 12, to: 0 }, { title: 'Week 3', number: 20, to: 0 }];
    const bytes = assemble(m, () => { throw new Error('none'); }, { items: [{ toc: { ...A4, heading: rtl ? 'المحتويات' : 'Contents', rtl, entries } }] }, () => fonts);
    const ls = lines(m.Document.openDocument(bytes, 'application/pdf'), 0);
    for (const l of ls) assert.ok(l.x0 >= 60 && l.x1 <= A4.w - 60, `"${l.text.slice(0, 20)}" x ${l.x0.toFixed(0)}..${l.x1.toFixed(0)} inside the margins`);
    const row = ls.filter((l) => l.y0 > 150 && l.size < 14 && !/^[\d.\s]+$/.test(l.text) && !/^Week/.test(l.text));
    const got = words(row.map((l) => l.text).join(' ')).map((w) => w.replace(/(\s|\.)+$/, '')).filter(Boolean); // (the dotted leader may touch the last word)
    if (title === 'Short') { assert.equal(row.length, 1); continue; }
    assert.ok(row.length >= 2 && row.length <= 3, `${row.length} lines for ${title.slice(0, 12)}`);
    assert.deepEqual([...got].sort(), [...words(title)].sort(), 'the whole title, none cut with …');
  }
});

test('wrap breaks a word longer than the line between letters', () => {
  const out = wrap((t) => t.length, 'ab ' + 'x'.repeat(25) + ' cd', 10);
  assert.ok(out.every((l) => l.length <= 10), JSON.stringify(out));
  assert.equal(out.join('').replace(/ /g, ''), 'ab' + 'x'.repeat(25) + 'cd');
});
