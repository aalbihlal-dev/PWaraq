# Arabic EDIT — what is still open (22 Oct 2026, night, after the fixes of 21–22 Oct)

State: `waraq-next` master, HEAD `32e832a` (my last lift commit `f0a890a`). `pnpm check` 0/0, unit 144/144. Written so a later
round can start straight away. Nothing here is a release blocker by itself: all 29 are known limits for the beta note.

## Numbers (22 Oct, this tree)
| Check | Result |
|---|---|
| Stress judge, edit suite (2584 edits, 76 files) | **29 major**, 254 minor, 2301 pass = 89.05 %; 0 new failures against the baseline |
| My strict grader (`tools/arabic/report.mjs`: any reader that copies the new line differently counts) | 1202 major, 886 minor, 496 OK (19 %) — the same edits, a much harsher judge; the gap is almost all PDFium / pdf.js copying a written line with letter spacing or junk, see "Readers" below |
| PDFium (Edge's viewer) | opens 2584/2584; qpdf structure clean 2584/2584; page has the typed text 1291/2584 |
| pdf.js (0.3's reader, `../waraq/dist/vendor`) | opens 2584/2584; page has the text 1219/2584; line exact 1057/2584; ink overlap with the browser reference ≥ 0.6 in 994 |
| MuPDF (Waraq's own reader, `pageObjects`) | reads the typed line back exactly in 2489 of 2584 (96 %); the stress judge is more lenient than exact (marks/spaces order inside a letter, U+FFFD of a damaged source) and passes 2301 cleanly, 254 as minor |
| Full e2e on the production build (`PREVIEW=1`) | 109 passed, 2 skipped, 10 failed: 8 are `crash.spec` design-rule tests that import `src/lib/drafts.ts` (dev-server only; they cannot run against a built preview), 1 `crash.spec:18` the same import, 1 `longnames.spec:57` (recent-files tooltip, not touched by the Arabic work). Dev-server rerun of those two specs: see the last section |
| Editor e2e (`tests/e2e/editor.spec.ts`, preview) | 6/6 |

## The 29 majors by cause (strips: `Archive-2026-10-12/screenshots/arabic-edit-audit-2026-10-21/remaining/<id>.png`; each strip shows before, MuPDF, pdf.js, PDFium and the browser's reference of the same text in the same font)
Repro for every id: `node tools/arabic/audit-edit.mjs --files <file>.pdf --out tests/audit-arabic/out` (the case id is `<file>__<line>-<kind>__<scenario>`; for `real/…` files pass `real/<file>.pdf`).

### A. A line Waraq wrote reads back with a mark on the neighbouring letter — 18 cases
Plain words: the new line is drawn correctly (the picture matches the browser's rendering), but when the same page is read back
the kasra of the first alef lands on the noon, and a shadda / kasra further on lands on the previous letter ("إِنَّ" comes back
as "إنَِّ"). Only the fully vowelled sentence is affected, mostly when a long sentence is appended.
- `cadlike-visual-presentation-forms__9-tashkeel__longer`, `edge-arial-unicode-ms__10-tashkeel__longer`, `edge-arial__9-tashkeel__longer`,
  `edge-calibri__9-tashkeel__longer`, `edge-courier-new__10-tashkeel__longer`, `edge-dubai__9-tashkeel__longer`, `edge-tajawal__10-tashkeel__longer`
- `word-arial__10-tashkeel__longer`, `word-calibri__10-tashkeel__longer`, `word-dubai__10-tashkeel__longer`, `libreoffice-arial__9-tashkeel__longer`
- `mupdf-story-tajawal__11-tashkeel__oneword`, `mupdf-story-tajawal__11-tashkeel__longer`
- `waraq-lateef-full__9-tashkeel__oneword`, `waraq-lateef-full__9-tashkeel__longer`, `waraq-tajawal-pagewriter__9-tashkeel__longer`
- `type-poetry-tashkeel__0-doc0__longer` (a damma/kasra pair appears twice on "وذلك"), `type-poetry-tashkeel__0-doc0__mixed` (see C: mixed direction)

Root cause (measured, not guessed): MuPDF lists the characters of a right-to-left line by the glyph's origin x, not by the order
of the content stream (I reordered each letter's glyphs in the writer: the listing did not change). The mark glyphs of Waraq's own
writer (HarfBuzz, RTL) have their origin at the letter's right edge for a shadda and at the left edge for a fatha; the right edge of one
letter is the left edge of the next one, so the mark sorts before its own letter and a reader hangs it on the previous letter.
`dist` is 0 pt between the two letters' shared edge: no geometry separates them.
Tried and reverted (each failed the rule "fewer majors and 0 new failures"): writer reorder of a letter's glyphs (no effect);
lift rule "a shadda listed before a letter that has marks belongs to that letter", for all producers and then only for fonts with
`/Waraq-UCS` maps (69 majors both times); one ActualText span around a letter and its marks (288 majors: readers mishandle it).
**Most promising next fix (writer):** put each mark's origin inside its base's box using the font's anchor data (GPOS mark-to-base
anchors → compute the origin so base.x0 < origin < base.x1 while the outline still lands where the font wants it; with a TJ per
glyph and `Tz`/rise this is exact), then the "listed after, inside the box" rule of the lift needs no tie-break. Test: the 18 ids above
plus the whole edit suite; keep only if majors drop and nothing else changes. **Second option:** a per-producer table in
`pageObjects` keyed on the written-font identity — but identity by name failed once (an edit re-embeds the page's own font under the
same family name), so use `/Waraq-UCS` + program size, and expect to need the writer fix anyway.

### B. A boxless line is lifted with letters glued or moved — 2 cases
- `edge-arial-unicode-ms__10-tashkeel__oneword`: the source line lifts as "إِنَّاللُّغَةَالعَرَبِيَّةَ…" (word spaces dropped), so the
  one-word edit starts from glued words. Edge puts the word space and each letter's advance into the same kind of invented space, and in this
  font they coincide with the letters' edges either way. A width test (the font's word space measured on the page's ordinary lines)
  fixes this case but inserts spaces inside words in 32 others (a narrow letter's advance equals a word space): reverted.
- `libreoffice-arial__9-tashkeel__oneword`: LibreOffice lists boxless lines left to right with letters drawn out of order ("إِِنَّلا"…).
**Next:** a per-producer table (LibreOffice: the font is a simple 8-bit TrueType with no Unicode cmap → read its glyph names; Edge/Skia: use
the producer's own advance spaces by reading the PDF's `/W` widths instead of guessing from boxes).

### C. Mixed Arabic + Latin + brackets: drawn right, read back in another order — 1 case here (`type-poetry-tashkeel__0-doc0__mixed`)
and `type-academic-paper__10-doc3__longer` (the bilingual abstract: the English "Abstract" line comes back after the Arabic tail).
Plain words: bidi is not invertible — the same picture can come from two different logical strings, and MuPDF's listing of a mixed line
differs from the typed order. The line on the page is correct. **Next:** make the judge compare by *visual* order (what a reader sees) for
mixed lines, or add the paragraph direction to the written line (RLM/LRM marks around the Latin run) so every reader agrees.

### D. Small print in Type 3 fonts — 2 cases
`edge-noto-kufi-arabic__25-small__oneword`, `edge-noto-naskh-arabic-otf__20-small__oneword`: the 8 pt line comes back without its final
damma (typed "آلبُ", read "آلب"). The fonts are Type 3 (Edge turns variable and CFF fonts into glyph procedures), so the lift has no
font program, no cmap and Type 3 glyph boxes are unreliable. **Next:** no lift fix; the editor already says "Type 3 cannot be reused"
and writes the line in Tajawal — extend the panel text with "small print loses its vowel marks" or have the writer draw marks of 8 pt
text at a minimum 9 pt offset.

### E. The source PDF has no Unicode map for some letters — 6 cases (a damaged source, not a bug)
`real-cma-circular-frutiger-type1__2/4/6-real__oneword|longer`: the circular's Type1C fonts (GEDinarOne, FrutigerLTArabic) have no
ToUnicode for أ, إ and the lam of "الله", so the PDF's own text layer contains U+FFFD ("ا�شخاص", "ا� وبركاته", "ا�جراءات").
Waraq lifts what is there, the user keeps the � in the box, Waraq cannot draw U+FFFD, and the read-back lacks it. **Next (small, high value
for Saudi government files):** read the Type1C font's glyph names (`alefhamzabelow`, `lamalef…`, `uniFE87`) through the CFF charset and map
them to Unicode when the PDF has no ToUnicode; MuPDF does not expose them, but `getBuffer()` gives the font program, so a tiny CFF
charset reader in the worker is enough. Fixes the lift and removes the � from the editing box.

## What each next step touches (so sessions can split)
| Package | Files | Fixes |
|---|---|---|
| W1 mark anchors in the writer | `src/lib/engine/fontstore.ts` (writer loop, new `anchors()` over HarfBuzz GPOS), tests with the 18 ids of A | up to 18 majors |
| L1 CFF glyph-name map | `src/lib/engine/editpage.ts` (lift), new `src/lib/engine/cffnames.ts`, worker `objects` | 6 majors (E) + `�` removal |
| L2 per-producer boxless-line table | `src/lib/engine/editpage.ts` (`pageObjects` boxless branch) | B (2), maybe more |
| J1 judge: compare mixed lines by visual order | `tools/stress/suites.mjs`, `tools/arabic/audit-edit.mjs` | C (2) |
| U1 editor box on flush-left pages (grow to the free side instead of squeezing to ~7 pt; needs the harness edge measure to ignore a hanging mark) | `src/lib/engine/editpage.ts` (`liftBox`), `PageEditor.svelte`, harness | UX, 0 majors; see the notes of 22 Oct |

## Readers (why my strict grader says 1202) — measured on the 2584 edits of 22 Oct
How often each reader gives back the typed letters (spaces ignored), by the font the line was written in:

| Written in | Edits | MuPDF (Waraq) | PDFium (Edge) | pdf.js | PDFium junk characters |
|---|---|---|---|---|---|
| Tajawal | 1360 | 1297 (95 %) | 741 (54 %) | 656 (48 %) | 8 |
| Amiri | 1034 | 1007 (97 %) | 477 (46 %) | 453 (44 %) | 108 |
| Lateef (the file's own font) | 48 | 46 | 17 | 19 | 15 |
| Noto Naskh / Noto Sans (fallback of last resort) | 142 | 139 | 0 | 0 | 142 (every one) |

By scenario (PDFium letters / MuPDF): similar 463/631 of 646, one word 381/617, **mixed 0/635**, longer 391/606.
Plain words: the gap between my strict grader and the stress judge is (1) every mixed Arabic + Latin + brackets line — PDFium and
pdf.js list such a line in the order it is drawn, not in typing order, so a letters-only comparison with the typed text can never match
(bidi is not invertible; the line on the page is right) — and (2) about half of the Tajawal/Amiri lines, where the readers split a word
or move a mark; (3) the Noto fallback, whose letters are drawn from shared skeleton pieces and are always copied as junk by PDFium and
pdf.js (MuPDF is right only because of the ActualText spans). **Next:** a judge that compares mixed lines by visual order (J1);
drop Noto from the fallback chain for text with dots/marks once Amiri or Tajawal cover every letter (they do except `—`, `٬`, `٫`; draw
those from a small symbol font instead) — that removes the 142 junk edits; look at what PDFium splits in Tajawal/Amiri lines (probably
the TJ adjustments of kerned pairs: try one TJ per word with `Tc` instead of per-glyph adjustments).

## e2e, the two specs that failed on the preview build — NOT resolved tonight
`crash.spec.ts` (9 tests) and `longnames.spec.ts` (the 120-character name, 8 variants) failed in the full run on the production preview. The
`crash` ones import `src/lib/drafts.ts` straight from the page, which only the dev server serves, so a preview run cannot pass them.
Rerun against the dev server (35 tests, 2 workers) every case hit the 2-minute test timeout on a cold, busy machine (other sessions
were running heavy jobs), so that run says nothing about the code. Neither spec touches the page editor, `editpage.ts`, `fontstore.ts` or
the fonts, and my working tree had no uncommitted changes; the files that were modified at the time belong to the OCR and title-rail
sessions (`i18n.svelte.ts`, `ocr-align.ts`). Needs one rerun in the morning on an idle machine, `npx playwright test tests/e2e/crash.spec.ts tests/e2e/longnames.spec.ts`
(dev mode, first test ~55 s cold). The editor's own spec passed 6/6 on the preview build, and the other 109 tests of the full run passed.
