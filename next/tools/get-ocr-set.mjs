// Builds the real part of the OCR test set, tests/fixtures/ocr/real/ (git-ignored), from publicly published documents:
//   node tools/get-ocr-set.mjs            (downloads into real/dl/ once, then builds; details in tests/fixtures/ocr/README.md)
// r-NN-*: pages of public PDFs that have a text layer (the truth) turned into scans with the synthetic set's scanner
//         effects (tests/fixtures/ocr/scan-fx.mjs); s-NN-*: genuinely scanned pages with hand-checked text from public OCR
//         benchmarks on Hugging Face, as they are. Downloads are data: nothing in them is run.
import fs from 'node:fs';
import path from 'node:path';
import * as m from '../engine/mupdf-wasm/dist/mupdf.js';
import { scanPdf, pictureAsPdf } from '../tests/fixtures/ocr/scan-fx.mjs';

const out = path.join(import.meta.dirname, '..', 'tests', 'fixtures', 'ocr', 'real'), dl = path.join(out, 'dl');
fs.mkdirSync(dl, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/** fetch with retries (the datasets server answers 429 when asked for hundreds of rows in a row) */
const fetchOk = async (url) => { for (let i = 0; ; i++) { const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } }); if (r.ok) return r; if (i > 6) throw new Error(url + ' → ' + r.status); await wait(1500 * 2 ** i); } };
const get = async (file, url) => {
  const f = path.join(dl, file);
  if (!fs.existsSync(f)) { console.log('downloading', file); fs.writeFileSync(f, Buffer.from(await (await fetchOk(url)).arrayBuffer())); }
  return fs.readFileSync(f);
};

