import { m } from '../lib.mjs';
import { subjects } from './mx.mjs';
const [id, pat] = process.argv.slice(2);
const s = subjects((s) => s.id === id)[0], d = m.Document.openDocument(s.bytes(), 'application/pdf'), p = d.loadPage(0), st = p.toStructuredText('preserve-whitespace');
let chars = []; const lines = [];
st.walk({ beginLine() { chars = []; }, onChar(c) { chars.push(c); }, endLine() { lines.push(chars.join('')); } });
for (const l of lines) { const n = l.normalize('NFKC'); if (new RegExp(pat).test(n)) console.log(JSON.stringify(l), '| NFKC:', JSON.stringify(n), [...l].map((c) => c.codePointAt(0).toString(16)).join(' ').slice(0, 200)); }
