// thumbnails of every base document (one PNG each) + a contact sheet: node tools/arabic/corpus/thumbs.mjs [dir]
import fs from 'node:fs'; import path from 'node:path';
import { m, OUT, SHOTS } from '../lib.mjs';
const dir = path.join(OUT, process.argv[2] ?? 'base'), out = path.join(SHOTS, 'corpus', process.argv[2] ?? 'base'); fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.pdf'))) {
  const d = m.Document.openDocument(new Uint8Array(fs.readFileSync(path.join(dir, f))), 'application/pdf'), p = d.loadPage(0), [x0, y0, x1, y1] = p.getBounds(), k = 500 / Math.max(x1 - x0, y1 - y0);
  fs.writeFileSync(path.join(out, f.replace('.pdf', '.png')), p.toPixmap(m.Matrix.scale(k, k), m.ColorSpace.DeviceRGB, false).asPNG()); console.log(f, d.countPages(), 'pages');
}
