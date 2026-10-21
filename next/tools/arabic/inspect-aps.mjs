// prints the appearance streams of the widgets/annots of a fixture PDF: node tools/arabic/inspect-aps.mjs forms.pdf
import fs from 'node:fs'; import path from 'node:path';
import { m, OUT } from './lib.mjs';
const doc = m.Document.openDocument(new Uint8Array(fs.readFileSync(path.join(OUT, process.argv[2]))), 'application/pdf').asPDF();
const an = doc.findPage(+(process.argv[3] ?? 0)).get('Annots');
for (let i = 0; i < an.length; i++) {
  const a = an.get(i), ap = a.get('AP', 'N'), fonts = [];
  if (ap.isStream()) { const f = ap.get('Resources', 'Font'); if (f.isDictionary()) f.forEach((v, k) => fonts.push(k + '=' + v.get('BaseFont').toString())); }
  console.log(a.get('Subtype').toString(), a.get('T').toString().slice(0, 20), '| AP:', ap.isStream() ? ap.readStream().asString().replace(/\n/g, ' ').slice(0, 140) : ap.isDictionary() ? 'dict' : 'none', '| fonts:', fonts.join(','));
}
