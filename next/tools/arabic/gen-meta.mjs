// Writers 8+10: bookmarks (outline) titles, document metadata (Info/XMP), and Arabic file names inside .waraq/ZIP.
import fs from 'node:fs'; import path from 'node:path';
import { m, OUT, T } from './lib.mjs';
import { zip, unzip } from '../../src/lib/zip.ts';
const b = new Uint8Array(fs.readFileSync(path.join(OUT, 'portfolio.pdf')));
const doc = m.Document.openDocument(b, 'application/pdf');
const pdf = doc.asPDF(), res = {};
// outline as MuPDF reads it
const walk = (items, out = []) => { for (const it of items ?? []) { out.push(it.title); walk(it.down, out); } return out; };
res.outlineMuPDF = walk(doc.loadOutline());
const trailer = pdf.getTrailer();
res.info = trailer.get('Info').isDictionary() ? 'present' : 'ABSENT';
res.xmp = trailer.get('Root').get('Metadata').isStream() ? 'present' : 'ABSENT';
res.title = doc.getMetaData('info:Title');
res.pageLabels = trailer.get('Root').get('PageLabels').isDictionary() ? 'present' : 'ABSENT';
res.lang = trailer.get('Root').get('Lang').isNull() ? 'ABSENT' : trailer.get('Root').get('Lang').toString();
res.viewerPrefs = trailer.get('Root').get('ViewerPreferences').isNull() ? 'ABSENT' : 'present';
res.markInfo = trailer.get('Root').get('MarkInfo').isNull() ? 'ABSENT' : 'present';
// the raw outline title bytes
const ol = trailer.get('Root').get('Outlines'); let first = ol.get('First'); res.rawFirstTitle = first.get('Title').toString().slice(0, 60);
// what a metadata write via MuPDF would produce (Waraq has none today): setMetaData with Arabic
const w = m.Document.openDocument(b, 'application/pdf'); w.setMetaData('info:Title', T.pure); w.setMetaData('info:Author', 'عبدالله محمد');
const saved = w.asPDF().saveToBuffer('').asUint8Array().slice();
const info2 = m.Document.openDocument(saved, 'application/pdf').asPDF().getTrailer().get('Info');
res.setMetaDataRaw = info2.get('Title').toString().slice(0, 60);
fs.writeFileSync(path.join(OUT, 'meta-title.pdf'), saved);
// zip with Arabic names: our writer then read back by an independent unzipper (python zipfile, bsdtar, Expand-Archive)
const files = { 'manifest.json': new TextEncoder().encode('{}'), 'files/تقرير عبدالله.pdf': b.slice(0, 100), 'files/فاتورة ٢٠٢٦ (نسخة).pdf': b.slice(0, 100), 'files/ملف.tashkeel-بِسْمِ.pdf': b.slice(0, 50) };
fs.writeFileSync(path.join(OUT, 'arabic-names.waraq'), zip(files));
res.zipRoundTrip = Object.keys(unzip(zip(files)));
fs.writeFileSync(path.join(OUT, 'meta-results.json'), JSON.stringify(res, null, 1)); console.log(JSON.stringify(res, null, 1));
