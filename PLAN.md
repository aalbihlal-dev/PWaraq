# Waraq 1.0 — plan (15 October 2026)

## Plan v2 — the whole road to 1.0 (owner asked to re-plan, 20 Oct 2026)
Rules first: the owner (tshi-dev) is the author of every commit, Claude a contributor; nothing is pushed until it is
tested and ready AND the owner says yes; never publish/buy without asking; Waraq colours, lintapple rules, 100 % crisp
drawings; one fresh session per step, short answers with screenshots.

Done (local, tested): viewer, Organize, everyday tools, Portfolio, page editor, signing, redaction, forms, OCR v1.
Not pushed: everything after the Portfolio/404 commit. Public repo history rewritten to the owner locally (force push once).

| # | Step | Done means | Owner's part |
|---|------|-----------|--------------|
| A | **OCR v2 (Arabic that can be trusted)** — v1 is Tesseract with the small "fast" Arabic model, no image clean-up, tested on one clean synthetic scan only; **it is not 100 %**. v2: (1) a real test set of 5–10 scanned Arabic pages with the correct text, word accuracy measured and written down; (2) quick wins: bigger "best" Arabic model, clean-up before reading (grey, contrast, straighten, upscale small print to 300 dpi), Arabic and English passes merged; (3) **benchmark seen 20 Oct (deep.sa/models/alocr, 19 engines on Arabic pages, 100 − CER):** alOCR 2.0 96.1 %, GPT Sol 95.9 %, Surya OCR 2 93.4 %, dots.mocr 92.3 %, Qari-OCR 80.3 %, **Tesseract 5 77.5 %**, **PaddleOCR PP-OCRv5 45.4 %** (so PaddleOCR is out). Local best = Surya OCR 2 (open source, PyTorch, heavy → desktop add-on pack only, measured first). (4) **alOCR is NOT open source** (checked 20 Oct: no weights on GitHub/Hugging Face; "محلي" means Saudi-hosted; $6.67 per 1 000 pages, on-premise only for Enterprise). Open-source engines from the same table: Surya OCR 2 93.4 % (GPL-3, AGPL-compatible), dots.mocr 92.3 % (MIT, 1.7 B VLM, heavy), Qari-OCR 80 %. Optional **cloud OCR: alOCR 2.0** (alapi.deep.sa, OpenAI-style API, paid in SAR) — opt-in only, a clear "this page is sent to deep.sa" consent each time, never the default; owner decides who pays (own key vs Waraq key behind a Cloudflare function). | Accuracy table in PLAN.md; ≥ 95 % words right on clean printed Arabic, searchable + copy gives correct joined text; tests use the real set. | Send 5–10 real scanned Arabic pages (any typical files) for the test set. |
| B | **Office & CAD** (Word/Excel/PowerPoint, DWG/DXF → PDF) via the 0.3.3 packs (LibreOffice, LibreDWG) + font subsetting in exports. | Convert task works in the desktop app; web shows a clear "desktop only" note; EN+AR; tests green. | — (card already proposed) |
| B2 | **Comment task** (owner yes, 20 Oct): highlight, underline, strike, pen, shapes, arrow, text box, sticky note as standard PDF annotations (MuPDF), move/resize/recolour/delete, one undo step each, EN+AR; plus the translation test (missing/unused keys, placeholder mismatch). | Acrobat shows and edits the comments; tests green; audit green. | **Done 20 Oct** — Comment task (`Comment.svelte`, `engine/annots.ts`): 10 comment kinds as PDF annotations, move/resize/recolour/note/delete, undo per action, written on leaving/saving; `tests/unit/i18n.test.mjs` added. Not yet opened in Acrobat itself; Arabic in a text box is not drawn (Helvetica) — sticky notes carry Arabic. |
| B3 | **Dark modes (owner, 20 Oct): two shades, chosen by hand in the ⋯ menu and remembered — Light (today's paper), Dim ("half dark": deep green-grey, e.g. background #1f2a27, panels #28362f, text #e4ebe6, lines #3a4a43) and Dark ("darker": a darker step of the same palette, e.g. background #0f1513, panels #182019, text #edf2ee). Waraq green stays the accent, lightened (#3fb48f) where it sits on dark so contrast stays ≥ 4.5. Only `tokens.css` changes (every colour is a token already); PDF pages stay as printed (no inverted documents), the desktop top edge follows the theme background. No automatic switch with Windows unless the owner asks. Audit runs in all three. | Three themes pass the audit EN+AR; screenshots of each. | Pick the exact shades from the screenshots. |
| C | **Support (owner, 20 Oct): one page on the website, `pwaraq.com/support` (EN+AR), holds everything; for now it links to GitHub issues only (the owner gives the rest — email, form — later). The app's quiet Help/⋯ item "Report a problem" just opens that page (with version, Windows/browser and language as URL hash so the page can prefill the issue link; nothing sent automatically). Website footer links to it too.** | Page live-ready in the website ZIP; app item opens it EN+AR; audit green. | GitHub issue template OK? Later: email/form. |
| D | **Quality pass** — publishing agent's preview test (steps 3–5), fix every finding; full EN+AR click-through at 1366×768; `pnpm check`, unit, e2e, audit all green on a fresh checkout. | Zero open findings; screenshots in Archive. | Look at the screenshots. |
| E | **Push to GitHub** — subtree pull into PWaraq, scan for private data, `git push --force-with-lease` once (history rewrite), README updated. | Repo shows tshi-dev as author on every commit, licence AGPL-3.0, security policy present. | Say "push". |
| F | **Phase 4a — desktop (Tauri)** — **seamless top edge (owner, 20 Oct): no Windows title bar; the window top is the same paper colour as the app background, one smooth surface with the task bar, our own minimise/maximise/close buttons in Waraq colours, draggable, no border line or colour step, rounded corners and shadow as Windows 11 draws them**, installer, updater, file associations, right-click "Open in Waraq", packs download on first use, offline. | Installed on this PC, every task works from a double-clicked PDF; installer ≤ 0.3.3's size. | Test the installer. |
| G | **Phase 4b — website** — product page + `/app` (Waraq 1.0 web), Report a problem in the footer, download card for the 1.0 desktop app; 0.3.3 stays live until G is approved. | Website ZIP ready for the publishing agent; beta online only when A–F are done. | Yes to go live. |
| H | **Switch 0.3.3 users** — 0.3.3 updater points at 1.0; 0.3.x folder kept for fixes only. | Update tested from an installed 0.3.3. | Yes to publish. |

Order: A and B can run side by side (different files); then C, D, E, F, G, H. Each step = its own session, starts
from CLAUDE.md, ends with screenshots and a plain summary.

**Token plan (owner, 20 Oct 2026; Pro plan = a 5-hour cap shared by every session, then a weekly cap):**
Fable 5.1 only where judgement matters: A (OCR measuring + choice), F (Tauri architecture), and the supervising
session (short turns, no building). Sonnet 5.5 at medium effort for porting/integration/polish: B, C, D, G, H.
Haiku/Sonnet for mechanical steps (E push, screenshot runs, README). Never more than two building sessions at once;
when the 5-hour window passes ~80 %, finish the current step and wait for the reset rather than starting a new one.
Sessions must not re-read the whole hand-over: CLAUDE.md + the one PLAN.md row they work on.

---
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
   asking for the password. Engine: `src/lib/engine/tools.ts`.
   Portfolio round 2 — **done (19 Oct, owner's wishes)**: a **cover page** (up to 3 logos left/centre/right, title,
   subtitle, names, supervisor), **4 designs** for cover and section pages (Classic, Band, Frame, Side), section pages
   **turnable**, **logos on all section pages**, the cover's **title and name on section pages** (small / big),
   **writing-paper pages** (blank, lined, grid, dotted), sections can be **hidden** (name only) or **locked**, page
   numbers **left / centre / right** (the cover is counted, not numbered), a new **page bar** (turn left / right,
   delete) on each page and **Edit page** as the main button of the side panel. Engine: `src/lib/engine/designs.ts`.
   Round 3 (19 Oct, owner: "the cover does not need to be green"): **8 designs** after common academic-cover
   advice (white space, one typeface, colour as accent) — Classic, Minimal, Band, Frame, Side, Split, Geometric,
   Editorial — in **any accent colour** (8 offered: green, navy, charcoal, maroon, teal, gold, plum, black, or own).
   Round 4 (19 Oct): **drag whole sections** by their handle (green line shows where; undo) and a **cover photo** —
   across the top (text on white below) or the whole page under a see-through veil of the accent colour.
3. **Editing & documents:** page editor — **first version done (19 Oct)**, see above; next: text in its own font
   (Arabic with HarfBuzz), redaction tool, forms, OCR (text layer), Office/CAD via packs.
4. **Desktop & website:** Tauri shell, file associations and right-click menu, packs, signed updater, branded
   installer; new product page + /app; switch 0.3.x users over.

## Phase 3 — redact, forms, OCR (20 Oct 2026, done; tasks Redact, Forms, OCR in the task bar)
- **Redact** (`engine/redact.ts`, `Redact.svelte`): drag areas on any page or "mark all" phone numbers (Latin and Arabic digits),
  e-mails, a word; marks are previewed (click one to remove it); apply = MuPDF redaction (text, photo pixels, lines inside are
  removed from the file, black box painted). Option: also remove title/author/dates and XMP. Result replaces the document.
- **Forms** (`engine/forms.ts`, `Forms.svelte`): fields in a right-hand panel (text, checkbox, radio group, choice; read-only
  ones locked), field boxes shown on the pages. Arabic answers keep the real value and get a Tajawal appearance (Helvetica
  cannot draw them). Saved file stays fillable, or "flatten" (`bake`). One line per answer (long Arabic is cut, not wrapped).
- **OCR** (`engine/ocr.ts`, `lib/ocr.ts`, `lib/ocr-clean.ts`, `Ocr.svelte`): pages without text (or all) are drawn at ~250 dpi,
  cleaned (grey, smoothed, stretched, straightened — see OCR v2 below), read by Tesseract (tesseract.js 6, own web worker;
  Arabic-only then Arabic + English, merged line by line), and the lines are written as invisible real text (render mode 3)
  over the page; the picture is untouched. Engine files are **not in git**: `node tools/get-ocr.mjs` copies them from
  `../waraq/dist/vendor/ocr` into `public/ocr/` (19 MB; needed for dev, build and the OCR tests).
- Checks: `tests/unit/{redact,forms,ocr}.test.mjs`, `tests/e2e/{redact,forms,ocr}.spec.ts`, audit extended (EN + AR).
- Leftovers done 20 Oct: long Arabic answers wrap in multiline fields; **Redact** tool in the page editor (drag a box,
  removed on Save page); build checked (`PREVIEW=1`: 33/33).
- Still to do: OCR on photos added as pages in Organize (works after Replace).

### OCR v2 — Arabic that can be measured (20 Oct 2026, done; Plan v2 row A steps 1–3)
- **Test set** `tests/fixtures/ocr/` (8 pages, 870 words, 0.9 MB): NN-name.pdf is a picture-only page like a scan,
  NN-name.txt the correct text. Synthetic until real scans arrive (owner asked): Noto Naskh / Noto Sans Arabic / Tajawal,
  9–13 pt, 150–300 dpi, blurred, grainy, tilted ±1.5°, faded, one invoice and one bilingual page (`make-ocr-set.mjs`).
  Real scans (no personal data) go in beside them as NN-name.pdf + NN-name.txt, typed by hand.
- **Measure** `node tools/ocr-accuracy.mjs` — the app's own code path (tesseract.js in Node, `lib/ocr.ts`, `lib/ocr-clean.ts`):
  words right (how many of the page's words come out exactly, any order) and chars right (100 − character error rate, so
  the numbers compare with the deep.sa benchmark), seconds a page in Node. Tashkeel and punctuation are ignored.
  Options: `--no-clean`, `--passes ara,ara+eng`, `--ara ara_best`, `--dpi`, `--only 03`, `--out folder` (what was read),
  `--engine surya`.
- **Baseline → now** (words right / chars right a page; v1 = one ara+eng pass, no clean-up):

  | page | v1 words | v1 chars | v2 words | v2 chars |
  |---|---|---|---|---|
  | 01 letter, Naskh 12 pt, 300 dpi clean | 96.8 % | 98.6 % | 98.9 % | 99.8 % |
  | 02 article, Tajawal 11 pt, 200 dpi, soft | 97.8 % | 99.5 % | 98.5 % | 99.7 % |
  | 03 invoice, mixed EN/AR, 200 dpi, grainy | 91.7 % | 69.5 % | 97.6 % | 75.3 % |
  | 04 notice, Naskh 13 pt, 200 dpi, tilted 1.5° | 100 % | 100 % | 98.7 % | 99.8 % |
  | 05 contract, Naskh 9 pt small print, 200 dpi | 96.3 % | 98.7 % | 97.8 % | 99.6 % |
  | 06 weather, Sans 12 pt, 150 dpi, faded + grainy | 0 % | 0.5 % | 85.3 % | 90.5 % |
  | 07 report, bilingual, Tajawal 12 pt, 300 dpi, soft | 98.7 % | 94.2 % | 98.7 % | 94.2 % |
  | 08 minutes, photocopy: blur, grain, tilt −1°, faded | 0 % | 0 % | 94.2 % | 99.1 % |
  | **all pages** | **75.3 %** | **70.1 %** | **96.3 %** | **94.8 %** |

  Clean printed Arabic (01, 02, 04, 05) is at 97.8–98.9 % words, 99.6–99.8 % chars: the ≥ 95 % goal is met. The invoice's
  low chars-right is line order in the measurement (mixed-direction table rows), not misread words. Seconds a page in Node:
  4.1 (v1; the unreadable pages took 10–24 s) → 2.1 (v2).
- **What was tried, each measured** (all pages, words / chars):
  1. **Clean-up before reading** (`lib/ocr-clean.ts`, pure, shared by app and tool): grey; a 3×3 smoothing when the paper's
     grain is above 3; contrast stretch only when the paper is not white (mode < 240; stretching white-paper pages made
     Tajawal worse); straightening (tilt from the row profile of a small copy, ±3°, bilinear turn; word boxes turned back).
     75.3 / 70.1 → 95.6 / 94.3. The two unreadable pages became readable (0 → 85 and 94 %). **Adopted.**
  2. **Two passes merged by position**: Arabic-only first, then Arabic + English; where both read the same printed line
     the surer line (Tesseract's confidence) wins, lines only one pass found are kept. A page where the second pass finds
     two or more Latin words on a tenth of the lines is bilingual and keeps that pass whole (the English model misreads
     Arabic as lone Latin "words", so one does not count). 95.6 / 94.3 → 96.3 / 94.8, +50 % time. **Adopted** when both
     languages are ticked. Arabic and English as fully separate passes (ara, eng) was worse: 94.8 / 94.5 with the invoice
     at 83 % — the Arabic-only pass cannot read mixed lines.
  3. **tessdata_best Arabic model** (`node tools/get-ocr.mjs --best`, 12.6 MB float model, Apache-2.0): +0.5 % words
     (94.3 → 94.8 at the clean-up stage then current), 20 % slower, 11 MB more to download. **Not adopted.** Finding: the
     model shipped since 0.3.3 is tessdata's standard LSTM one (the integer form of best), not the small "fast" one
     Plan v2 assumed.
  4. **300 dpi instead of 250**: better on the faded page (+4), worse on clean pages (−1 to −3), equal overall. **Not adopted.**
  5. **Copy order and hit boxes**: every word is written stretched over its own box (`Tz`), the words of a printed line
     in the order they stand on the page; MuPDF joins them into one line and puts a right-to-left line back into reading
     order — copy gives joined Arabic lines (before, every word was its own line) and a search hit sits on the printed
     word (e2e checks the box of "المكتبة" on page 07).
- **Checks**: `tests/unit/ocr-clean.test.mjs` (straight page untouched, tilt found within 0.3° and undone, faded copy
  stretched, pass merge), `tests/unit/ocr.test.mjs` (lines), `tests/e2e/ocr.spec.ts` on the real set (bilingual page;
  the photocopy, unreadable without clean-up). tesseract.js 6.0.1 is a devDependency now (the Node measurement; the app
  still loads `public/ocr`).
- **Surya OCR 2 measured** (step 3; `tools/ocr-surya.py`, venv `.venv-surya`, surya-ocr 0.22 on llama.cpp, CPU, same set,
  same pictures): **99.8 % words right, 96.3 % chars right** (every page 98.8–100 % words; the chars gap is again line order
  on the invoice and the bilingual page), against Tesseract v2's 96.3 / 94.8. The faded page 85 → 100 %, small print
  98 → 100 %. Cost: **45 s a page on this PC's CPU** (llama.cpp, 3.8 GB RAM while running) against 2 s; the add-on it
  would need is llama.cpp's server (24 MB) plus the surya-2 GGUF models (1.27 GB + 0.2 GB) — desktop only, never the web
  app; GPL-3.0 (fine beside AGPL). **Recommendation:** ship Tesseract v2 as the OCR for 1.0 (web and desktop, 19 MB pack,
  ≥ 95 % on clean print); offer Surya OCR 2 later as an optional desktop pack "best quality, slow" for photocopies and
  faded scans, only if the owner wants a 1.5 GB download and a minute a page — most of its gain is on degraded pages.
  Not integrated into the app; `tools/ocr-surya.py` + `node tools/ocr-accuracy.mjs --engine surya` reproduce the numbers.

## Support page (owner, 20 Oct 2026) — replaces the earlier three-way panel
Owner: "for now link to GitHub; I give you the rest later. In the app it opens a support page on the website, and in
this page all will be there." So: one website page `/support` (EN+AR, Waraq colours, quiet footer link) with sections
that grow over time — now: "Report a problem" → GitHub issues (new-issue link prefilled with version/OS/language
from the URL hash) + the public repo; later (owner decides): email, private form. The app (web and desktop) has a
quiet Help/⋯ item "Report a problem" that opens `/support#v=<version>&os=<…>&lang=<…>`; never the user's files,
nothing sent without a click. Build with Phase 4b (website) — or earlier as a small page in `waraq/dist` if the owner
wants it on 0.3.3 too.

## Office & CAD to PDF + font subsetting (step B, 20 Oct 2026, done)
Decision: **conversion is desktop-only.** LibreOffice and LibreDWG are native programs (the 0.3.3 "office" pack), so
the browser build cannot run them and says so ("This works in the Waraq desktop app").
- `src/lib/convert.ts`: file types (doc/docx/odt, xls/xlsx/ods, ppt/pptx/odp, dwg, dxf), the bridge, and `commands()`,
  the exact program lines (DWG → LibreDWG `dwg2dxf` → LibreOffice Draw `draw_pdf_Export`; DXF the same without the first
  step; Office → `pdf`; macros off via the profile, as in 0.3.3 `backend/engines.cjs`).
- **Bridge:** the Tauri shell (Phase 4a) sets `window.waraqDesktop = { convertToPdf(name, bytes) → Promise<bytes> }`
  (Rust runs `commands()` from the pack folder, pack download/SHA-256 as in 0.3.3 `desktop/packs.cjs`, 250 MB DXF cap,
  "plot to PDF" message for huge DWG). Nothing else in the UI changes when it appears.
- UI: Convert → "Word, Excel, PowerPoint, CAD" (choose a file, saves a PDF); opening such a file from the start screen
  converts it and opens the PDF. Web: note + disabled button; start screen shows the same message.
- Tests: unit runs the real LibreOffice pack on a DXF (skipped where `../waraq/engines/win-x64` is missing); e2e uses a
  stand-in bridge. Not tested here: DWG (needs the LibreDWG pack on a real DWG) and the real Tauri bridge (Phase 4a).
- **Font subsetting:** `assemble` calls MuPDF `subsetFonts()` when Waraq embedded its own Tajawal (cover, divider,
  contents, watermark): ~470 KB → ~90 KB on a three-page test, text unchanged. Other exports are not subsetted, so
  fonts of the user's own PDFs stay whole and editable.

## Ideas from AuroraPDF (github.com/KoMAr38/aurora-pdf, looked at 20 Oct 2026)
One-person Windows PDF reader (Python + PyMuPDF + WebView2, AGPL-3.0, 465 tests, also sold in the Microsoft Store).
No Arabic, no Portfolio, no CAD, no browser version — but it has things Waraq 1.0 lacks. Worth taking (AGPL = we may
read and adapt its code with credit in THIRD-PARTY):
1. **Comments** as standard PDF annotations (highlight, underline, strike, pen, shapes, arrow, text box, note; move/resize/
   recolour/delete) so other readers show and edit them — missing in 1.0; add as a task "Comment" (Phase 3.5, before desktop).
2. **Translation test**: one test reads the code, fails on a missing/unused key or placeholder mismatch between EN and AR.
3. **Redaction reach**: also remove comments, form fields, links and tagged-structure text under the box — check ours.
4. **Protection follows copies**: split/extract/compress keep the password and permissions; without the owner password only
   "save as copy" with the same limits.
5. **Certificate signatures** (digital ID, verify signatures in the file, append-only save so earlier signatures stay valid,
   sign into an existing empty signature field) — add to the Sign task later (pyHanko equivalent in JS: pdf-lib + WebCrypto).
6. **Undo = snapshot per change, roll back on failure**; big snapshots to an encrypted temp file (desktop).
7. **Export**: Word (.docx), plain text, pages as PNG/JPG, embedded images; header/footer with page number, date, file name.
8. **Microsoft Store (MSIX)** as a second distribution channel in Phase 4 — the Store signs the package, so no SmartScreen
   warnings and automatic updates without our own code-signing certificate (which the owner declined).
9. **Never overwrite**: exports get "(2)"; removed signatures/IDs go to a folder, not deleted.
10. **CSP** on the app page so text from a PDF can never run as HTML; the Windows title bar painted in the theme colours.
