// Matrix 2: Sign (spot finding + placing the set) and Redaction (finding phone numbers / e-mails + removing them) on every subject.
// usage: node tools/arabic/matrix/run-sign-redact.mjs [filter]   -> tests/audit-arabic/results/matrix-sign-redact.json
import fs from 'node:fs'; import path from 'node:path';
import { m, fonts, ROOT } from '../lib.mjs';
import { findSpots, placeSet, setEdits, signPdf } from '../../../src/lib/engine/sign.ts';
import { findMatches, redact } from '../../../src/lib/engine/redact.ts';
import { subjects, render, diff, dark, expand, inside, iou, words, pageText, truth, baseMeta, Rows, r1 } from './mx.mjs';

const F = fonts(), photo = new Uint8Array(fs.readFileSync(path.join(ROOT, 'tests/fixtures/signature-photo.png'))), rows = new Rows('sign-redact'), only = process.argv[2] ?? '';
const digits = (s) => s.replace(/[٠-٩۰-۹]/g, (d) => String(d.charCodeAt(0) & 0xf)).replace(/\D/g, '');
const touch = (w, b) => w.x < b.x + b.w && w.x + w.w > b.x && w.y < b.y + b.h && w.y + w.h > b.y;
for (const s of subjects((s) => s.id.includes(only))) {
  const meta = baseMeta(s.doc), bytes = s.bytes(), base = render(bytes, 1.5);
  const hasSign = meta.marks.some((x) => x.role === 'sign'), hasPii = meta.marks.some((x) => x.role === 'pii');
  // ---------------- Sign
  if (hasSign) {
    const d = m.Document.openDocument(bytes, 'application/pdf'), pg = d.loadPage(0);
    let spots = []; try { spots = findSpots(pg, 0); } catch (e) { rows.add('sign', 'find spots', s, false, 'error', String(e.message).slice(0, 80)); }
    pg.destroy(); d.destroy();
    const blanks = truth(s, 'sign'), sign = spots.filter((x) => x.kind === 'sign'), dates = spots.filter((x) => x.kind === 'date');
    if (s.source === 'scan') rows.add('sign', 'find spots', s, 'warn', `${spots.length} spots`, 'picture only: no text, so no automatic spot (the person places the set by hand)');
    else if (blanks) {
      const near = (sp, b) => Math.abs(sp.x + sp.w / 2 - (b.x + b.w / 2)) < Math.max(40, b.w) && Math.abs(sp.y + sp.h / 2 - (b.y + b.h / 2)) < 30;
      const hit = blanks.filter((b) => spots.some((sp) => near(sp, b))).length, extra = sign.filter((sp) => !blanks.some((b) => near(sp, b))).length;
      rows.add('sign', 'find spots (blanks found / extra spots)', s, hit === blanks.length && !extra ? true : hit === blanks.length ? 'warn' : false, `found ${hit}/${blanks.length} blanks, ${extra} extra, ${dates.length} date spots`, extra ? 'extra spot(s) not on a blank' : hit < blanks.length ? 'blank missed' : '');
    } else rows.add('sign', 'find spots', s, 'warn', `${spots.length} spots`, 'geometry changed by the scan: count only');
    let placedAll = 0, onText = 0, offBlank = 0;
    for (const sp of sign) {
      try {
        const set = { ratio: 2.2, name: 'عبدالله محمد', date: '21/10/2026' }, placed = placeSet(set, sp, dates[0]), out = signPdf(m, bytes, [{ page: 0, edits: setEdits(set, placed) }], [photo], () => F);
        const df = diff(base, render(out, 1.5), 25);
        if (!df.n) continue; placedAll++;
        if (dark(base, expand(df.box, -1)) > 0.08) onText++;
        const b = blanks?.find((b) => Math.abs(sp.x + sp.w / 2 - (b.x + b.w / 2)) < Math.max(40, b.w));
        if (b && !(Math.abs(df.cx - (b.x + b.w / 2)) < Math.max(60, b.w) && df.box.y < b.y + b.h + 90 && df.box.y + df.box.h > b.y - 60)) offBlank++;
      } catch (e) { rows.add('sign', 'place the set', s, false, 'error', String(e.message).slice(0, 80)); }
    }
    if (sign.length) rows.add('sign', 'set lands on the blank, clear of text', s, placedAll && !onText && !offBlank ? true : onText ? 'warn' : offBlank ? false : 'warn', `${placedAll}/${sign.length} placed, ${onText} over existing text, ${offBlank} away from the blank`, onText ? 'signature / name / date over existing text' : offBlank ? 'not at the blank' : '');
    if (dates.length && s.doc === 'letter-a4') rows.add('sign', 'date label already filled', s, 'warn', `${dates.length} date spot(s) offered`, 'the date line already has a date: a date spot there would write over it');
  }
  // ---------------- Redaction: phone numbers and e-mails
  if (hasPii && s.source !== 'scan') {
    const d = m.Document.openDocument(bytes, 'application/pdf'), pg = d.loadPage(0);
    const phone = findMatches(pg, 'phone'), email = findMatches(pg, 'email'); pg.destroy(); d.destroy();
    const pii = truth(s, 'pii');
    if (pii) {
      const wantP = pii.filter((x) => x.kind === 'phone'), wantE = pii.filter((x) => x.kind === 'email');
      const okP = wantP.every((w) => phone.some((f) => iou(f, w) > 0.3)), okE = wantE.every((w) => email.some((f) => iou(f, w) > 0.3));
      rows.add('redaction', 'find phone + e-mail', s, okP && okE && phone.length <= wantP.length + 1, `phone ${phone.length}/${wantP.length}, e-mail ${email.length}/${wantE.length}`, !okP ? 'phone number not found' : !okE ? 'e-mail not found' : phone.length > wantP.length + 1 ? 'extra phone matches' : '');
    }
    const marks = [...phone, ...email].map((b) => ({ page: 0, ...b }));
    if (marks.length) {
      try {
        const out = redact(m, bytes, marks), after = render(out, 1.5), txt = pageText(out);
        const num = pii?.filter((x) => x.kind === 'phone')[0]?.text, gone = !num || !digits(txt).includes(digits(num));
        const black = marks.every((b) => { const x0 = Math.ceil(b.x * 1.5), y0 = Math.ceil((b.y + b.h * 0.3) * 1.5), x1 = Math.floor((b.x + b.w) * 1.5), y1 = Math.floor((b.y + b.h * 0.7) * 1.5); let n = 0, t = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { t++; if (after.px[y * after.w + x] < 40) n++; } return t && n / t > 0.9; });
        const wb = words(bytes), wa = words(out), outside = (w) => !marks.some((b) => touch(w, b)), kept = wa.filter(outside).length / (wb.filter(outside).length || 1);
        rows.add('redaction', 'text gone, box black, neighbours kept', s, gone && black && kept > 0.98, `text gone ${gone}, black ${black}, neighbouring words kept ${r1(kept * 100)}%`, !gone ? 'text still in the file' : !black ? 'box not black' : kept <= 0.98 ? 'neighbouring text lost' : '');
      } catch (e) { rows.add('redaction', 'text gone, box black, neighbours kept', s, false, 'error', String(e.message).slice(0, 80)); }
    } else rows.add('redaction', 'find phone + e-mail', s, s.source === 'variant' ? false : 'warn', 'nothing found', s.source === 'hybrid' ? 'the OCR text layer has no readable number / address' : 'none found');
  }
  // scans (picture only): the person draws a box over the number; the picture pixels there must be black afterwards
  if (hasPii && s.source === 'scan') {
    const pii = truth(s, 'pii');
    if (pii?.length) {
      try {
        const b = pii[0], out = redact(m, bytes, [{ page: 0, x: b.x, y: b.y, w: b.w, h: b.h }]), after = render(out, 1.5), df = diff(base, after, 30);
        let n = 0, t = 0; for (let y = Math.ceil(b.y * 1.5); y < Math.floor((b.y + b.h) * 1.5); y++) for (let x = Math.ceil(b.x * 1.5); x < Math.floor((b.x + b.w) * 1.5); x++) { t++; if (after.px[y * after.w + x] < 40) n++; }
        const outsideBox = df.n && !inside(df.box, expand(b, 4));
        rows.add('redaction', 'drawn box over a scan: black, nothing else changed', s, n / t > 0.9 && !outsideBox, `black ${r1((100 * n) / t)}%, other pixels changed ${!!outsideBox}`, n / t <= 0.9 ? 'box not black' : outsideBox ? 'pixels outside the box changed' : '');
      } catch (e) { rows.add('redaction', 'drawn box over a scan', s, false, 'error', String(e.message).slice(0, 80)); }
    }
  }
}
rows.save();
