# Changelog

All notable changes to Waraq. The format follows [Keep a Changelog](https://keepachangelog.com/); versions follow
[Semantic Versioning](https://semver.org/) as far as a beta allows. For the known limits of a release read its release notes.

## [1.0.0-beta] — in preparation (Waraq 1.0, `next/`)

Not yet published. Waraq 1.0 is a ground-up rebuild: one PDF engine for the website and the Windows app. Full description,
installer details and honest limits: [`next/release/RELEASE-NOTES-1.0-beta.md`](next/release/RELEASE-NOTES-1.0-beta.md).

### Added
- **One engine everywhere:** MuPDF compiled to WebAssembly (with a minimum line width so CAD hairlines stay solid), run in a pool
  of background workers; the web version and the Windows app behave the same.
- **Ten tasks in one bar:** View, Organize, Edit, Convert, Sign, Protect, Redact, Forms, OCR, Comment; plus **Portfolio (حافظة)**
  (cover, divider pages, contents with links, page numbers, bookmarks, portable `.waraq` file).
- **Page editor:** change a line of text or a photo in place, add text and photos, redact an area; a changed Arabic line keeps
  the document's own font when the PDF allows it (the panel names the font, or says which letters forced another one).
- **Arabic text writing:** HarfBuzz shaping everywhere Waraq writes text — joined letters, harakat, Persian and Urdu letters,
  Arabic-Indic digits, mixed Arabic/English lines (a full Unicode bidirectional algorithm); a font service that picks the line's
  own font, the same family from your PC, or bundled Amiri / Tajawal / Noto, and cuts the embedded font down to the glyphs used.
- **Sign:** drawn, typed or photographed signatures with Gregorian or Hijri dates, batches of files, finding where to sign;
  **digital-ID (certificate) signatures** that can be created or imported (`.pfx`), and a panel that verifies the signatures of a file.
- **Comment:** highlight, underline, strike-through, pen, shapes, arrows, text boxes and sticky notes as standard PDF comments.
- **Forms, Redact, Protect, Convert:** Arabic form answers that keep their value; redaction that removes the content; AES-256
  passwords; compress and pages as images; Word, Excel, PowerPoint, DWG and DXF to PDF in the desktop app.
- **OCR:** invisible, exactly placed text layer with a cleaning step before reading and two passes (Arabic, then Arabic + English);
  sideways and upside-down sheets, tilted pages and tables are handled.
- **Looks after your work:** drafts kept and offered back after a crash, safe saving (the new file is checked before it replaces
  the old one), damaged PDFs open as far as they can be read, portfolio versions, a crash report you read first and send only if you click.
- **Four themes** (Light, Dim, Dark, Graphite), a title bar that shows the document name and an unsaved-changes dot.
- **Windows app (Tauri):** about 28 MB per-user installer, "Open with Waraq" without taking over the default reader, signed
  update check with rollback to the previous version, Office & CAD add-on (137 MB) downloaded once after asking, checked and kept on the device.
- **Stress pipeline:** `pnpm stress` / `pnpm stress:quick` — scripted suites for unit, editing, OCR and writing Arabic with a
  one-page report of new problems only; a corpus of about 90 Arabic PDFs from many producers, 23 document types and 18 scans.

### Measured
- Editing existing Arabic lines: 2,584 scripted edits on 76 test PDFs — 89 % pass with nothing to note, 98.9 % have no real
  problem, 29 (1.1 %) are documented known limits (`next/tests/audit-arabic/REMAINING-2026-10-22.md`).
- OCR with Tesseract: clean printed Arabic about 97 % of words (86–98 % across clean test pages); genuinely scanned books about 63 %.

### Known limits
See the release notes. In short: the Windows installer is not code-signed yet (SmartScreen warns the first time); fully vowelled
lines from some producers can shift a vowel mark by one letter after editing; some readers copy mixed Arabic/English lines in drawn order.

## [0.3.3] — Waraq 0.3 (`app/`)
The current release: the website at pwaraq.com and the Windows desktop app (Electron) with optional engines (MuPDF, qpdf, LibreOffice,
LibreDWG, Tesseract) delivered as add-on packs. Earlier 0.3.x versions are in the git history of `app/`.
