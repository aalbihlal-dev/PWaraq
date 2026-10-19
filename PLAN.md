# Waraq 1.0 — plan (15 October 2026)

Owner's rating of 0.3.x: 6/10. Waraq 1.0 is a rebuild next to the live 0.3.x (in `../waraq`), switched over only
when 1.0 is better at every everyday task.

## Decisions (owner, 15 Oct 2026)
- **Open source, GNU AGPL v3 or later**, with **MuPDF** as the PDF engine (0.3.x relicensed the same day).
- **Rebuild alongside** 0.3.x, in phases that each ship something usable.
- **Tauri** desktop shell (Windows' built-in WebView2) instead of Electron.

## Owner's direction (15 Oct 2026)
- **Colours: the Waraq palette of 0.3.x** (paper #fafbf8, green #15775d, mint, ink) everywhere; no automatic dark
  theme from Windows.
- **Branded window top bar** in the desktop app (Tauri, Phase 4): no Windows title bar; the Waraq bar *is* the title
  bar (logo, file name, tasks, our own minimise / maximise / close, drag to move).
- **Drawings 100 % crisp**: page images at exactly the screen's resolution, one image pixel per screen pixel, page
  boxes on whole screen pixels, CAD hairlines at least 1 px (engine build). Done in Phase 1.
- **Organize and Edit like Adobe Acrobat / PDFCraft** (Phases 2–3): Organize = full-window page grid with
  multi-select, drag to reorder, rotate / delete / insert / extract / split between pages, insert from file;
  Edit = click text to edit it in place in its own font, select and move / resize / replace images, add text and
  images, right-hand options panel.

## Why 0.3.x feels like a 6 (root causes)
1. Patched, not designed: 20–50 KB files with lines up to 3,600 characters, 7 stylesheets overriding each other
   (54 `!important`). Every fix risks another break.
2. Nine ways to reach tools (sidebar, quick bar, ☆ Tools, ⋯ menu, tool grid, Ctrl+K, page action bar, View/Edit
   modes, page-editor overlay).
3. Three PDF engines for one job (pdf.js draws, MuPDF via a local server per request, pdf-lib writes): website
   and desktop look and behave differently.
4. Shallow editing: replaced text is covered and rewritten in Helvetica; Arabic edits become pictures.
5. Website = app + marketing + downloads in one long page.
6. Licence conflict (fixed: now AGPL). Unsigned installer (SmartScreen) remains a trust cost.
7. No automated interface tests: bugs found by the publishing agent after release.

## 1.0 architecture
- **One engine, everywhere:** MuPDF (WebAssembly) in background workers for drawing, text, search, annotations,
  redaction, forms and page operations; pages kept in memory as display lists (instant re-draws and zoom tiles).
- **Code:** TypeScript + Vite + Svelte; one design-token stylesheet; English/Arabic strings in translation files;
  RTL from the start.
- **Arabic-first editing:** HarfBuzz shaping + embedded fonts so edited Arabic is real text.
- **Workspace (like Acrobat / Edge):** start screen (Open, Recent, drop) → document workspace: task bar
  (View · Edit · Organize · Convert · Sign · Protect · OCR), thumbnails left (multi-select, drag), page centre,
  options panel right (no pop-up dialogs). One path to each tool, plus Ctrl+K search.
- **Desktop:** Tauri 2; Office & OCR stay add-on packs (0.3.2 design); signed auto-updates (Tauri updater).
- **Website:** product page at pwaraq.com, app at pwaraq.com/app.
- **Quality:** Playwright end-to-end tests for ~12 real journeys + screenshot comparison on every build; the
  existing real-engine tests carry over.

## Kept from 0.3.x
Brand, logo, installer art and branded setup idea; Arabic text repair + search normalisation; add-on pack
system (make-packs, checksums, zstd, parallel downloads); OCR text layer; crop maths; engine tests; Cloudflare
site and `_headers`; the hand-over workflow with the publishing agent.

## Engine spike (spike/cad-speed.mjs, spike/darken.mjs) — MV Trenches A0 drawing, page 1 (~14 M commands)
| Step | MuPDF WASM | 0.3.3 desktop | 0.3.3 website |
|---|---|---|---|
| Open file | 0.04 s | | |
| First read of the page (once) | 6.4 s | ~7 s per draw | ~17 s |
| Whole page at screen size | 3.1 s from memory | ~7 s | |
| 800 % zoom tile | 1.6 s from memory | ~4 s | |
| Search a word (147 hits) | 5.2 s | | |

Verdict: **viable, with two conditions**
1. **Hairlines:** the official WASM build does not expose MuPDF's minimum line width, so CAD lines come out faint.
   Drawing at 2× and keeping the darkest pixel helps but is not as solid as native `-l 1`. → Phase 1 builds our
   own MuPDF WASM (allowed under the AGPL) exporting `fz_set_graphics_min_line_width` (and anti-alias level).
2. **Heavy pages are still seconds, not instant:** WebAssembly is single-threaded. → several workers draw different
   pages in parallel; whole-page images are cached per zoom step and refined with tiles; text for search is
   extracted once in the background.

## Portfolio (حافظة) — centre of Phase 2 (owner approved the idea, 16 Oct 2026; contents/divider wishes 18 Oct)
User story (a student): *"I have a course; every week I make a file. I want an app that gathers them into one big
file that I can keep editing each time — change the order and add pages as images when I need to."*
A Portfolio is a project that remembers its parts; the big PDF is produced from it whenever needed.
Owner's additions (18 Oct): a **table of contents** whose lines carry page numbers and open their page; **page
numbers** for the whole portfolio (renumbered as pages come and go) or for one section; each section's **title comes
from its file** and is the contents line — if it is still the file name, the contents tool **highlights** it;
**section divider pages** are their own feature (not "add page"): the contents jump to them and you **write the
section name on them** in place.

Built (19 Oct, `src/lib/portfolio.ts`, `src/components/Portfolio.svelte`):
- New portfolio from the start screen; each added file (PDF or photo) becomes a section titled by its file name.
- Sections in the page grid (same grid as Organize): drag pages within/between sections, turn, delete, "+" or drop to
  insert pages/photos anywhere (a photo page takes the neighbouring page's size), replace a section's file in place.
- Contents block above the sections = the contents tool: titles editable there (and in the section header and on the
  divider card), file-name titles highlighted, live page numbers. Divider card per section, written on directly
  (title + optional note). Options panel: contents on/off, dividers for all sections, page numbers (none / whole
  portfolio / only one section), bookmarks per section, export PDF, save `.waraq`.
- Export: contents pages (rows link to their page), dividers, pages, numbers, bookmarks — the contents and dividers are
  **real text in Tajawal** (Arabic joined with the font's own letter shapes, right-to-left, copy/search give normal
  Arabic) via `src/lib/engine/textpage.ts`.
- Kept in browser storage at every change (OPFS folder: manifest + original files); recent portfolios on the start
  screen; portable `.waraq` (ZIP: `manifest.json` + `files/`) opens from Open or by dropping it.
Still to do: drag whole sections (now ↑/↓ buttons), cover page, contents/divider fonts subset (now the two Tajawal
weights are embedded whole, ~120 KB), harakat and Persian letters on written pages (with HarfBuzz, Phase 3),
desktop watch folder, phone camera pages.

## Page editor — first version (19 Oct 2026; owner asked to edit one page's photos and text "full like PDFCraft")
Opened by double-clicking a page (or its "Edit page" hover button / toolbar button) in Organize and Portfolio, and from
the **Edit** task in the workspace (current page). Acrobat/PDFCraft layout: page large in the middle, tools on top
(Select, Add text, Add photo, undo/redo, delete, Cancel, Save page), options on the right, no pop-ups.
- **Add text:** click to place, type, move (bar above the box), width (corner), size, colour (black + Waraq palette),
  bold, alignment; a new box follows the direction typed (Arabic to the right). Written as **real text in Tajawal** via
  `pageWriter` (Arabic joined, own ToUnicode), wrapped at the box width — never a picture.
- **Photos:** add (centre of the page), move, resize keeping the shape (corner), replace, delete; existing photos in the
  PDF too (MuPDF lists image blocks). An existing photo is taken away by emptying its own image resource when only it
  uses it (found by emptying each in turn), else by redaction of its box; moved photos keep their own image object.
- **Existing text:** click a line → a text box in its place with its text, size, colour, weight; the old line is
  removed by MuPDF redaction (text only), the new text written **in the line's own font** (see "Owner's ideas" 2, done
  19 Oct). Only lines that read left to right on the page as seen can be replaced.
- **Undo/redo** in the editor; **Save page** builds one edited page (engine job `edit`) that becomes a new one-page
  source and replaces the page in the list (Organize: one undo step; Portfolio: kept as a file of the portfolio, so
  sections, numbers, contents and `.waraq` keep working; Edit task: the document is rebuilt and marked changed).
- Code: `src/lib/engine/editpage.ts` (pure: `pageObjects`, `editPage`), worker jobs `objects` / `edit`,
  `src/components/PageEditor.svelte`. Checks: `tests/unit/editpage.test.mjs` (7), `tests/e2e/editor.spec.ts` (3),
  editor screen in `audit.spec.ts`. Screenshots: `../Archive-2026-10-12/screenshots/waraq-1.0-preview/page-editor-2026-10-19/`.
Still to do: editing a whole paragraph as one block (now line by
line), turning/cropping photos, zoom inside the editor, arrow-key nudging, warning before leaving with unsaved edits,
text on turned (vertical) lines.

## Owner's ideas (19 Oct 2026) — to build next
### 1. Signing mode (توقيع) — first version built 19 Oct, see below
Owner: one click adds signature + date; in one sitting he signs many files with the same date, the same signature and
the same spacing; sometimes he wants everything at hand; Waraq should find where a page or document needs signing,
highlight it and tell him which page; a signature image should lose its background and change colour.
- **Signature set** ("my signature"): signature + date (+ optional name/title, stamp), laid out once with fixed
  spacing; placed with **one click** as a group. The date is fixed for the session ("today", Gregorian or Hijri,
  chosen format), so every file signed in that sitting carries the same date.
- **Signature library** on this device (IndexedDB): draw, type (Tajawal / handwriting-style font) or import a photo
  of a signature. Imported photos: **background removed** (light pixels → transparent, threshold set automatically,
  slider to adjust), cropped to the ink, **recoloured** (black, ink, blue, Waraq green). Saved as PNG with alpha.
- **Find where to sign:** on opening a file in signing mode, search every page for empty signature form fields
  (/FT /Sig) and for words like "التوقيع", "توقيع", "الاسم والتوقيع", "Signature", "Signed", "Sign here", "التاريخ",
  "Date", plus an underline/blank after them. Each spot is **highlighted** on the page; a bar in the options panel says
  "Signature needed on page 3 — Go" (a bar, not a pop-up: owner rule); clicking a highlighted spot drops the set
  aligned to it (signature over the line, date over the date field).
- **Many files:** a signing queue — open several PDFs, Waraq goes file by file to each found spot (or the same
  position as the last file), one click / Enter to sign and go to the next, then save all (same names with a suffix,
  or overwrite on request).
- Engine: reuse `editPage` (photo with transparency + text edits) — the set is a group of edits. Later: real digital
  signatures with a certificate (MuPDF can sign PDFs; check the WASM API) and a visible "signed by" stamp.

**Built — first version (19 Oct 2026):** the **Sign** task in the workspace (`src/components/Sign.svelte`).
- Library on this device (IndexedDB store `signatures`, db version 2): draw, type (Tajawal italic), or a photo; every
  signature is cleaned by `src/lib/signature.ts` — paper made transparent (Otsu threshold, middle of the gap between
  ink and paper; slider "Paper removal"), cropped to the ink, recoloured (black, ink, blue, Waraq green) — kept as PNG
  with alpha (the alpha survives into the PDF: checked).
- Set: signature + session date (date field, Gregorian / Hijri Umm al-Qura, numbers / month name / year first,
  Western digits) + optional name; fixed size (150 pt wide, ≤ 56 pt high) and spacing (4 pt gaps, 10 pt text);
  name and date text in the signature's colour, real text in Tajawal.
- Find: `src/lib/engine/sign.ts` `findSpots` — empty /Sig fields and labels (الاسم والتوقيع, التوقيع, توقيع,
  Signature, Signed, Sign here, التاريخ, Date) that look like labels (colon / blank next to them, or little else on
  the line); the blank = the nearest run of ____ / .... on the reading side, else the space after the label (left in
  Arabic), else under it. Highlighted on the page (next one stronger, date places dashed); bars "Signature needed on
  page N — Go" at the top of the options panel.
- Place: click a highlighted place (the signature sits on the blank's line, the date goes on the nearest date blank of
  the page, name under the signature), or click anywhere on the page. **Enter / "Sign and next"** signs the next place,
  then the next file; a file with no places gets the last file's place (dashed "Same place as the last file").
  Ctrl Z undoes the last one in the file.
- Many files: "Add files" (queue in the panel with "n signed"); **Save all signed** writes `name-signed.pdf` per file
  (system Save window, download in tests) and the open document becomes the signed one. Signing changes only the
  page's contents and resources, so links, bookmarks and form fields stay (`signPdf`).
- Fixed on the way: `stamp` (assemble.ts) gave a resource name already on the page (WqT0, WqI0 — a page Waraq wrote or
  edited before) to the new font/photo, so old text lost its copy/search map; names now stay unique.
- Checks: `tests/unit/sign.test.mjs` (6), `tests/e2e/sign.spec.ts` (two files, same set and date), signing screen in
  `audit.spec.ts` (en + ar). Screenshots: `../Archive-2026-10-12/screenshots/waraq-1.0-preview/signing-2026-10-19/` (13–17).
Still to do: drawn form lines/boxes as blanks (only typed ____ now), stamp in the set, moving/resizing a placed set,
overwrite the original on request, a warning before leaving with unsaved placements, the empty /Sig field is left in
the form (drawn over), digital signatures with a certificate.

### 2. Arabic text keeps its own font when edited — **done (19 Oct 2026)**
Built: engine export `Font.getBuffer()` (engine/apply-waraq-changes.py) gives the embedded font file; `src/lib/engine/ownfont.ts`
shapes the new text with **HarfBuzz** (harfbuzzjs) against it — joined letters, harakat placed by the font, mixed
Arabic/English in direction runs — and writes it by glyph id with its own ToUnicode (letters drawn as several glyphs, e.g.
Noto's separate dots, carry ActualText so copying gives normal Arabic). Letters the subset lacks: the full bundled font of
the same family, else the closest (Noto Naskh Arabic for Times/Traditional/Simplified-like, Noto Sans Arabic for Arial-like,
Tajawal last); the options panel names the font and the missing letters. Bundled OFL fonts: Noto Naskh / Noto Sans Arabic
(regular + bold, public/fonts). Checks: tests/unit/editpage.test.mjs (3 new), tests/e2e/editor.spec.ts (1 new), tour screens
20-22 (tools/dev/tour-ownfont.spec.ts). Left: the on-screen box while typing still shows Tajawal (the saved page is right);
fonts without a Unicode cmap (subsets made by MuPDF, some Chrome PDFs) and bare CFF / Type 3 fonts fall back (said in the
panel) - next: rebuild a cmap from the PDF's ToUnicode; "bold" switched off on a bold-only font stays bold; Latin lines in
non-embedded Helvetica/Times fall back to Tajawal; Amiri not bundled; desktop: installed system fonts.
Original plan:
- Take the line's own font from the PDF (the font object MuPDF reports for its characters) and write the new text
  with it; shape Arabic with **HarfBuzz** (harfbuzzjs WASM) against that font so letters join correctly whatever the
  font's encoding.
- Embedded fonts are usually **subsets**: a letter the subset lacks cannot be drawn in that font. Then: use the full
  font if it is installed on the PC (desktop) or bundled (Arial / Times / Traditional Arabic / Simplified Arabic
  equivalents: Noto Naskh, Noto Sans Arabic, Amiri); otherwise tell the user which letters are missing and offer the
  closest bundled font — never a silent switch to Tajawal.
- Size, colour, weight and position as the original line (already done); keep harakat.
- To check first: whether our MuPDF WASM build exposes the embedded font's bytes (else add it in the engine build).

## Phases (each ships)
1. **Foundation — done (19 Oct):** project, custom MuPDF WASM build, worker pool, viewer (large drawings, zoom/pan,
   thumbnails, search), workspace shell, Open/Close/Recent, end-to-end tests + design-rule test. "Waraq 1.0 preview":
   double-click `../Waraq 1.0 preview.cmd` (builds and opens it in its own Edge window).
2. **Organize + Portfolio & everyday tools:** Organize page grid — **done (19 Oct)**: select (click/Ctrl/Shift),
   drag several pages, turn, delete, insert file/photo/blank (toolbar, "+" between pages, drop), extract, undo/redo,
   save; applied when going back to View. Portfolio — **first version done** (see above). Everyday tools — **done
   (19 Oct)**: merge (Organize → Insert file), **split** into files (every N pages / at selected pages / each page; one
   ZIP), **crop** (drag a box or margins; CropBox, undoable), Edit → **Whole document**: page numbers (6 positions,
   start, "n / N", upright on turned pages) and a real-text **watermark** (Arabic too, see-through, angle), Convert:
   **compress** (photos scaled to 2200/1400 px and saved as JPEG; text, vectors and CAD lines untouched) and **pages as
   PNG**, Protect: **password** (AES-256, print/copy permissions) and **unlock**; password-protected PDFs open after
   asking for the password. Engine: `src/lib/engine/tools.ts`. Still to do: Portfolio drag whole sections, cover page.
3. **Editing & documents:** page editor — **first version done (19 Oct)**, see above; next: text in its own font
   (Arabic with HarfBuzz), redaction tool, forms, OCR (text layer), Office/CAD via packs.
4. **Desktop & website:** Tauri shell, file associations and right-click menu, packs, signed updater, branded
   installer; new product page + /app; switch 0.3.x users over.
