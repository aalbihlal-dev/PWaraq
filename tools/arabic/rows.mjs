// The audit's result table: one row per writer x scenario with what MuPDF, pdf.js and Edge (PDFium) show / copy.
// Verdicts come from the images in screenshots/arabic-audit and the text checks in tests/audit-arabic/results (tools/arabic/check.mjs).
// usage: node tools/arabic/rows.mjs  -> tests/audit-arabic/results/rows.json + rows.md (the table pasted into the report)
import fs from 'node:fs'; import path from 'node:path';
import { ROOT } from './lib.mjs';
const OK = '✅', WARN = '⚠️', BAD = '❌', NA = '—';
const rows = [];
let id = 0;
/** r(writer, scenario, mupdf, pdfjs, edge, evidence, note): consumer cells are OK / WARN / BAD / NA */
const r = (writer, scen, mu, js, ed, ev = '', note = '') => rows.push({ n: ++id, writer, scen, mu, js, ed, ev, note, all: [mu, js, ed].includes(BAD) ? BAD : [mu, js, ed].includes(WARN) ? WARN : [mu, js, ed].every((x) => x === NA) ? NA : OK });
const all = (w, s, v, ev, note) => r(w, s, v, v, v, ev, note);

const E = 'editor', C = 'comment', F = 'forms', S = 'sign', M = 'marks', P = 'portfolio', O = 'ocr', X = 'meta';
// 1 page editor: add text
const W1 = '1 Page editor: add text';
r(W1, 'pure Arabic', OK, OK, OK, 'editor/sheet-p00.png');
r(W1, 'Arabic + Latin + Western digits (copy / search)', WARN, OK, OK, 'editor/sheet-p00.png', 'draws right; MuPDF (Waraq search) reads the line in visual order: "ريال1,250.50 بمبلغ…"');
all(W1, 'Arabic-Indic digits ٠١٢٣…', BAD, 'editor/sheet-p00.png', 'digits drawn and stored reversed (٩٨٧…٠); MuPDF copy only looks right because it reverses again');
all(W1, 'tashkeel (harakat)', BAD, 'editor/sheet-p00.png', 'all marks dropped from the picture and from the text');
all(W1, 'lam-alef ligatures inside a line', OK, 'editor/sheet-p00.png');
r(W1, 'lone word لا / لأ on its own line (copy)', BAD, OK, WARN, 'lam/sheet-p00.png', 'MuPDF reads "ال", "أل"; Edge joins two short lines');
r(W1, 'brackets, «», %, ؟ (copy)', WARN, OK, OK, 'editor/sheet-p00.png', 'drawn right; MuPDF copy order of punctuation wrong');
all(W1, 'Persian letters پ چ ژ گ', BAD, 'editor/sheet-p00.png', 'Tajawal has no such letters: boxes');
r(W1, 'long text that wraps', OK, OK, WARN, 'editor/sheet-p01.png', 'Edge copy: last letter of a line moves to the next line ("أ|ن")');
all(W1, 'very long single word (breaks between letters)', OK, 'editor/sheet-p01.png');
all(W1, 'empty / one character', OK, 'editor/sheet-p00.png');
all(W1, 'alignment left / centre / right', OK, 'editor/sheet-p03.png');
all(W1, 'bold', OK, 'editor/sheet-p03.png');
all(W1, 'coloured', OK, 'editor/sheet-p03.png');
all(W1, 'sizes 10 / 16 / 28 / 60 pt', OK, 'editor/sheet-p02.png');
all(W1, 'page rotated 90°', OK, 'editor/sheet-p04.png'); all(W1, 'page rotated 180°', OK, 'editor/sheet-p05.png'); all(W1, 'page rotated 270°', OK, 'editor/sheet-p06.png');
all(W1, 'MediaBox origin ≠ 0 with CropBox', OK, 'editor/sheet-p07.png'); all(W1, 'cropped + rotated 90°', OK, 'editor/sheet-p08.png');
all(W1, 'other page sizes (A3, A5, 300×300)', OK, 'editor/sheet-p09.png');
all(W1, 'fonts embedded and subset', WARN, 'editor/sheet-p00.png', 'embedded with ToUnicode, but both full Tajawal weights per edited page: +114 KB per page (10 pages: +1.1 MB)');
// 2 comments
const W2 = '2 Comment';
all(W2, 'text box: pure Arabic', BAD, 'comment/sheet-p00.png', 'FreeText appearance uses Helvetica: the Arabic is not in the file');
all(W2, 'text box: Arabic + Latin + digits', BAD, 'comment/sheet-p00.png', 'only the Latin / digits show: "INV-2026 1,250.50 21/10/2026"');
all(W2, 'text box: Arabic-Indic digits', BAD, 'comment/sheet-p00.png');
all(W2, 'text box: tashkeel', BAD, 'comment/sheet-p00.png'); all(W2, 'text box: lam-alef', BAD, 'comment/sheet-p00.png');
all(W2, 'text box: punctuation / brackets', BAD, 'comment/sheet-p00.png', 'only the brackets and % show');
all(W2, 'text box: Persian', BAD, 'comment/sheet-p00.png');
all(W2, 'text box: long text, long word', BAD, 'comment/sheet-p01.png'); all(W2, 'text box: colours', BAD, 'comment/sheet-p02.png');
all(W2, 'text box on rotated pages 90/180/270', BAD, 'comment/sheet-p05.png'); all(W2, 'text box on cropped page / other sizes', BAD, 'comment/sheet-p08.png');
all(W2, 'text box: Latin only (control)', OK, 'comment/sheet-p00.png');
all(W2, 'sticky note: note text in /Contents (46 of 46 read back exactly in pdf.js)', OK, 'comment/sheet-p03.png', 'UTF-16BE, shown in the reader popup / comment list');
all(W2, 'sticky note: icon', OK, 'comment/sheet-p03.png'); all(W2, 'highlight carrying a note', OK, 'comment/sheet-p04.png');
// 3 forms
const W3 = '3 Forms';
all(W3, 'one Arabic answer in a text field (fillable)', OK, 'forms-one/sheet-p00.png');
all(W3, 'two or more Arabic answers (fillable)', BAD, 'forms/sheet-p00.png', 'only the LAST answer keeps its Arabic picture; earlier ones are redrawn by MuPDF in Helvetica = empty');
all(W3, 'multiline Arabic answer next to other answers', BAD, 'forms/sheet-p00.png');
all(W3, 'combo box Arabic choice', BAD, 'forms/sheet-p00.png', 'no Arabic picture is written for choices at all');
all(W3, 'list box Arabic choices', BAD, 'forms-na/sheet-p00.png', 'options show as garbage (\'D#HD) in pdf.js');
all(W3, 'flatten (answers baked into the page)', BAD, 'forms-flat/sheet-p00.png', 'even one Arabic answer is lost: baked as "������" (U+FFFD in the text layer)');
all(W3, 'form that has NeedAppearances = true', BAD, 'forms-na/sheet-p00.png', 'readers redraw fields themselves and ignore Waraq\'s appearance');
all(W3, 'Arabic-Indic digits in an answer', BAD, 'proto-forms/sheet-p00.png', 'reversed (٥٤٣٢١)');
all(W3, 'Latin answers in the same form', OK, 'forms/sheet-p00.png');
all(W3, 'field names with Arabic (/T, UTF-16BE)', OK, 'forms/sheet-p00.png', 'read back exactly by listFields');
all(W3, 'checkbox / radio export values', NA, '', 'Waraq only toggles existing ones, writes none');
// 4 sign
const W4 = '4 Sign';
all(W4, 'typed-name line: Arabic name + date', OK, 'sign/gallery.png');
all(W4, 'name with Latin + digits', OK, 'sign/gallery.png');
all(W4, 'long Arabic name (50 letters)', BAD, 'sign/sheet-p03.png', 'wraps to a second line that runs over the date');
all(W4, 'name with tashkeel', BAD, 'sign/gallery.png'); all(W4, 'name with Persian letters', BAD, 'sign/gallery.png'); all(W4, 'name with Arabic-Indic digits', BAD, 'sign/gallery.png');
all(W4, 'dates: Gregorian numeric / long / ISO, ar + en', OK, 'sign/gallery.png', 'Western digits only: there is no Arabic-Indic option');
all(W4, 'dates: Hijri (Umm al-Qura) numeric / long / ISO', OK, 'sign/gallery.png', 'e.g. "10 جمادى الأولى 1448 هـ"');
all(W4, 'rotated pages 90/180/270, cropped page, A5', OK, 'sign/sheet-p10.png');
r(W4, 'typed signature (canvas picture)', NA, NA, WARN, 'sign/typed-signature-canvas.png', 'shapes right; base direction is LTR so "محمد Al-Ahmad ٢٠٢٦" is ordered wrong; long names are squeezed; Arabic is slanted (synthetic italic)');
all(W4, 'visible digital-signature appearance with Arabic name + date', OK, 'sign-cert/gallery.png');
all(W4, 'signature dictionary Name / Reason / Location (UTF-16BE)', OK, '', 'read back exactly by MuPDF');
all(W4, 'file size of a signed page', WARN, '', '286 KB per signed page (photo + both full fonts)');
// 5 watermark + numbers
const W5 = '5 Watermark and page numbers';
all(W5, 'watermark: pure Arabic, 45°', OK, 'marks-wm0/grid-wm0-wm2.png');
r(W5, 'watermark: Arabic + Latin + digits (copy)', BAD, BAD, NA, 'marks-wm1/grid-mupdf.png', 'drawn right, but copy / search returns "Draft 2026 — مسودة" (visual order)');
all(W5, 'watermark: tashkeel', BAD, 'marks-wm0/grid-wm0-wm2.png');
all(W5, 'watermark: Arabic-Indic digits', BAD, 'marks-wm3/grid-mupdf.png', 'reads back as ٦٢٠٢ in pdf.js');
all(W5, 'watermark: long sentence shrinks to the page', OK, 'marks-wm5/grid-mupdf.png'); all(W5, 'watermark: one letter', OK, 'marks-wm6/grid-mupdf.png');
all(W5, 'watermark: colour + opacity', OK, 'marks-wm0/grid-wm0-wm2.png');
all(W5, 'watermark on rotated / cropped / A3 / A5 pages', OK, 'marks-wm0/grid-wm0-wm2.png');
all(W5, 'page numbers "n / N" in all 6 positions, rotated + cropped pages', OK, 'marks-num-bl/grid-num.png');
all(W5, 'page numbers: Arabic-Indic digits option', NA, '', 'missing feature: Western digits only');
all(W5, 'page numbers in an RTL document (start side)', WARN, 'marks-num-bl/grid-num.png', 'positions are not mirrored; 10 pt fixed at any page size');
all(W5, 'repeated / tiled watermark, header text', NA, '', 'not offered');
// 6 portfolio
const W6 = '6 Portfolio';
all(W6, 'cover: 8 designs, RTL, Arabic title wraps', OK, 'portfolio/grid-mupdf.png');
all(W6, 'cover: subtitle with Arabic-Indic year', BAD, 'portfolio/zoom-cover.png', '٢٠٢٦ is drawn ٦٢٠٢');
all(W6, 'cover: names with Persian letters', BAD, 'portfolio/zoom-cover.png'); all(W6, 'cover: tashkeel title', BAD, 'portfolio/grid-misc.png');
all(W6, 'cover: 150-letter Arabic title', OK, 'portfolio/grid-misc.png'); all(W6, 'cover: 200-letter Latin title', OK, 'portfolio/grid-misc.png');
all(W6, 'cover: very long subtitle / names / supervisor', BAD, 'portfolio/grid-misc.png', 'single-line text shrinks to about 3 pt: unreadable');
all(W6, 'divider pages: 8 designs, RTL', OK, 'portfolio/grid-misc.png'); all(W6, 'divider: 150-letter title and note', OK, 'portfolio/grid-misc.png');
all(W6, 'contents: RTL, Arabic titles, dotted leaders, links', OK, 'portfolio/grid-misc.png'); all(W6, 'contents: LTR with Arabic titles', OK, 'portfolio/grid-misc.png');
all(W6, 'contents: very long entry', WARN, 'portfolio/grid-misc.png', 'shrinks to 7.5 pt');
all(W6, 'paper pages (plain, lined, grid, dotted)', OK, 'portfolio/grid-misc.png', 'no text'); all(W6, 'covers on A3 / A5 / landscape', OK, 'portfolio/grid-misc.png');
all(W6, 'bookmarks with Arabic titles (UTF-16BE)', OK, '', '5 of 5 read back exactly by MuPDF');
// 7 redaction, 8 organize/convert
all('7 Redaction', 'label or overlay text', NA, '', 'none is written (black box only)');
all('8 Organize / Convert', 'page labels, text outputs', NA, '', 'none are written');
// 9 OCR
const W9 = '9 OCR text layer';
all(W9, 'pure Arabic words', OK, 'ocr-visible/sheet-p00.png');
all(W9, 'Arabic + Latin / numbers in one line', WARN, '', 'MuPDF joins the words: "بتاريخINV-2026"');
all(W9, 'Arabic-Indic digits', BAD, '', 'stored reversed');
all(W9, 'tashkeel', BAD, '', 'dropped');
all(W9, 'lone word لا', BAD, '', 'MuPDF reads "ال"');
all(W9, 'word boxes line up with the printed boxes', NA, 'ocr-visible/sheet-p00.png', 'not judged: my synthetic boxes are equal-width, real Tesseract boxes needed (the OCR audit covers it)');
// 10 metadata
const W10 = '10 Metadata, bookmarks, names';
all(W10, 'Title / Author / Subject with Arabic', BAD, '', 'never written: no /Info, no XMP, no /Lang, no DisplayDocTitle (readers show the file name)');
all(W10, 'encoding if it were written (MuPDF setMetaData)', OK, '', 'UTF-16BE');
all(W10, 'file names with Arabic inside .waraq / ZIP', OK, '', 'Python zipfile and PowerShell Expand-Archive read them; Windows tar.exe cannot (locale)');

