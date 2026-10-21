// Two small extra fixtures: (1) lone lam-alef words as a page-editor line; (2) a form with ONE Arabic answer (the case that works).
import fs from 'node:fs'; import path from 'node:path';
import { m, fonts, basePdf, save, writeOut, outline, OUT } from './lib.mjs';
import { editPage } from '../../src/lib/engine/editpage.ts';
import { fillForm, listFields } from '../../src/lib/engine/forms.ts';
const F = fonts(), words = ['لا', 'لأ', 'لإ', 'لآ', 'لا شيء', 'ولا', 'الله', 'ألا'];
const d = editPage(m, basePdf([{ w: 595, h: 842 }]), 0, words.map((t, i) => ({ kind: 'text', text: t, x: 60, y: 40 + i * 50, w: 475, h: 30, size: 20, color: [0, 0, 0], bold: false, align: 'right' })), [], () => F);
writeOut('lam.pdf', d.saveToBuffer('').asUint8Array().slice());
fs.writeFileSync(path.join(OUT, 'manifest-lam.json'), JSON.stringify([{ writer: 'lam', file: 'lam.pdf', page: 0, label: 'lone-lam-alef', expect: words }]));
const blank = new Uint8Array(fs.readFileSync(path.join(OUT, 'forms-blank.pdf'))), f = listFields(m, blank);
writeOut('forms-one.pdf', fillForm(m, blank, { [f[0].id]: 'عبدالله محمد الأحمد' }, false, F));
fs.writeFileSync(path.join(OUT, 'manifest-forms-one.json'), JSON.stringify([{ writer: 'forms-one', file: 'forms-one.pdf', page: 0, label: 'one-answer', expect: ['عبدالله محمد الأحمد'] }]));
