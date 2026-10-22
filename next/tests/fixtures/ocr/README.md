# OCR test set

`node tools/ocr-accuracy.mjs` reads every `*.pdf` here (a page that is only a picture, like a scan) and compares what the
OCR pipeline reads with `*.txt` (the correct text). Two parts:

## Synthetic (committed, `01-…08-*.pdf`)
Made by `make-ocr-set.mjs`: text in Noto Naskh / Noto Sans Arabic / Tajawal, drawn at 150–300 dpi, then blurred,
noised, tilted or faded with `scan-fx.mjs`. The e2e OCR tests use pages 07 and 08. 8 pages, 870 words, 6 MB.

## v3: types, arrangements, kinds of scan (`v3/`, git-ignored; `node tests/fixtures/ocr/make-ocr-v3.mjs`, 63 pages, 15 MB)
Synthetic pages tagged in `v3/manifest.json` by document **type** (letter, invoice, contract, form with boxes, financial
statement, three-column newspaper, book with footnotes, two-column paper, slide, certificate, poster, menu, timetable,
bilingual both ways, full tashkeel, numbered list, small print, receipt, stamp + watermark, coloured background),
**arrangement** (1–3 columns, tables with right-to-left columns, A4/A5/Letter/80 mm receipt, landscape, page /Rotate
90/180/270) and **kind of scan** (flatbed 150/200/300 dpi, phone photo with perspective and shadow, uneven light, curved
spine, skew 1/3/5°, faded, photocopy of a photocopy, 1-bit, bleed-through, pen strokes, hard JPEG, sheet turned
90/180/270), the scan kinds all on the same letter and book pages so the scan is the only difference. The tool slices its
numbers by each tag. Stamp and watermark words are not part of the truth.

## Real (`real/`, git-ignored; `node tools/get-ocr-set.mjs` downloads and builds it, ~14 MB of downloads in `real/dl/`)
Only publicly published documents, nothing personal; the downloads are data and stay on this PC — nothing from `real/`
is committed or redistributed.

### `r-*`: pages of public PDFs that have a text layer, turned into scans with `scan-fx.mjs`
The page's own text layer is the truth (MuPDF `toStructuredText`). Many Arabic PDFs store the lam-alef ligature
reversed in their text layer, so the accuracy tool counts lam + alef in either order as the same; other lost glyphs
are patched per page in `get-ocr-set.mjs` (the CMA circular's "لأ").

| page | source | licence / terms | size |
|---|---|---|---|
| r-01 letter, 300 dpi | Capital Market Authority circular, cma.gov.sa/MediaCenter/Documents/circular10.pdf (1 page) | public government publication | 0.7 MB |
| r-02 regulations list (names, dates, numbers), 200 dpi grainy; r-04 report intro, tilted 1°; r-05 gazette list, 150 dpi faded | Ministry of Justice monthly report of regulations no. 66, sjp.moj.gov.sa/RegisterationFIles/Documents/monthlyreports/MonReportForSysCirAndRegV66.pdf, pages 8, 3 and 16 | public government publication | 1.0 MB |
| r-03 tracks, dense two-page spread, 200 dpi; r-06 definitions spread, two columns; r-07 price-index table with info cards, photocopy-style | GASTAT annual report 2024 (Arabic), stats.gov.sa/ar/annual-report → Annual_REPORT_2024_AR.pdf, pages 9, 13 and 38 | GASTAT open data publication | 5.7 MB |

### `s-*`: genuinely scanned pages with hand-checked text (Hugging Face `datasets-server` rows API), 27 pages
| pages | dataset | licence | notes |
|---|---|---|---|
| s-01…s-05, s-08…s-17 | `Misraj/Misraj-DocOCR` rows 0, 1, 2, 3, 5, 19, 24, 27, 28, 33, 35, 37, 39, 43, 44 (400 rows, 537 MB in full; only these rows are fetched) | Apache-2.0 (dataset card) | scanned book and document pages: dense text, accounts, hadith with tashkeel, a table, a bilingual title, an index of numbers; truth in Markdown (formatting marks are ignored by the tool) |
| s-18…s-25 | `freococo/ocr_arabic_books` rows 0, 450, 900, 1350, 1800, 2250, 2700, 3500 (3537 rows) | CC BY-NC-ND 4.0 (dataset card): test use on this PC, nothing redistributed | scanned religious books with footnotes; truth = page header + body + footnotes |
| s-06, s-07, s-26, s-27 | `ahmedheakl/arocrbench_historicalbooks` rows 0–3 (KITAB-Bench, arXiv 2502.14949) | no licence stated on the card; research benchmark, used here for local measurement only | historical prints, hand-checked lines |

### `m-NNN`: every other Misraj-DocOCR page (`node tools/get-ocr-set.mjs --all`)
`Misraj/Misraj-DocOCR` rows 0–399 except the 15 above: 385 scanned book and document pages, Apache-2.0, about 190 MB of
downloads. Their truth is Markdown with layout tags (`<img>`, `<page_number>`, tables, bold marks); the fetch script
reduces it to the words printed on the page (tags, pictures, table pipes and watermark text are not words), so a page's
markup no longer counts as words the OCR could never read. `real/manifest.json` tags every page: type (prose / table /
numbers), arrangement (plain / some tashkeel / full tashkeel) and source.

### `w-NN`: Arabic Wikisource proofread pages (`--wikisource`)
Pages of quality 3 or 4 (human-proofread) of works that Wikimedia Commons marks "Public domain" (checked per file by the
script), with the page's scan from Commons. Only a handful of Arabic Wikisource pages are proofread: one page of
al-Aqqad's *Ibn al-Rumi* (1931) came out; the other two works sampled had none above quality 2.

Looked at and not used: KITAB-Bench `hindawi` (72 dpi renders with coloured glyph outlines, not scans), `isippt`/`arabicocr`/`patsocr` (single lines), KITAB-Bench's licence (its repository names MIT for the code and states none for the data: the two historical-books pages are measured locally only, nothing redistributed), `doclaynet` (English reports), `Omar-youssef/arabic-ocr-markdown-dataset` (exact A4 renders, no licence), the Al Rajhi fund terms PDF (its text layer swaps letter pairs).
No set found had office forms or phone photos of Arabic pages with checked text.

The datasets' image links come from the rows API at run time (they expire), so the tool records dataset + row, not an
image URL.
