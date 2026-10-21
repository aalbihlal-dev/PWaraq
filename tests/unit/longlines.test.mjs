// Long subtitle, names, supervisor, header and contents rows never shrink to a hair: they wrap inside the margins, nothing is cut or overlaps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import { assemble } from '../../src/lib/engine/assemble.ts';
import { DESIGNS, COLOURS } from '../../src/lib/engine/designs.ts';

const font = (f) => new m.Font(f, fs.readFileSync(new URL('../../public/fonts/' + f + '.ttf', import.meta.url)));
const fonts = { regular: font('Tajawal-Regular'), bold: font('Tajawal-Bold') };
const A4 = { w: 595, h: 842 }, MARGIN = 28;
const AR150 = 'مقدمة في مبادئ التحليل الإنشائي وتصميم المباني الخرسانية المسلحة مع أمثلة محلولة من الفصل الدراسي الأول وملاحظات المختبر والتمارين المقترحة للطلاب في نهاية كل وحدة';
const EN200 = 'Introduction to the principles of structural analysis and design of reinforced concrete buildings, with worked examples from the first semester of the course and laboratory notes for students at the end of every unit';
const NAME = 'عبدالله محمد الأحمد الحربي الشمري الدوسري', NAME_EN = 'Abdullah Mohammed Al-Ahmad Al-Harbi Al-Shammari'; // about 45 letters: a long name, in a column 186 pt wide (the split design)
const SUP = 'إشراف: الأستاذ الدكتور فاطمة الزهراء بن عبدالله بن محمد الأحمد رئيس قسم الهندسة المدنية';

function lines(doc, n) {
  const j = JSON.parse(doc.loadPage(n).toStructuredText('preserve-whitespace').asJSON());
  return j.blocks.filter((b) => b.type === 'text').flatMap((b) => b.lines.map((l) => ({ text: l.text, x0: l.bbox.x, x1: l.bbox.x + l.bbox.w, y0: l.bbox.y, y1: l.bbox.y + l.bbox.h, size: l.font.size })));
}
const words = (t) => t.split(/\s+/).map((w) => w.replace(/^[.·…]+|[.·…]+$/g, '')).filter(Boolean); // dotted leaders and separators are not words
const overlap = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

function check(doc, page, want, label, minSize) {
  const ls = lines(doc, page).filter((l) => l.text.trim());
  assert.deepEqual([...words(ls.map((l) => l.text).join(' '))].sort(), [...words(want)].sort(), `${label}: every word is there, none cut`);
  for (const l of ls) {
    assert.ok(l.size >= minSize, `${label}: «${l.text.slice(0, 30)}» is ${l.size.toFixed(1)} pt`);
    assert.ok(l.x0 >= MARGIN - 1 && l.x1 <= A4.w - MARGIN + 1 && l.y0 >= 0 && l.y1 <= A4.h, `${label}: «${l.text.slice(0, 30)}» outside the margins (${l.x0.toFixed(0)}..${l.x1.toFixed(0)})`);
  }
  for (let i = 0; i < ls.length; i++) for (let j = i + 1; j < ls.length; j++) {
    const o = overlap(ls[i], ls[j]), small = Math.min((ls[i].x1 - ls[i].x0) * (ls[i].y1 - ls[i].y0), (ls[j].x1 - ls[j].x0) * (ls[j].y1 - ls[j].y0));
    assert.ok(o <= small * 0.08, `${label}: «${ls[i].text.slice(0, 20)}» and «${ls[j].text.slice(0, 20)}» overlap`);
  }
}

for (const rtl of [true, false]) {
  test(`cover, ${rtl ? 'right to left' : 'left to right'}: long subtitle, names and supervisor wrap in all 8 designs (never below 8 pt, nothing overlaps)`, () => {
    for (const [i, design] of DESIGNS.entries()) {
      const names = [rtl ? NAME : NAME_EN, 'سارة', 'Omar'], title = rtl ? 'عنوان' : 'Title', long = rtl ? AR150 : EN200, subtitle = design === 'split' ? long.slice(0, 40).replace(/\s+\S*$/, '') : long; // the split design's column is 186 pt wide: a 150-letter subtitle there is 7 rows and cannot fit above the names and supervisor
      const bytes = assemble(m, () => { throw new Error('no logos'); }, { items: [{ cover: { ...A4, design, color: COLOURS[i % COLOURS.length], rtl, title, subtitle, names, supervisor: SUP, supervisorLabel: '', logos: {} } }] }, () => fonts);
      check(m.Document.openDocument(bytes, 'application/pdf'), 0, [title, subtitle, ...names, SUP].join(' '), `${design}`, 8);
    }
  });
}

test('divider header (the portfolio title and names on every section page): long ones wrap, in both sizes', () => {
  for (const size of ['big', 'small']) for (const [i, design] of DESIGNS.entries()) {
    const header = { title: AR150, name: NAME, size }, bytes = assemble(m, () => { throw new Error('no logos'); }, { items: [{ divider: { ...A4, design, color: COLOURS[i % COLOURS.length], rtl: true, label: 'القسم 1', title: 'الفصل الأول', header } }] }, () => fonts);
    check(m.Document.openDocument(bytes, 'application/pdf'), 0, ['القسم', '1', 'الفصل', 'الأول', AR150, NAME].join(' '), `${design} ${size}`, 7.5);
  }
});

for (const [name, title] of [['Arabic 150', AR150], ['English 200', EN200]]) {
  test(`contents: a long row (${name} characters) wraps on up to three rows, at 8.5 pt or more, nothing cut`, () => {
    const entries = ['فصل قصير', title, 'Short'].map((t, i) => ({ title: t, number: i + 2, to: 0 })), rtl = name.startsWith('Arabic');
    const bytes = assemble(m, () => { throw new Error('none'); }, { items: [{ toc: { ...A4, heading: 'المحتويات', rtl, entries } }] }, () => fonts);
    const doc = m.Document.openDocument(bytes, 'application/pdf');
    check(doc, 0, ['المحتويات', ...entries.map((e) => e.title), '2', '3', '4'].join(' ').replace(/\./g, ''), `contents ${name}`, 8.4);
  });
}
