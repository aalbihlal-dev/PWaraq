# Waraq 1.0 beta — release check, 22 Oct 2026 (06:15–07:00 local)

Where: a clean worktree of HEAD in `%TEMP%\waraq-rc` (node_modules, `src-tauri/target`, `..\waraq` linked from the real checkout; `public/ocr` and the git-ignored test corpora copied). The uncommitted OCR edits in the main checkout were not part of it. Nothing was pushed or published.

**Release commit (what was tested): `42f908c`** (`5c71b40` plus a one-test fix, below). One later commit, `1beb443`, changes only the Tauri smoke probe; the app code is the same as in `42f908c`.

## Verdict
**Not all green.** Everything automatic that guards the app passes. Four things are NOT green and need the owner's decision or a person's hands (listed at the bottom): edit majors 1.12 % against a 1 % gate, the stress BREACH (OCR slice and 1 major over the allowance), the updater signature, and the checks I could not do.

## Numbers against the 1.0 beta gate (PLAN.md, "1.0 BETA RELEASE GATE")

| Gate | Result | Status |
|---|---|---|
| 1. Arabic editing: stress `edit` majors ≤ 1 % of edit cases, each remaining one listed with its cause | **29 of 2,584 = 1.12 %** (254 minor, 2,301 pass = 89.05 %). All 29 are grouped by cause with repros in `tests/audit-arabic/REMAINING-2026-10-22.md` (18 vowel marks hung on the neighbouring letter in fully vowelled sentences, the rest vowelled-line leftovers and one mixed-direction case). | **Needs owner decision** (0.12 point over) |
| 2. Arabic writing: `write` majors only where an outside reader cannot follow the PDF standard; text copies in logical order in Acrobat-like readers | **314 of 1,254** (691 pass, 249 minor). They are reader-order residue: MuPDF (Waraq's own Find), pdf.js and the wasm PDFium read mixed Arabic/Latin lines and Arabic-Indic digits in drawn order; plus the OCR text layer (about 100 of the 314). Writing a logical-order copy of each line (/ActualText) was tried per line and per run: it fixes PDFium (exact 113 → 330) but makes MuPDF and pdf.js worse (write majors 338 → 445 / 603), so it was not adopted. **Edge's and Acrobat's own copy could not be measured** (the automated copy test needs a window in front and returned empty). | **Explained, but the "Acrobat-like readers" half is unverified** |
| 3a. `pnpm check` | 0 errors, 0 warnings (157 files) | green |
| 3b. Unit tests | **149 / 149** (with the Office/CAD packs and the real corpus present). First clean run: 142 pass, **1 fail**, 6 skipped — the failing test was mine (`writers-store.test.mjs`, dense Type 1 paragraph) and needed a git-ignored public PDF; it now skips when that file is absent (`42f908c`). | green |
| 3c. E2E, built app (`PREVIEW=1`) | **109 passed, 4 skipped, 8 failed.** The 8 are the crash-dialog design-rule tests (`crash.spec.ts:153`), which import a source module and cannot run on a built preview (the spec skips the other test that does this but not this one). | green with that spec nit |
| 3d. E2E, dev-only crash and recovery specs (dev server) | **23 / 23** (includes the 8 above) | green |
| 3e. Design audit (4 themes × EN + AR × all screens) | **24 / 24** on the built app | green |
| 3f. Tauri smoke test | **5 / 5** (four themes in English, light in Arabic). First run: 4 / 5 — "light ar" failed at pixel (641,24)=#f1fcff, a letter of the centred document name on the title rail, not a line (screenshot checked). The probe now skips the centre sample on those two rows (`1beb443`); every other sample must still be one flat colour. | green after probe fix |
| 3g. `pnpm desktop:build` | Release build and NSIS installer **built** (see below). The command exits 1 at the **updater signature** step: `A public key has been found, but no private key … TAURI_SIGNING_PRIVATE_KEY`. I did not use the owner's key (it is in `Backups/keys-private`), so there is no fresh `.sig`; the `.sig` next to the installer is from an earlier build and does not match it. | **Not green** (needs the owner's key) |
| 3h. Full `pnpm stress` | 3,934 cases, **351 major** (allowed 350), 1 new failure: unit 25/25 (100 %); edit 2,584 (29 major, 89.05 %); write 1,254 (314 major, 55.1 %); ocr 71 (8 major, 74.65 % — baseline 76.06 %). Exit 1: "major issues 351 > 350" and "ocr slice 1.4 points worse". The baseline was recorded before the OCR session's last commits. | **Not green** (BREACH) |
| 4. Publishing agent's independent test on the final build | not run here | open |
| 5. Website preview checked, limits stated | not run here | open |
| 6. Backup bundle of all repos, GitHub synced | not run here | open |

