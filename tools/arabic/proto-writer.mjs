// PROTOTYPE of the proposed fix (not app code): the HarfBuzz line writer of ownfont.ts with (1) a corrected bidi run split
// (Arabic-Indic / Persian digits are numbers, not Arabic letters; base direction from the first LETTER), (2) a font fallback
// chain per line (Tajawal -> Noto Naskh -> Noto Sans Arabic) and (3) an optional whole-line /ActualText in logical order.
// -> tests/fixtures/arabic-create/proto.pdf (page 0: no ActualText, page 1: with ActualText)
import fs from 'node:fs'; import path from 'node:path';
import { m, hb, T, OUT, fontBytes, writeOut, outline } from './lib.mjs';
import { shaper } from '../../src/lib/engine/ownfont.ts';
import { toUnicode } from '../../src/lib/engine/textpage.ts';

const isMark = (c) => (c >= 0x64b && c <= 0x65f) || c === 0x670;
const isDigit = (c) => (c >= 0x30 && c <= 0x39) || (c >= 0x660 && c <= 0x669) || (c >= 0x6f0 && c <= 0x6f9);
const isAr = (c) => ((c >= 0x600 && c <= 0x6ff) || (c >= 0x750 && c <= 0x77f) || (c >= 0xfb50 && c <= 0xfeff)) && !isDigit(c);
const isLat = (c) => /[A-Za-zÀ-ɏ]/.test(String.fromCodePoint(c)) || isDigit(c);
export function runs(text) {
  const cs = [...text].map((ch) => ch.codePointAt(0));
  const first = cs.find((c) => (isAr(c) && !isMark(c)) || (isLat(c) && !isDigit(c))), rtl = first !== undefined && isAr(first);
  const strong = rtl ? isLat : (c) => isAr(c) && !isMark(c), out = [];
  for (let i = 0; i < cs.length;) {
    if (strong(cs[i])) {
      let j = i + 1, end = i + 1;
      for (; j < cs.length && !(rtl ? isAr(cs[j]) : isLat(cs[j])); j++) if (strong(cs[j]) || isMark(cs[j])) end = j + 1;
      out.push({ rtl: !rtl, cs: cs.slice(i, end) }); i = end;
    } else { let j = i + 1; while (j < cs.length && !strong(cs[j])) j++; out.push({ rtl, cs: cs.slice(i, j) }); i = j; }
  }
  return rtl ? out.reverse() : out;
}
function shape(s, text, size) { // as ownfont.shape, with the corrected runs
  const k = size / s.upem, glyphs = [], missing = new Set(); let x = 0;
  for (const run of runs(text)) {
    const buf = new hb.Buffer(); buf.addCodePoints(run.cs); buf.guessSegmentProperties(); buf.setDirection(run.rtl ? hb.Direction.RTL : hb.Direction.LTR); hb.shape(s.font, buf);
    const out = buf.getGlyphInfosAndPositions(), starts = [...new Set(out.map((g) => g.cluster))].sort((a, b) => a - b), groups = new Map();
    for (const g of out) { const gl = { gid: g.codepoint, x: x + (g.xOffset ?? 0) * k, y: (g.yOffset ?? 0) * k, uni: [], rtl: run.rtl }; x += (g.xAdvance ?? 0) * k; glyphs.push(gl); groups.set(g.cluster, [...(groups.get(g.cluster) ?? []), gl]); }
    for (const [cluster, gs] of groups) {
      const cs = run.cs.slice(cluster, starts[starts.indexOf(cluster) + 1] ?? run.cs.length), read = run.rtl ? [...gs].reverse() : gs;
      read.forEach((g, i) => { g.uni = i < read.length - 1 ? cs.slice(i, i + 1) : cs.slice(i); });
      if (gs.some((g) => g.gid === 0 || !s.font.glyphToPath(g.gid))) for (const c of cs) if (!/\s/.test(String.fromCodePoint(c))) missing.add(String.fromCodePoint(c));
    }
  }
  return { glyphs, width: x, missing: [...missing] };
}
const CHAIN = ['Tajawal-Regular.ttf', 'NotoNaskhArabic-Regular.ttf', 'NotoSansArabic-Regular.ttf'].map((f) => shaper(hb, f, fontBytes(f)));
const hex16 = (cs) => [...String.fromCodePoint(...cs)].flatMap((c) => c.split('')).map((c) => c.charCodeAt(0).toString(16).padStart(4, '0')).join('');

function build(actualText) {
  const doc = new m.PDFDocument(), faces = new Map(), fonts = {}, h = 842, n = (v) => +v.toFixed(2);
  let ops = '';
  const lines = [['pure', T.pure], ['mixed', T.mixed], ['indic', T.indic], ['tashkeel', T.tashkeel], ['lamalef', T.lamalef], ['parens', T.parens], ['persian', T.persian], ['latin', T.latin], ['one', T.one], ['la', 'لا'], ['hijri', '10/05/1448 هـ'], ['date', 'التاريخ: ٢١/١٠/٢٠٢٦']];
  const man = [];
  lines.forEach(([k, text], i) => {
    const s = CHAIN.find((c) => !shape(c, text, 1).missing.length) ?? CHAIN[0], r = shape(s, text, 18), x0 = 535 - r.width, y = 60 + i * 50;
    let face = faces.get(s);
    if (!face) { face = { name: 'P' + faces.size, ref: doc.addFont(new m.Font(s.name, s.bytes)), used: new Map() }; faces.set(s, face); fonts[face.name] = face.ref; }
    let body = `BT /${face.name} 18 Tf 0 0 0 rg `;
    for (const g of r.glyphs) {
      if (!g.gid && g.uni.every((c) => /\s/.test(String.fromCodePoint(c)))) continue;
      const uni = g.rtl && g.uni.length > 1 ? [...g.uni].reverse() : g.uni; if (uni.length && !face.used.has(g.gid)) face.used.set(g.gid, uni);
      body += `1 0 0 1 ${n(x0 + g.x)} ${n(h - y + g.y)} Tm <${g.gid.toString(16).padStart(4, '0')}> Tj `;
    }
    body += 'ET\n';
    ops += actualText ? `/Span <</ActualText <FEFF${hex16([...text].map((c) => c.codePointAt(0)))}>>> BDC ${body}EMC\n` : body;
    man.push({ key: k, text, font: s.name, missing: r.missing });
  });
  for (const f of faces.values()) f.ref.put('ToUnicode', doc.addStream(toUnicode(f.used), {}));
  doc.insertPage(-1, doc.addPage([0, 0, 595, 842], 0, { Font: fonts }, ops));
  return { doc, man };
}
const a = build(false), b = build(true), out = new m.PDFDocument();
out.graftPage(-1, a.doc, 0); out.graftPage(-1, b.doc, 0);
const bytes = out.saveToBuffer('garbage=compact').asUint8Array().slice(); writeOut('proto.pdf', bytes);
fs.writeFileSync(path.join(OUT, 'manifest-proto.json'), JSON.stringify(['plain', 'actualtext'].map((l, i) => ({ writer: 'proto', file: 'proto.pdf', page: i, label: l, expect: a.man.map((x) => x.text) })), null, 1));
console.log(a.man.map((x) => `${x.key}: ${x.font} missing=[${x.missing}]`).join('\n'), '\nproto.pdf', bytes.length);
