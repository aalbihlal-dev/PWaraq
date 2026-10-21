// Renders every page of tests/fixtures/arabic-create/<name>.pdf with MuPDF and PDFium (WASM), and extracts the text each
// one reads back. Output: screenshots/arabic-audit/<name>/<consumer>-pNN.png and tests/audit-arabic/results/<name>.<consumer>.json
// usage: node tools/arabic/render.mjs <name> [scale]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { m, ROOT, OUT, SHOTS } from './lib.mjs';

const name = process.argv[2], scale = +(process.argv[3] ?? 1.4);
const bytes = new Uint8Array(fs.readFileSync(path.join(OUT, name + '.pdf')));
const shots = path.join(SHOTS, name), res = path.join(ROOT, 'tests/audit-arabic/results');
fs.mkdirSync(shots, { recursive: true }); fs.mkdirSync(res, { recursive: true });
const pad = (n) => String(n).padStart(2, '0');

// MuPDF
{
  const doc = m.Document.openDocument(bytes, 'application/pdf'), texts = [];
  for (let i = 0; i < doc.countPages(); i++) {
    const p = doc.loadPage(i), pix = p.toPixmap(m.Matrix.scale(scale, scale), m.ColorSpace.DeviceRGB, false);
    fs.writeFileSync(path.join(shots, `mupdf-p${pad(i)}.png`), pix.asPNG());
    const st = p.toStructuredText('preserve-whitespace');
    texts.push(st.asText()); st.destroy(); pix.destroy(); p.destroy();
  }
  fs.writeFileSync(path.join(res, `${name}.mupdf.json`), JSON.stringify(texts, null, 1));
}
// PDFium (the engine inside Chrome / Edge's PDF viewer)
{
  const req = createRequire(path.join(ROOT, 'tools/arabic/pdfium/package.json'));
  const { PDFiumLibrary } = await import(pathToFileURL(req.resolve('@hyzyla/pdfium')).href);
  const { PNG } = req('pngjs');
  const lib = await PDFiumLibrary.init(), doc = await lib.loadDocument(Buffer.from(bytes)), texts = [];
  for (const page of doc.pages()) {
    const png = await page.render({ scale, render: async (o) => { const p = new PNG({ width: o.width, height: o.height }); Buffer.from(o.data).copy(p.data); return PNG.sync.write(p); } });
    fs.writeFileSync(path.join(shots, `pdfium-p${pad(page.number)}.png`), Buffer.from(png.data));
    texts[page.number] = page.getText();
  }
  fs.writeFileSync(path.join(res, `${name}.pdfium.json`), JSON.stringify(texts, null, 1));
  doc.destroy(); lib.destroy();
}
console.log('rendered', name, '->', shots);
