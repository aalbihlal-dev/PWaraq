| # | Writer | Scenario | MuPDF | pdf.js | Edge (PDFium) | Result | Thumbnail / note |
|---|---|---|---|---|---|---|---|
| 1 | 1 Page editor: add text | pure Arabic | ✅ | ✅ | ✅ | ✅ | `editor/sheet-p00.png` |
| 2 | 1 Page editor: add text | Arabic + Latin + Western digits (copy / search) | ⚠️ | ✅ | ✅ | ⚠️ | `editor/sheet-p00.png` — draws right; MuPDF (Waraq search) reads the line in visual order: "ريال1,250.50 بمبلغ…" |
| 3 | 1 Page editor: add text | Arabic-Indic digits ٠١٢٣… | ❌ | ❌ | ❌ | ❌ | `editor/sheet-p00.png` — digits drawn and stored reversed (٩٨٧…٠); MuPDF copy only looks right because it reverses again |
| 4 | 1 Page editor: add text | tashkeel (harakat) | ❌ | ❌ | ❌ | ❌ | `editor/sheet-p00.png` — all marks dropped from the picture and from the text |
| 5 | 1 Page editor: add text | lam-alef ligatures inside a line | ✅ | ✅ | ✅ | ✅ | `editor/sheet-p00.png` |
| 6 | 1 Page editor: add text | lone word لا / لأ on its own line (copy) | ❌ | ✅ | ⚠️ | ❌ | `lam/sheet-p00.png` — MuPDF reads "ال", "أل"; Edge joins two short lines |
| 7 | 1 Page editor: add text | brackets, «», %, ؟ (copy) | ⚠️ | ✅ | ✅ | ⚠️ | `editor/sheet-p00.png` — drawn right; MuPDF copy order of punctuation wrong |
| 8 | 1 Page editor: add text | Persian letters پ چ ژ گ | ❌ | ❌ | ❌ | ❌ | `editor/sheet-p00.png` — Tajawal has no such letters: boxes |
| 9 | 1 Page editor: add text | long text that wraps | ✅ | ✅ | ⚠️ | ⚠️ | `editor/sheet-p01.png` — Edge copy: last letter of a line moves to the next line ("أ|ن") |
| 10 | 1 Page editor: add text | very long single word (breaks between letters) | ✅ | ✅ | ✅ | ✅ | `editor/sheet-p01.png` |
| 11 | 1 Page editor: add text | empty / one character | ✅ | ✅ | ✅ | ✅ | `editor/sheet-p00.png` |
| 12 | 1 Page editor: add text | alignment left / centre / right | ✅ | ✅ | ✅ | ✅ | `editor/sheet-p03.png` |
| 13 | 1 Page editor: add text | bold | ✅ | ✅ | ✅ | ✅ | `editor/sheet-p03.png` |
| 14 | 1 Page editor: add text | coloured | ✅ | ✅ | ✅ | ✅ | `editor/sheet-p03.png` |
| 15 | 1 Page editor: add text | sizes 10 / 16 / 28 / 60 pt | ✅ | ✅ | ✅ | ✅ | `editor/sheet-p02.png` |
| 16 | 1 Page editor: add text | page rotated 90° | ✅ | ✅ | ✅ | ✅ | `editor/sheet-p04.png` |
| 17 | 1 Page editor: add text | page rotated 180° | ✅ | ✅ | ✅ | ✅ | `editor/sheet-p05.png` |
| 18 | 1 Page editor: add text | page rotated 270° | ✅ | ✅ | ✅ | ✅ | `editor/sheet-p06.png` |
| 19 | 1 Page editor: add text | MediaBox origin ≠ 0 with CropBox | ✅ | ✅ | ✅ | ✅ | `editor/sheet-p07.png` |
| 20 | 1 Page editor: add text | cropped + rotated 90° | ✅ | ✅ | ✅ | ✅ | `editor/sheet-p08.png` |
| 21 | 1 Page editor: add text | other page sizes (A3, A5, 300×300) | ✅ | ✅ | ✅ | ✅ | `editor/sheet-p09.png` |
| 22 | 1 Page editor: add text | fonts embedded and subset | ⚠️ | ⚠️ | ⚠️ | ⚠️ | `editor/sheet-p00.png` — embedded with ToUnicode, but both full Tajawal weights per edited page: +114 KB per page (10 pages: +1.1 MB) |
| 23 | 2 Comment | text box: pure Arabic | ❌ | ❌ | ❌ | ❌ | `comment/sheet-p00.png` — FreeText appearance uses Helvetica: the Arabic is not in the file |
| 24 | 2 Comment | text box: Arabic + Latin + digits | ❌ | ❌ | ❌ | ❌ | `comment/sheet-p00.png` — only the Latin / digits show: "INV-2026 1,250.50 21/10/2026" |
| 25 | 2 Comment | text box: Arabic-Indic digits | ❌ | ❌ | ❌ | ❌ | `comment/sheet-p00.png` |
| 26 | 2 Comment | text box: tashkeel | ❌ | ❌ | ❌ | ❌ | `comment/sheet-p00.png` |
| 27 | 2 Comment | text box: lam-alef | ❌ | ❌ | ❌ | ❌ | `comment/sheet-p00.png` |
| 28 | 2 Comment | text box: punctuation / brackets | ❌ | ❌ | ❌ | ❌ | `comment/sheet-p00.png` — only the brackets and % show |
| 29 | 2 Comment | text box: Persian | ❌ | ❌ | ❌ | ❌ | `comment/sheet-p00.png` |
| 30 | 2 Comment | text box: long text, long word | ❌ | ❌ | ❌ | ❌ | `comment/sheet-p01.png` |
| 31 | 2 Comment | text box: colours | ❌ | ❌ | ❌ | ❌ | `comment/sheet-p02.png` |
| 32 | 2 Comment | text box on rotated pages 90/180/270 | ❌ | ❌ | ❌ | ❌ | `comment/sheet-p05.png` |
| 33 | 2 Comment | text box on cropped page / other sizes | ❌ | ❌ | ❌ | ❌ | `comment/sheet-p08.png` |
| 34 | 2 Comment | text box: Latin only (control) | ✅ | ✅ | ✅ | ✅ | `comment/sheet-p00.png` |
| 35 | 2 Comment | sticky note: note text in /Contents (46 of 46 read back exactly in pdf.js) | ✅ | ✅ | ✅ | ✅ | `comment/sheet-p03.png` — UTF-16BE, shown in the reader popup / comment list |
| 36 | 2 Comment | sticky note: icon | ✅ | ✅ | ✅ | ✅ | `comment/sheet-p03.png` |
| 37 | 2 Comment | highlight carrying a note | ✅ | ✅ | ✅ | ✅ | `comment/sheet-p04.png` |
| 38 | 3 Forms | one Arabic answer in a text field (fillable) | ✅ | ✅ | ✅ | ✅ | `forms-one/sheet-p00.png` |
| 39 | 3 Forms | two or more Arabic answers (fillable) | ❌ | ❌ | ❌ | ❌ | `forms/sheet-p00.png` — only the LAST answer keeps its Arabic picture; earlier ones are redrawn by MuPDF in Helvetica = empty |
| 40 | 3 Forms | multiline Arabic answer next to other answers | ❌ | ❌ | ❌ | ❌ | `forms/sheet-p00.png` |
| 41 | 3 Forms | combo box Arabic choice | ❌ | ❌ | ❌ | ❌ | `forms/sheet-p00.png` — no Arabic picture is written for choices at all |
| 42 | 3 Forms | list box Arabic choices | ❌ | ❌ | ❌ | ❌ | `forms-na/sheet-p00.png` — options show as garbage ('D#HD) in pdf.js |
| 43 | 3 Forms | flatten (answers baked into the page) | ❌ | ❌ | ❌ | ❌ | `forms-flat/sheet-p00.png` — even one Arabic answer is lost: baked as "������" (U+FFFD in the text layer) |
| 44 | 3 Forms | form that has NeedAppearances = true | ❌ | ❌ | ❌ | ❌ | `forms-na/sheet-p00.png` — readers redraw fields themselves and ignore Waraq's appearance |
| 45 | 3 Forms | Arabic-Indic digits in an answer | ❌ | ❌ | ❌ | ❌ | `proto-forms/sheet-p00.png` — reversed (٥٤٣٢١) |
| 46 | 3 Forms | Latin answers in the same form | ✅ | ✅ | ✅ | ✅ | `forms/sheet-p00.png` |
| 47 | 3 Forms | field names with Arabic (/T, UTF-16BE) | ✅ | ✅ | ✅ | ✅ | `forms/sheet-p00.png` — read back exactly by listFields |
| 48 | 3 Forms | checkbox / radio export values | — | — | — | — | Waraq only toggles existing ones, writes none |
| 49 | 4 Sign | typed-name line: Arabic name + date | ✅ | ✅ | ✅ | ✅ | `sign/gallery.png` |
| 50 | 4 Sign | name with Latin + digits | ✅ | ✅ | ✅ | ✅ | `sign/gallery.png` |
| 51 | 4 Sign | long Arabic name (50 letters) | ❌ | ❌ | ❌ | ❌ | `sign/sheet-p03.png` — wraps to a second line that runs over the date |
| 52 | 4 Sign | name with tashkeel | ❌ | ❌ | ❌ | ❌ | `sign/gallery.png` |
| 53 | 4 Sign | name with Persian letters | ❌ | ❌ | ❌ | ❌ | `sign/gallery.png` |
| 54 | 4 Sign | name with Arabic-Indic digits | ❌ | ❌ | ❌ | ❌ | `sign/gallery.png` |
| 55 | 4 Sign | dates: Gregorian numeric / long / ISO, ar + en | ✅ | ✅ | ✅ | ✅ | `sign/gallery.png` — Western digits only: there is no Arabic-Indic option |
| 56 | 4 Sign | dates: Hijri (Umm al-Qura) numeric / long / ISO | ✅ | ✅ | ✅ | ✅ | `sign/gallery.png` — e.g. "10 جمادى الأولى 1448 هـ" |
| 57 | 4 Sign | rotated pages 90/180/270, cropped page, A5 | ✅ | ✅ | ✅ | ✅ | `sign/sheet-p10.png` |
| 58 | 4 Sign | typed signature (canvas picture) | — | — | ⚠️ | ⚠️ | `sign/typed-signature-canvas.png` — shapes right; base direction is LTR so "محمد Al-Ahmad ٢٠٢٦" is ordered wrong; long names are squeezed; Arabic is slanted (synthetic italic) |
| 59 | 4 Sign | visible digital-signature appearance with Arabic name + date | ✅ | ✅ | ✅ | ✅ | `sign-cert/gallery.png` |
| 60 | 4 Sign | signature dictionary Name / Reason / Location (UTF-16BE) | ✅ | ✅ | ✅ | ✅ | read back exactly by MuPDF |
| 61 | 4 Sign | file size of a signed page | ⚠️ | ⚠️ | ⚠️ | ⚠️ | 286 KB per signed page (photo + both full fonts) |
| 62 | 5 Watermark and page numbers | watermark: pure Arabic, 45° | ✅ | ✅ | ✅ | ✅ | `marks-wm0/grid-wm0-wm2.png` |
| 63 | 5 Watermark and page numbers | watermark: Arabic + Latin + digits (copy) | ❌ | ❌ | — | ❌ | `marks-wm1/grid-mupdf.png` — drawn right, but copy / search returns "Draft 2026 — مسودة" (visual order) |
| 64 | 5 Watermark and page numbers | watermark: tashkeel | ❌ | ❌ | ❌ | ❌ | `marks-wm0/grid-wm0-wm2.png` |
| 65 | 5 Watermark and page numbers | watermark: Arabic-Indic digits | ❌ | ❌ | ❌ | ❌ | `marks-wm3/grid-mupdf.png` — reads back as ٦٢٠٢ in pdf.js |
| 66 | 5 Watermark and page numbers | watermark: long sentence shrinks to the page | ✅ | ✅ | ✅ | ✅ | `marks-wm5/grid-mupdf.png` |
| 67 | 5 Watermark and page numbers | watermark: one letter | ✅ | ✅ | ✅ | ✅ | `marks-wm6/grid-mupdf.png` |
| 68 | 5 Watermark and page numbers | watermark: colour + opacity | ✅ | ✅ | ✅ | ✅ | `marks-wm0/grid-wm0-wm2.png` |
| 69 | 5 Watermark and page numbers | watermark on rotated / cropped / A3 / A5 pages | ✅ | ✅ | ✅ | ✅ | `marks-wm0/grid-wm0-wm2.png` |
| 70 | 5 Watermark and page numbers | page numbers "n / N" in all 6 positions, rotated + cropped pages | ✅ | ✅ | ✅ | ✅ | `marks-num-bl/grid-num.png` |
| 71 | 5 Watermark and page numbers | page numbers: Arabic-Indic digits option | — | — | — | — | missing feature: Western digits only |
| 72 | 5 Watermark and page numbers | page numbers in an RTL document (start side) | ⚠️ | ⚠️ | ⚠️ | ⚠️ | `marks-num-bl/grid-num.png` — positions are not mirrored; 10 pt fixed at any page size |
| 73 | 5 Watermark and page numbers | repeated / tiled watermark, header text | — | — | — | — | not offered |
| 74 | 6 Portfolio | cover: 8 designs, RTL, Arabic title wraps | ✅ | ✅ | ✅ | ✅ | `portfolio/grid-mupdf.png` |
| 75 | 6 Portfolio | cover: subtitle with Arabic-Indic year | ❌ | ❌ | ❌ | ❌ | `portfolio/zoom-cover.png` — ٢٠٢٦ is drawn ٦٢٠٢ |
| 76 | 6 Portfolio | cover: names with Persian letters | ❌ | ❌ | ❌ | ❌ | `portfolio/zoom-cover.png` |
| 77 | 6 Portfolio | cover: tashkeel title | ❌ | ❌ | ❌ | ❌ | `portfolio/grid-misc.png` |
| 78 | 6 Portfolio | cover: 150-letter Arabic title | ✅ | ✅ | ✅ | ✅ | `portfolio/grid-misc.png` |
| 79 | 6 Portfolio | cover: 200-letter Latin title | ✅ | ✅ | ✅ | ✅ | `portfolio/grid-misc.png` |
| 80 | 6 Portfolio | cover: very long subtitle / names / supervisor | ❌ | ❌ | ❌ | ❌ | `portfolio/grid-misc.png` — single-line text shrinks to about 3 pt: unreadable |
| 81 | 6 Portfolio | divider pages: 8 designs, RTL | ✅ | ✅ | ✅ | ✅ | `portfolio/grid-misc.png` |
| 82 | 6 Portfolio | divider: 150-letter title and note | ✅ | ✅ | ✅ | ✅ | `portfolio/grid-misc.png` |
| 83 | 6 Portfolio | contents: RTL, Arabic titles, dotted leaders, links | ✅ | ✅ | ✅ | ✅ | `portfolio/grid-misc.png` |
| 84 | 6 Portfolio | contents: LTR with Arabic titles | ✅ | ✅ | ✅ | ✅ | `portfolio/grid-misc.png` |
| 85 | 6 Portfolio | contents: very long entry | ⚠️ | ⚠️ | ⚠️ | ⚠️ | `portfolio/grid-misc.png` — shrinks to 7.5 pt |
| 86 | 6 Portfolio | paper pages (plain, lined, grid, dotted) | ✅ | ✅ | ✅ | ✅ | `portfolio/grid-misc.png` — no text |
| 87 | 6 Portfolio | covers on A3 / A5 / landscape | ✅ | ✅ | ✅ | ✅ | `portfolio/grid-misc.png` |
| 88 | 6 Portfolio | bookmarks with Arabic titles (UTF-16BE) | ✅ | ✅ | ✅ | ✅ | 5 of 5 read back exactly by MuPDF |
| 89 | 7 Redaction | label or overlay text | — | — | — | — | none is written (black box only) |
| 90 | 8 Organize / Convert | page labels, text outputs | — | — | — | — | none are written |
| 91 | 9 OCR text layer | pure Arabic words | ✅ | ✅ | ✅ | ✅ | `ocr-visible/sheet-p00.png` |
| 92 | 9 OCR text layer | Arabic + Latin / numbers in one line | ⚠️ | ⚠️ | ⚠️ | ⚠️ | MuPDF joins the words: "بتاريخINV-2026" |
| 93 | 9 OCR text layer | Arabic-Indic digits | ❌ | ❌ | ❌ | ❌ | stored reversed |
| 94 | 9 OCR text layer | tashkeel | ❌ | ❌ | ❌ | ❌ | dropped |
| 95 | 9 OCR text layer | lone word لا | ❌ | ❌ | ❌ | ❌ | MuPDF reads "ال" |
| 96 | 9 OCR text layer | word boxes line up with the printed boxes | — | — | — | — | `ocr-visible/sheet-p00.png` — not judged: my synthetic boxes are equal-width, real Tesseract boxes needed (the OCR audit covers it) |
| 97 | 10 Metadata, bookmarks, names | Title / Author / Subject with Arabic | ❌ | ❌ | ❌ | ❌ | never written: no /Info, no XMP, no /Lang, no DisplayDocTitle (readers show the file name) |
| 98 | 10 Metadata, bookmarks, names | encoding if it were written (MuPDF setMetaData) | ✅ | ✅ | ✅ | ✅ | UTF-16BE |
| 99 | 10 Metadata, bookmarks, names | file names with Arabic inside .waraq / ZIP | ✅ | ✅ | ✅ | ✅ | Python zipfile and PowerShell Expand-Archive read them; Windows tar.exe cannot (locale) |
