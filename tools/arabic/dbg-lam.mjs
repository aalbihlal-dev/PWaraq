import { m, fonts, basePdf, save } from './lib.mjs';
import { editPage } from '../../src/lib/engine/editpage.ts';
const F = fonts();
const cases = ['لا', 'لا شيء', 'الله', 'إلا', 'ولا', 'لأ', 'لا لا لا', 'سلام', 'مرحبا بك ولا'];
for (const t of cases) {
  const base = basePdf([{ w: 400, h: 200, grid: false }]);
  const d = editPage(m, base, 0, [{ kind: 'text', text: t, x: 20, y: 20, w: 360, h: 30, size: 20, color: [0, 0, 0], bold: false, align: 'right' }], [], () => F);
  const b = d.saveToBuffer('').asUint8Array().slice();
  const st = m.Document.openDocument(b, 'application/pdf').loadPage(0).toStructuredText('preserve-whitespace').asText().trim();
  console.log(JSON.stringify(t), '->', JSON.stringify(st), st === t ? 'OK' : 'DIFF');
}
