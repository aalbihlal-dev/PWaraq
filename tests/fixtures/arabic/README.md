# Arabic editing corpus

The same Arabic paragraphs (`texts.mjs`: a formal letter, a bilingual invoice with Latin names and Western + Arabic-Indic
digits, a line with full tashkeel, a table, mixed RTL/LTR with punctuation and parentheses, lam-alef ligatures, a long
justified paragraph, bold, italic, coloured, 8 pt and 28 pt lines) written by many producers in many fonts, so the page
editor can be tested against files as users really have them. Generated locally; no customer files.

| Prefix | Producer | How the text is stored | Made by |
|---|---|---|---|
| `edge-*` | Microsoft Edge print-to-PDF (Skia / PDFium) | Type0 / CIDFontType2 subsets with ToUnicode; variable fonts and CFF fonts become **Type3**; Latin digits fall into Times New Roman | `node tools/arabic/make-corpus.mjs edge` — Windows fonts by name (Arial, Tahoma, Segoe UI, Times New Roman, Traditional Arabic, Simplified Arabic, Sakkal Majalla, Courier New, Calibri, Arabic Typesetting, Dubai, Andalus, Aldhabi, Arial Unicode MS) and OFL fonts fetched to a temp folder (Tajawal, Noto Naskh / Sans / Kufi Arabic, Amiri, Cairo, Scheherazade New, Lateef, Harmattan, Markazi Text, Noto Naskh Arabic OTF) |
| `word-*` | Microsoft Word "Save as PDF" (COM) | Type0 / CIDFontType2 subsets with ToUnicode; Word puts the digits in Times New Roman and a Cambria space at line starts | `tools/arabic/make-corpus.py word` (python-docx + pywin32). Word substituted Calibri for "Traditional Arabic" and "Simplified Arabic", so those two files were dropped (Edge and LibreOffice cover both fonts) |
| `libreoffice-*` | LibreOffice headless (the Office add-on pack) | **simple 8-bit TrueType** subsets, no Unicode cmap | `tools/arabic/make-corpus.py libreoffice` writes `.fodt`; convert with `soffice --headless --convert-to pdf` |
| `mupdf-story-*` | MuPDF's own HTML layout (PyMuPDF Story), then `subsetFonts()` for the two big ones | Type0 full font / MuPDF subset without a cmap | `tools/arabic/make-corpus.py story` |
| `waraq-*` | Waraq's own writers (`textpage.ts` pageWriter, `ownfont.ts` shapedWriter) | glyph ids + own ToUnicode: Tajawal presentation forms; Noto Naskh HarfBuzz subset (like Word); Lateef full; Noto Naskh **CFF/OpenType**; a copy **without ToUnicode** | `node tools/arabic/make-corpus.mjs own` |
| `cadlike-*` | hand-built like CAD / old exporters | each glyph placed on its own, left to right, ToUnicode pointing at **presentation forms** | same |
| `real/*` (git-ignored) | single pages of the public PDFs that `tools/get-ocr-set.mjs` downloads (CMA circular, CMA fund terms, GASTAT annual report, MoJ monthly) | Type1C (CFF) fonts without ToUnicode, DIN Next / Neo Sans Type0 subsets | `node tools/arabic/make-corpus.mjs real` after `node tools/get-ocr-set.mjs` — URLs in that script; the licence of these documents is not stated, so they are not committed |





## Second and third axes: document types, arrangements, scans (owner, 21 Oct 2026)

`tags.json` carries one record per file: `type`, `arrangement` (list), `size`, `fonts`, `source` (`digital`, `flatbed`,
`phone-photo`, …), `dpi`, and `lines` (the paragraphs the page carries, the truth for the lift check). The audit report
slices its results by these tags (`tools/arabic/report.mjs` → `slices.md`).

- `type-*.pdf` — `node tools/arabic/make-corpus-types.mjs`: 23 document types / arrangements printed by Edge in 1–3 fonts
  each (circular with logo and stamp, US-Letter circular, tax invoice, 80 mm receipt, contract with أ/ب/ج sub-clauses,
  form with boxes, landscape financial statement, 3-column newspaper, 2-column magazine, A5 book page with footnotes,
  2-column paper with bilingual abstract, 16:9 slides, certificate, poster, menu, timetable with rotated headers and a
  merged cell, CAD sheet with title block and 90° labels, LTR page with Arabic inside, RTL page with English inside,
  poetry with full tashkeel, watermark + stamp over text, floating/rotated text boxes, mixed fonts in one line) and the
  CAD-like visual-order file turned 90° (`/Rotate 90`).
