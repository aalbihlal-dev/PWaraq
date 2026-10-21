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




The audit that uses this corpus: `tools/arabic/audit-edit.mjs --all` (engine), `tools/arabic/audit-check.py` (PDFium, qpdf,
PyMuPDF), `tools/arabic/audit-browser.mjs` (pdf.js and a browser reference rendering), `tests/audit-arabic/ui.spec.ts`
(the real page editor in Edge), `tools/arabic/report.mjs` (the table). Report: `../Archive-2026-10-12/reviews/ARABIC-EDIT-AUDIT-2026-10-21.md`.