### OCR numbers by slice (stress run, `tools/ocr-accuracy.mjs` on the scanned-test set: 8 base pages + 63 scanner-effect pages)
- **Pass 53, minor 10, major 8 of 71.**
- Majors (chars right < 80 %): 03 invoice (mixed Arabic/English rows), 05 financial table, 10 certificate, 11 poster, 16 vowelled text, 19 receipt (all flatbed 200 dpi), 49 book photocopy-of-a-photocopy (31.9 %), 53 book with bleed-through (68.9 %).
- Minors (words right 60–89 %): faded weather page (85.3 %), menu (67.2 %), list (85.7 %), photographed books with uneven light / curved spine / faded (89.1 % each), letter photocopy-of-a-photocopy (60 %), bleed-through letter (75 %), pen strokes (88.3 %), hard-JPEG book (87.3 %).
- The real-document set (27 real scans + 7 rendered public PDFs) was **not re-measured** in this check. Last measured on 20 Oct (PLAN.md): real rendered 75.5 % words, real scanned 62.2 % words, clean printed pages 86–98 %. The release notes use those figures.

## The installer
- File built from `42f908c` at 06:23: `src-tauri/target/release/bundle/nsis/Waraq_1.0.0-dev_x64-setup.exe`
- **Size 30,012,031 bytes (28.6 MB)**
- **SHA-256 `857fbb32a79d970bbb068aa0a3629603aeb62d5c71fd5d7d5dd009c810ba1a06`**
- Not code-signed (SmartScreen "unknown publisher", as the release notes say). The installer in `release/` (28.0 MB, built 21 Oct 10:29) is an older build with another hash; do not mix the two with the `.sig`.
- Silent install / uninstall / right-click entries (the 29-check installer test) were **not re-run** on this build.

## Known limits (plain words; full text in `release/RELEASE-NOTES-1.0-beta.md`)
- Fully vowelled lines (poetry, Qur'anic text) from some producers: after editing, a vowel mark can sit one letter off in the text box, and sometimes a letter of the old line stays.
- A very long replacement sentence is squeezed (smaller letters, then narrower) and never wraps; the panel warns.
- Some PDF fonts cannot be reused (cut-down fonts, no Arabic joining rules): the line is written in the same family from this PC, or Amiri / Tajawal, and the panel says so.
- Some readers copy a line mixing Arabic with numbers or English in the order it is drawn. Waraq's own Find finds single words 92–97 % of the time, whole mixed phrases about a third to a half; Arabic-Indic numbers (١٢٣) and plain words inside vowelled lines are not found; Find only partly works on text added to pages turned 90° / 270°.
- OCR: clean printed Arabic 86–98 % of words; old scanned books, photocopies, vowelled text, small-print tables and old prints much lower; check number columns by eye.
- The installer is not code-signed; the web version cannot convert Word / Excel / PowerPoint / CAD.

## NOT green / still open
1. **Edit majors 29 = 1.12 %** against the 1 % gate — owner's decision (the notes list the causes).
2. **Stress BREACH:** 351 majors vs 350 allowed, and the OCR slice 1.4 points below its baseline. Re-record the baseline after the OCR session's last commit, or accept; the OCR change since the baseline is the OCR session's.
3. **Updater signature:** `desktop:build` stops at "no private key". Someone with the owner's key must run the build with `TAURI_SIGNING_PRIVATE_KEY` (and its password) set, then `node tools/dev/update-manifest.mjs`; until then there is no valid `.sig` / manifest for this installer.
4. **Not measured:** Edge's and Acrobat's own copy of Waraq-written mixed lines (gate 2's "Acrobat-like readers"); the installer test on this build; the publishing agent's test; the website preview; the backup bundle.
5. Spec nit: `crash.spec.ts:153` should skip on a built preview like its neighbour.

## Not changed by this check
No source file of the app was changed. Two small commits came out of it: `42f908c` (one unit test skips when a git-ignored corpus is missing) and `1beb443` (smoke probe).