for (const x of rows) if (x.ev && !fs.existsSync(path.resolve(ROOT, '../Archive-2026-10-12/screenshots/arabic-audit', x.ev))) console.log('MISSING evidence', x.n, x.ev);
fs.mkdirSync(path.join(ROOT, 'tests/audit-arabic/results'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'tests/audit-arabic/results/rows.json'), JSON.stringify(rows, null, 1));
let md = '| # | Writer | Scenario | MuPDF | pdf.js | Edge (PDFium) | Result | Thumbnail / note |\n|---|---|---|---|---|---|---|---|\n';
for (const x of rows) md += `| ${x.n} | ${x.writer} | ${x.scen} | ${x.mu} | ${x.js} | ${x.ed} | ${x.all} | ${[x.ev && '`' + x.ev + '`', x.note].filter(Boolean).join(' — ')} |\n`;
fs.writeFileSync(path.join(ROOT, 'tests/audit-arabic/results/rows.md'), md);
const t = { total: rows.length }; for (const x of rows) t[x.all] = (t[x.all] ?? 0) + 1; console.log(t);
const per = {}; for (const x of rows) { per[x.writer] ??= { [OK]: 0, [WARN]: 0, [BAD]: 0, [NA]: 0 }; per[x.writer][x.all]++; } console.log(per);