// public PDFs with a text layer: page (1-based), scanner effects, and text patches for glyphs the PDF's own text layer lost
const pdfs = [
  { file: 'cma-circular10.pdf', url: 'https://cma.gov.sa/MediaCenter/Documents/circular10.pdf' },
  { file: 'moj-monthly-66.pdf', url: 'https://sjp.moj.gov.sa/RegisterationFIles/Documents/monthlyreports/MonReportForSysCirAndRegV66.pdf' },
  { file: 'gastat-annual-2024.pdf', url: 'https://stats.gov.sa/documents/20117/2435245/Annual_REPORT_2024_AR.pdf_fixed_14296554/427462e1-70d7-9539-6d88-7368ac8c9693?t=1778578565396' },
];
const rendered = [
  { name: 'r-01-cma-circular-letter-300', file: 'cma-circular10.pdf', page: 1, dpi: 300, fx: [['blur', 1]],
    patch: [['ا�شخاص', 'الأشخاص'], ['ا� وبركاته', 'الله وبركاته'], ['ا�جراءات', 'الإجراءات'], ['ا�وضاع', 'الأوضاع'], ['ا�تي', 'الآتي'], ['ا�فصاح', 'الإفصاح']] },
  { name: 'r-02-moj-regulations-list-200', file: 'moj-monthly-66.pdf', page: 8, dpi: 200, fx: [['noise', 10]] },
  { name: 'r-03-gastat-tracks-dense-spread-200', file: 'gastat-annual-2024.pdf', page: 9, dpi: 200, fx: [['blur', 1]] },
  { name: 'r-04-moj-report-intro-tilted-200', file: 'moj-monthly-66.pdf', page: 3, dpi: 200, fx: [['tilt', 1], ['blur', 1]] },
  { name: 'r-05-moj-gazette-list-faded-150', file: 'moj-monthly-66.pdf', page: 16, dpi: 150, fx: [['fade', 70, 190], ['noise', 12]] },
  { name: 'r-06-gastat-definitions-spread-200', file: 'gastat-annual-2024.pdf', page: 13, dpi: 200, fx: [['blur', 1], ['noise', 10]] },
  { name: 'r-07-gastat-price-index-photocopy-200', file: 'gastat-annual-2024.pdf', page: 38, dpi: 200, fx: [['tilt', -1], ['blur', 2], ['noise', 20], ['fade', 40, 230]] },
];
// genuinely scanned pages with reference text (Hugging Face datasets-server rows API; the row's image and text field)
const scanned = [];
const scans = (dataset, short, rows, text, dpi) => rows.forEach((row) => scanned.push({ name: `s-${String(scanned.length + 1).padStart(2, '0')}-${short}-${row}`, dataset, row, text, dpi }));
scans('Misraj/Misraj-DocOCR', 'misraj-dococr', [0, 1, 2, 3, 5], 'markdown', 150); // book and document scans, Markdown truth
scans('ahmedheakl/arocrbench_historicalbooks', 'kitab-historicalbooks', [0, 1], 'answer', 100); // old prints
scans('Misraj/Misraj-DocOCR', 'misraj-dococr', [19, 24, 27, 28, 33, 35, 37, 39, 43, 44], 'markdown', 150); // dense text, accounts, hadith with tashkeel, a table, a bilingual title, an index of numbers
scans('freococo/ocr_arabic_books', 'freococo-books', [0, 450, 900, 1350, 1800, 2250, 2700, 3500], ['page_header', 'body', 'footnotes'], 150); // scanned religious books, footnotes
scans('ahmedheakl/arocrbench_historicalbooks', 'kitab-historicalbooks', [2, 3], 'answer', 100);
// every other Misraj-DocOCR page (Apache-2.0, 400 rows): m-NNN, built when `--all` is given (about 60 MB of downloads)
const all = process.argv.includes('--all'), bulk = [];
if (all) { const used = new Set(scanned.filter((s) => s.dataset === 'Misraj/Misraj-DocOCR').map((s) => s.row)); for (let row = 0; row < 400; row++) if (!used.has(row)) bulk.push({ name: `m-${String(row).padStart(3, '0')}`, dataset: 'Misraj/Misraj-DocOCR', row, text: 'markdown', dpi: 150 }); }
/** Misraj's Markdown truth as the plain text on the page: tables, bold, page-number and picture tags are layout, not words. */
const plain = (t) => t.replace(/<img>[\s\S]*?<\/img>/g, ' ').replace(/<watermark>[\s\S]*?<\/watermark>/g, ' ').replace(/<\/(td|th|tr|p|div)>|<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, ' ').replace(/\*\*|^#+ ?|^\s*-{3,}\s*$|\|/gm, ' ').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();

for (const p of pdfs) await get(p.file, p.url);
for (const r of rendered) {
  const doc = m.Document.openDocument(fs.readFileSync(path.join(dl, r.file)), 'application/pdf'), page = doc.loadPage(r.page - 1), [x0, y0, x1, y1] = page.getBounds();
  let text = page.toStructuredText().asText();
  for (const [a, b] of r.patch ?? []) text = text.replaceAll(a, b);
  const k = r.dpi / 72;
  fs.writeFileSync(path.join(out, r.name + '.pdf'), scanPdf(m, page.toPixmap(m.Matrix.scale(k, k), m.ColorSpace.DeviceGray, false), r.fx, x1 - x0, y1 - y0));
  fs.writeFileSync(path.join(out, r.name + '.txt'), text.trim() + '\n');
  console.log(r.name, text.split(/\s+/).filter(Boolean).length, 'words');
}
const manifest = [];
for (const s of [...scanned, ...bulk]) {
  const row = path.join(dl, s.name + '.json');
  if (!fs.existsSync(row)) fs.writeFileSync(row, JSON.stringify((await (await fetchOk(`https://datasets-server.huggingface.co/rows?dataset=${encodeURIComponent(s.dataset)}&config=default&split=train&offset=${s.row}&length=1`)).json()).rows[0].row));
  const r = JSON.parse(fs.readFileSync(row, 'utf8')), img = await get(s.name + '.jpg', r.image.src);
  fs.writeFileSync(path.join(out, s.name + '.pdf'), pictureAsPdf(m, img, s.dpi));
  let text = [s.text].flat().map((k) => r[k] ?? '').join('\n').trim();
  const table = /<table/.test(text);
  if (s.dataset.startsWith('Misraj')) text = plain(text);
  const letters = Math.max(1, text.replace(/\s/g, '').length), marks = (text.match(/[\u064B-\u0652]/g) || []).length / letters, digits = (text.match(/\p{N}/gu) || []).length / letters;
  manifest.push({ file: s.name + '.pdf', type: table ? 'table' : digits > 0.3 ? 'numbers' : 'prose', arrangement: marks > 0.15 ? 'full tashkeel' : marks > 0.04 ? 'some tashkeel' : 'plain', scan: s.dataset.split('/')[1], set: 'real' });
  fs.writeFileSync(path.join(out, s.name + '.txt'), text + '\n');
  console.log(s.name, r.image.width + 'x' + r.image.height, text.split(/\s+/).filter(Boolean).length, 'words');
}

// --- Arabic Wikisource: proofread pages (quality 3 or 4, human-checked text) of public-domain works, with the page's scan
// from Wikimedia Commons. The licence is read from Commons per file; only "Public domain" files are used. `--wikisource`. ---
const WORKS = [ // Commons file name, how many of its transcribed pages to take
  { file: 'ابن الرومي - حياته من شعره (1931) - العقاد.pdf', per: 14 },
  { file: '-1911-كتاب المطالعة العربية - نبوية موسى.djvu', per: 12 },
  { file: '-1925قواعد التحديث من فنون مصطلح الحديث - جمال الدين القاسمي.djvu', per: 12 },
];
const wikiText = (t) => t.replace(/<noinclude>[\s\S]*?<\/noinclude>/g, ' ').replace(/<ref[\s\S]*?<\/ref>|<ref[^>]*\/>/g, ' ').replace(/\{\|[\s\S]*?\|\}/g, ' ').replace(/\{\{[^{}]*\}\}/g, ' ').replace(/\{\{[^{}]*\}\}/g, ' ')
  .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').replace(/<[^>]+>/g, ' ').replace(/'{2,}/g, '').replace(/^=+\s*|\s*=+$/gm, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
const wiki = async (api, params) => { // politely: one call a second, again after a pause when the server says too many requests
  for (let i = 0; ; i++) {
    await wait(1000);
    const r = await fetch(`https://${api}/w/api.php?format=json&${params}`, { headers: { 'user-agent': 'WaraqOcrTestSet/1.0 (local OCR measurement)' } }), t = await r.text();
    try { return JSON.parse(t); } catch { if (i > 6) throw new Error(t.slice(0, 120)); await wait(5000 * (i + 1)); }
  }
};
if (process.argv.includes('--wikisource')) {
  for (const w of WORKS) {
    const info = (await wiki('commons.wikimedia.org', `action=query&prop=imageinfo&iiprop=extmetadata&titles=${encodeURIComponent('File:' + w.file)}`)).query.pages;
    const licence = Object.values(info)[0].imageinfo?.[0].extmetadata.LicenseShortName?.value;
    console.log(w.file, '→', licence);
    if (licence !== 'Public domain') continue;
    // the pages that exist (a work is transcribed in part), spread evenly: about `per` of them
    const existing = Object.values((await wiki('ar.wikisource.org', `action=query&list=allpages&apnamespace=104&aplimit=500&apprefix=${encodeURIComponent(w.file + '/')}`)).query.allpages).map((x) => +x.title.split('/').pop()).filter((n) => n > 8).sort((x, y) => x - y);
    const nums = existing.filter((_, i) => i % Math.max(1, Math.floor(existing.length / w.per)) === 0).slice(0, w.per);
    console.log('  pages transcribed:', existing.length, '→ sampling', nums.length);
    const pages = []; // a few titles at a time: Arabic titles are long once percent-encoded and the server refuses long addresses
    for (let q = 0; q < nums.length; q += 5) pages.push(...Object.values((await wiki('ar.wikisource.org', `action=query&prop=revisions&rvprop=content&rvslots=main&titles=${nums.slice(q, q + 5).map((n) => encodeURIComponent(`صفحة:${w.file}/${n}`)).join('|')}`)).query.pages));
    for (const pg of pages) {
      const raw = pg.revisions?.[0].slots.main['*'] ?? '', level = +(/pagequality level="(\d)"/.exec(raw)?.[1] ?? 0), n = +pg.title.split('/').pop(), text = wikiText(raw);
      if (level < 3 || text.length < 400 || /[A-Za-z]{4}/.test(text.slice(0, 2000)) && (text.match(/[A-Za-z]/g) || []).length > 40) continue;
      const name = `w-${String(manifest.filter((e) => e.file.startsWith('w-')).length + 1).padStart(2, '0')}-wikisource-${n}`;
      await wait(1500);
      const img = await get(name + '.jpg', `https://commons.wikimedia.org/w/thumb.php?f=${encodeURIComponent(w.file)}&page=${n}&width=1400`);
      fs.writeFileSync(path.join(out, name + '.pdf'), pictureAsPdf(m, img, 150));
      fs.writeFileSync(path.join(out, name + '.txt'), text + '\n');
      manifest.push({ file: name + '.pdf', type: 'prose', arrangement: (text.match(/[\u064B-\u0652]/g) || []).length / text.length > 0.04 ? 'some tashkeel' : 'plain', scan: 'Wikisource ' + (w.file.match(/\d{4}/)?.[0] ?? ''), set: 'real' });
      console.log(name, text.split(/\s+/).length, 'words, quality', level);
    }
  }
}
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 1));