- `scans/*.pdf` (+ `.txt` with the page's real text, for the OCR audit) — `node tools/arabic/make-scans.mjs` then
  `python tools/arabic/shrink-scans.py` (JPEG q60): flatbed 150/200/300 dpi, phone photo (keystone + shadow + uneven
  light), curved book spine, skew 2° and −5°, faded, photocopy of a photocopy, 1-bit, pen strokes over text,
  bleed-through, JPEG artefacts, sideways sheet, colour scan on tinted paper, a 3-page mixed file (text / scan / text) and
  two hybrids with an OCR layer (right; every 6th word wrong). The effects are the ones of `tests/fixtures/ocr/scan-fx.mjs`
  (shared with the OCR set); only the colour, mixed and hybrid builds live in `make-scans.mjs`.

| File | Type | Arrangement | Size | Fonts | Source |
|---|---|---|---|---|---|
| `type-letter-circular.pdf` | letter-circular | single-column, right-aligned, header-footer, logo, stamp | A4 | Traditional Arabic, Arial | digital |
| `type-letter-circular-usletter.pdf` | letter-circular | single-column, justified, us-letter | Letter | Simplified Arabic | digital |
| `type-invoice.pdf` | invoice | table, merged-cells, mixed-digits, small-print | A4 | Tahoma, Arial | digital |
| `type-receipt-long.pdf` | receipt | single-column, long-receipt, monospace, small-print | 80mm x 200mm | Courier New | digital |
| `type-contract-clauses.pdf` | contract | numbered-clauses, nested-list, justified, arabic-indic-numbering | A4 | Simplified Arabic, Times New Roman | digital |
| `type-form-boxes.pdf` | form | table, boxes, checkboxes, dotted-lines | A4 | Arial | digital |
| `type-financial-landscape.pdf` | financial-statement | table, landscape, figures, negative-brackets, western-digits | A4 landscape | Calibri | digital |
| `type-newspaper-3col.pdf` | newspaper | three-columns, big-headline, caption, photo, decorative-font | A4 | Sakkal Majalla, Arabic Typesetting | digital |
| `type-magazine-2col.pdf` | magazine | two-columns, pull-quote, text-on-colour, photo | A4 | Dubai | digital |
| `type-book-a5.pdf` | book | single-column, a5, header-footer, footnotes, page-number, latin-references | A5 | Amiri, Times New Roman | digital |
| `type-academic-paper.pdf` | academic-paper | two-columns, bilingual-abstract, latin-references, header-footer | A4 | Times New Roman | digital |
| `type-slides-16x9.pdf` | slides | landscape, big-title, bullets, text-on-colour | 16:9 | Segoe UI | digital |
| `type-certificate.pdf` | certificate | landscape, centred, display-text, decorative-font, logo, stamp | A4 landscape | Andalus, Aldhabi | digital |
| `type-poster-display.pdf` | poster | display-text, text-on-colour, centred, huge | A4 | Noto Kufi Arabic, Cairo | digital |
| `type-menu-prices.pdf` | menu | two-column-table, leaders, arabic-indic-prices | A5 | Dubai | digital |
| `type-timetable.pdf` | timetable | table, merged-cells, rotated-header, rtl-column-order | A4 landscape | Tahoma | digital |
| `type-technical-cad.pdf` | technical-drawing | title-block, rotated-text, small-print, latin-dimensions, landscape | A4 landscape | Arial | digital |
| `type-bilingual-en-page.pdf` | bilingual | ltr-page, arabic-inside-ltr, single-column | A4 | Calibri | digital |
| `type-bilingual-ar-page.pdf` | bilingual | rtl-page, english-inside-rtl, left-aligned-ltr-box | A4 | Calibri | digital |
| `type-poetry-tashkeel.pdf` | poetry | two-hemistich-columns, full-tashkeel, centred | A4 | Amiri, Scheherazade New, Traditional Arabic | digital |
| `type-watermark-stamp.pdf` | stamped | watermark-behind, logo-behind, stamp-over, single-column | A4 | Arial | digital |
| `type-textboxes-rotated.pdf` | text-boxes | text-boxes, rotated-90, centred, left-aligned-ltr-box | A4 | Segoe UI | digital |
| `type-mixed-fonts-line.pdf` | mixed-fonts | mixed-fonts-per-line, single-column | A4 | Traditional Arabic, Arial, Times New Roman | digital |
| `type-cadlike-rotated90.pdf` | technical-drawing | rotated-page-90, visual-order, presentation-forms | A4 rotated | Tajawal | digital |
| `scans/flatbed-150.pdf` | letter-circular | single-column, right-aligned, header-footer, logo, stamp |  |  | flatbed 150 dpi — from type-letter-circular.pdf |
| `scans/flatbed-200.pdf` | contract | numbered-clauses, nested-list, justified, arabic-indic-numbering |  |  | flatbed 200 dpi — from type-contract-clauses.pdf |
| `scans/flatbed-300.pdf` | invoice | table, merged-cells, mixed-digits, small-print |  |  | flatbed 300 dpi — from type-invoice.pdf |
| `scans/phone-photo.pdf` | form | table, boxes, checkboxes, dotted-lines |  |  | phone-photo 200 dpi — from type-form-boxes.pdf |
| `scans/book-spine-curve.pdf` | book | single-column, a5, header-footer, footnotes, page-number, latin-references |  |  | book-curved 200 dpi — from type-book-a5.pdf |
| `scans/skew-2deg.pdf` | newspaper | three-columns, big-headline, caption, photo, decorative-font |  |  | skewed 200 dpi — from type-newspaper-3col.pdf |
| `scans/skew-5deg.pdf` | financial-statement | table, landscape, figures, negative-brackets, western-digits |  |  | skewed 150 dpi — from type-financial-landscape.pdf |
| `scans/faded-low-contrast.pdf` | letter-circular | single-column, justified, us-letter |  |  | faded 200 dpi — from type-letter-circular-usletter.pdf |
| `scans/photocopy-of-photocopy.pdf` | contract | numbered-clauses, nested-list, justified, arabic-indic-numbering |  |  | photocopy-x2 200 dpi — from type-contract-clauses.pdf |
| `scans/onebit-bw.pdf` | menu | two-column-table, leaders, arabic-indic-prices |  |  | 1-bit 300 dpi — from type-menu-prices.pdf |
| `scans/stamps-handwriting.pdf` | stamped | watermark-behind, logo-behind, stamp-over, single-column |  |  | marked-up 200 dpi — from type-watermark-stamp.pdf |
| `scans/bleed-through.pdf` | poetry | two-hemistich-columns, full-tashkeel, centred |  |  | bleed-through 200 dpi — from type-poetry-tashkeel.pdf |
| `scans/jpeg-artefacts.pdf` | timetable | table, merged-cells, rotated-header, rtl-column-order |  |  | jpeg 150 dpi — from type-timetable.pdf |
| `scans/sideways-sheet.pdf` | magazine | two-columns, pull-quote, text-on-colour, photo |  |  | turned-90 200 dpi — from type-magazine-2col.pdf |
| `scans/colour-scan-tinted-paper.pdf` | certificate | landscape, centred, display-text, decorative-font, logo, stamp |  |  | colour-scan 150 dpi — from type-certificate.pdf |
| `scans/mixed-text-scan-text.pdf` | letter-circular | single-column, right-aligned, header-footer, logo, stamp |  |  | mixed-pages 200 dpi — from type-letter-circular.pdf |
| `scans/hybrid-ocr-layer-right.pdf` | letter-circular | single-column, right-aligned, header-footer, logo, stamp |  |  | hybrid-ocr-layer 200 dpi — from type-letter-circular.pdf — layer right |
| `scans/hybrid-ocr-layer-wrong.pdf` | academic-paper | two-columns, bilingual-abstract, latin-references, header-footer |  |  | hybrid-ocr-layer 200 dpi — from type-academic-paper.pdf — layer wrong (every 6th word damaged) |

The audit that uses this corpus: `tools/arabic/audit-edit.mjs --all` (engine), `tools/arabic/audit-check.py` (PDFium, qpdf,
PyMuPDF), `tools/arabic/audit-browser.mjs` (pdf.js and a browser reference rendering), `tests/audit-arabic/ui.spec.ts`
(the real page editor in Edge), `tools/arabic/report.mjs` (the table). Report: `../Archive-2026-10-12/reviews/ARABIC-EDIT-AUDIT-2026-10-21.md`.
