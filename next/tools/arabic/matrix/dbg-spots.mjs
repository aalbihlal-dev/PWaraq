import { m } from '../lib.mjs';
import { findSpots } from '../../../src/lib/engine/sign.ts';
import { subjects, truth } from './mx.mjs';
const R = (b) => b && [b.x, b.y, b.w, b.h].map(Math.round).join(',');
for (const id of process.argv.slice(2)) {
  const s = subjects((s) => s.id === id)[0], d = m.Document.openDocument(s.bytes(), 'application/pdf'), p = d.loadPage(0);
  console.log('==', id, 'truth blanks:', truth(s, 'sign')?.map(R).join(' | '));
  for (const sp of findSpots(p, 0)) console.log('  ', sp.kind, sp.field ? 'field' : '', 'rtl=' + sp.rtl, 'blank', R(sp), 'label', R(sp.label));
}
