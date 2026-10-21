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
| B3 | **Dark modes (owner, 20 Oct): two shades, chosen by hand in the ⋯ menu and remembered — Light (today's paper), Dim ("half dark": deep green-grey, e.g. background #1f2a27, panels #28362f, text #e4ebe6, lines #3a4a43) and Dark ("darker": a darker step of the same palette, e.g. background #0f1513, panels #182019, text #edf2ee). Waraq green stays the accent, lightened (#3fb48f) where it sits on dark so contrast stays ≥ 4.5. Only `tokens.css` changes (every colour is a token already); PDF pages stay as printed (no inverted documents), the desktop top edge follows the theme background. No automatic switch with Windows unless the owner asks. Audit runs in all three. | Three themes pass the audit EN+AR; screenshots of each. | Pick the exact shades from the screenshots. **Done:** four themes (Light / Dim / Dark / Graphite) via a moon button next to the language button (start, workspace, Portfolio), `data-theme` on `<html>`, saved in `waraq-theme`, tokens only in `tokens.css`. Calm sage tuning (owner feedback). Dim: paper #22302b, surface #2b3b35, canvas #1c2823, line #3c4d46, ink #e3eae5, muted #a8b9b0, green #5fa98d, green-deep/focus #7dbda4, soft #2c423a, danger #e8806f, text on green #12201b. Dark: paper #17211d, surface #1e2b26, canvas #121a17, line #2b3a34, ink #e8eee9, muted #9fb2a8, same green family, soft #22342d, text on green #101a16. **Graphite** (4th theme, neutral charcoal, cool lean; cycle Light > Dim > Dark > Graphite): paper #1f2226, surface #2a2d32, canvas #181a1d, line #3b4047, ink #e6e8ea, muted #a7adb4, accent #6aa6b8, accent-deep/focus #8bbfce, soft #2b3b42, danger #e8806f, text on accent #101417. PDF pages stay white (`--page`). Audit runs in 3 themes x EN/AR; `theme.spec.ts` checks it survives a reload. |
| C | **Support — website page DONE 20 Oct** (`waraq/dist/support.html`, footer links, issue template in PWaraq; ZIP waits for the owner's yes, OTHER-AGENT-TO-DO step 8). Left: the app's Help/⋯ "Report a problem" item opening `/support#v=…` (with dark modes, same menu). **Earlier text:** (owner, 20 Oct): one page on the website, `pwaraq.com/support` (EN+AR), holds everything; for now it links to GitHub issues only (the owner gives the rest — email, form — later). The app's quiet Help/⋯ item "Report a problem" just opens that page (with version, Windows/browser and language as URL hash so the page can prefill the issue link; nothing sent automatically). Website footer links to it too.** | Page live-ready in the website ZIP; app item opens it EN+AR; audit green. | GitHub issue template OK? Later: email/form. |
| D | **Quality pass — DONE 20 Oct** (report `Archive-2026-10-12/reviews/WARAQ-1.0-QUALITY-PASS-2026-10-20.md`: built app opens a file in 0.3 s, 10 tasks fit at 1366 px EN+AR, only a 16 px slider to fix; the publishing agent's independent test is still open). **Original:** **Quality pass** — publishing agent's preview test (steps 3–5), fix every finding; full EN+AR click-through at 1366×768; `pnpm check`, unit, e2e, audit all green on a fresh checkout. | Zero open findings; screenshots in Archive. | Look at the screenshots. |
| E | **Push to GitHub** — subtree pull into PWaraq, scan for private data, `git push --force-with-lease` once (history rewrite), README updated. | Repo shows tshi-dev as author on every commit, licence AGPL-3.0, security policy present. | Say "push". |
| F | **Phase 4a — desktop (Tauri)** — **first slice built 21 Oct (see "Phase 4a — desktop shell" below; compiled + smoke-tested)** — **seamless top edge (owner, 20 Oct): no Windows title bar; the window top is the same paper colour as the app background, one smooth surface with the task bar, our own minimise/maximise/close buttons in Waraq colours, draggable, no border line or colour step, rounded corners and shadow as Windows 11 draws them**, installer, updater, file associations, right-click "Open in Waraq", packs download on first use, offline. | Installed on this PC, every task works from a double-clicked PDF; installer ≤ 0.3.3's size. | Test the installer. |
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

  | page | v1 words | v1 chars | v2 words | v2 chars | placed |
  |---|---|---|---|---|---|
  | 01 letter, Naskh 12 pt, 300 dpi clean | 96.8 % | 98.6 % | 98.9 % | 99.8 % | 100 % |
  | 02 article, Tajawal 11 pt, 200 dpi, soft | 97.8 % | 99.5 % | 98.5 % | 99.7 % | 100 % |
  | 03 invoice, mixed EN/AR, 200 dpi, grainy | 91.7 % | 69.5 % | 96.5 % | 75.2 % | 96.3 % |
  | 04 notice, Naskh 13 pt, 200 dpi, tilted 1.5° | 100 % | 100 % | 98.7 % | 99.8 % | 100 % |
  | 05 contract, Naskh 9 pt small print, 200 dpi | 96.3 % | 98.7 % | 97.8 % | 99.6 % | 100 % |
  | 06 weather, Sans 12 pt, 150 dpi, faded + grainy | 0 % | 0.5 % | 85.3 % | 90.5 % | 100 % |
  | 07 report, bilingual, Tajawal 12 pt, 300 dpi, soft | 98.7 % | 94.2 % | 98.7 % | 94.2 % | 99.3 % |
  | 08 minutes, photocopy: blur, grain, tilt −1°, faded | 0 % | 0 % | 94.2 % | 99.1 % | 100 % |
  | **all pages** | **75.3 %** | **70.1 %** | **96.2 %** | **94.7 %** | **99.5 %** |

  (v2 words/chars re-measured with the comparison rules of the real set, 20 Oct evening; "placed": see Placement below.)

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
- **Real documents (20 Oct 2026, owner's ask: "use more scanned docs"):** `node tools/get-ocr-set.mjs` builds
  `tests/fixtures/ocr/real/` (git-ignored; sources, licences and sizes in `tests/fixtures/ocr/README.md`): 27 genuinely
  scanned pages with hand-checked text (Misraj-DocOCR, Apache-2.0: book and document scans, accounts, a table, an index;
  freococo/ocr_arabic_books, CC BY-NC-ND: religious books with footnotes and full tashkeel; KITAB-Bench historical
  prints) and 7 pages of public Saudi PDFs with a text layer (CMA circular, MoJ monthly regulations report, GASTAT annual
  report 2024) turned into scans with the same scanner effects, truth = the page's own text layer. The comparison treats
  lam + alef in either order, Arabic-Indic and Western digits, and "2024م" vs "2024 م" as the same (PDF text layers differ
  from OCR in exactly these). No public set had office forms or phone photos of Arabic pages with checked text.
- **Placement** (owner's rule: the text goes onto the same page, each word where it is printed). `tools/ocr-accuracy.mjs`
  writes the layer as the app does and reports **placed** = share of recognised words whose text-layer box (MuPDF's
  structured text, what search and selection use) covers at least 60 % of the recognised word's box turned back to the
  page (box overlap = intersection area / recognised box area). To get there the layer changed again: MuPDF reorders
  right-to-left text per text object, so one object per word scrambled lines with punctuation; now a printed line is
  one `TJ` with each word anchored at its own x (one text object: copy gives the line in reading order, punctuation
  included), a line-level `Tz` makes Tajawal as wide as the printed font, the size and baseline make the box exactly
  the recognised box (MuPDF's glyph box is one em, 0.643 em above the baseline), and a tilted page's whole layer is
  turned back with a `cm` about the picture's centre, so words lie along the printed tilted line. Checks: unit test
  (every word's box covers at least 60 % of its box, a 10°-tilted layer lands within 4 pt, the page count and every
  pixel unchanged), e2e on the tilted page 04 and the photocopy 08 (at least 95 % of layer words have ink under them,
  one page, the picture still there), the bilingual page's hit box. **Known MuPDF limit:** a Latin word inside an
  Arabic line is glued to its neighbour in the copied text and such a line's runs come out in visual order; positions
  and search still work.

  | page | words | words right | chars right | placed |
  |---|---|---|---|---|
  | r-01 CMA circular, letter, 300 dpi | 242 | 90.5 % | 73.6 % | 97.1 % |
  | r-02 MoJ regulations list (names, dates, numbers), 200 dpi grainy | 177 | 62.7 % | 27.5 % | 94.8 % |
  | r-03 GASTAT tracks, dense two-page spread, 200 dpi | 744 | 87.0 % | 28.1 % | 98.6 % |
  | r-04 MoJ report intro, tilted 1° | 110 | 88.2 % | 75.6 % | 100 % |
  | r-05 MoJ gazette list, 150 dpi faded | 187 | 65.2 % | 29.5 % | 96.0 % |
  | r-06 GASTAT definitions spread, two columns, 200 dpi | 424 | 85.8 % | 31.0 % | 100 % |
  | r-07 GASTAT price-index table + info cards, photocopy-style | 254 | 21.7 % | 22.3 % | 92.2 % |
  | s-01…s-05 Misraj-DocOCR (rows 0, 1, 2, 3, 5): book pages, footnotes, a table, tashkeel | 276 / 243 / 262 / 244 / 246 | 67.8 / 66.3 / 71.8 / 63.5 / 90.2 % | 67.6 / 76.9 / 78.2 / 68.1 / 95.4 % | 95–100 % |
  | s-08…s-17 Misraj-DocOCR (rows 19, 24, 27, 28, 33, 35, 37, 39, 43, 44): dense text, accounts, hadith, a table, bilingual title, index of numbers | 283 / 519 / 342 / 516 / 240 / 306 / 178 / 312 / 271 / 306 | 64.0 / 62.6 / 72.5 / 97.9 / 88.3 / 85.9 / 67.4 / 76.6 / 4.4 / 79.7 % | 80.0 / 74.8 / 73.6 / 98.2 / 79.4 / 91.5 / 72.0 / 82.3 / 22.9 / 88.0 % | 95–100 % |
  | s-18…s-25 freococo books (rows 0, 450, 900, 1350, 1800, 2250, 2700, 3500): fully vocalised text, footnotes | 163 / 245 / 245 / 294 / 208 / 251 / 243 / 303 | 93.3 / 46.5 / 36.7 / 36.1 / 54.3 / 34.3 / 51.9 / 54.8 % | 95.5 / 60.7 / 54.8 / 39.0 / 64.3 / 50.8 / 62.9 / 60.1 % | 93–99 % |
  | s-06, s-07, s-26, s-27 KITAB historical prints | 68 / 73 / 72 / 70 | 0 / 0 / 1.4 / 2.9 % | 11 / 0 / 24 / 24 % | 85–100 % |
  | **synthetic (8)** | 871 | **96.2 %** | 94.7 % | **99.5 %** |
  | **real, rendered (7)** | 2138 | **75.5 %** | 41.1 % | **96.9 %** |
  | **real, scanned (27)** | 6779 | **62.2 %** | 62.8 % | **96.5 %** |
  | **all (42)** | 9788 | **68.2 %** | 65.3 % | **97.2 %** |

  (Per-page numbers from the 20 Oct run; the 30 % bilingual rule of 21 Oct moved single pages up by up to 9 points —
  s-10 72.5 → 80.1, 06 85.3 → 90.8, r-05 65.2 → 70.1 — and none down. Totals after it: the before/after table below.)

  Reading: plain printed text on real pages reads at 86–98 % words (CMA circular, MoJ intro, GASTAT spreads, clean
  Misraj scans s-11, s-12, s-18) — real fonts, footnote marks, logos and page furniture cost a few points against the
  synthetic set. Chars-right on spreads, lists and tables is mostly reading order (the truth's order differs from
  Tesseract's), not misread letters. Weak spots, each with a one-line proposal: (1) fully vocalised text (freococo:
  34–55 %) and heavy tashkeel (Misraj: 63–72 %) — the comparison already ignores harakat, so this is Tesseract's Arabic
  model stumbling on them: the Surya route; (2) tables of dates and numbers in small print (r-02, r-05: 63–65 %) and an
  index of Arabic-Indic numbers (s-16: 4 %) — read number columns at 300 dpi or with a digits-only pass; (3) info cards
  with white text on a dark background and charts (r-07: 22 %) — find dark boxes and invert them before reading;
  (4) historical prints (0–3 %) — Surya only. Tried on the real pages and not adopted: dropping words Tesseract is unsure
  of (confidence < 30): 75.5 → 74.6 % words; 300 dpi: 73.9 % (the photocopy table falls to 12 %).
- **Why the scanned pages lose words (diagnosis, 20 Oct late):** 6779 truth words on the 27 scanned pages, 2561 lost
  (37.8 %). Words right is order-free, so reading order (spreads, columns, tables) costs nothing there — it only
  lowers chars right. The lost words by cause (a truth word Tesseract did not produce; a near miss is a read word one or
  two letters away from it):

  | cause | share of lost words | share of all words |
  |---|---|---|
  | word garbled or not read at all | 40.6 % | 15.3 % |
  | a number (Arabic-Indic or Western digits) | 21.7 % | 8.2 % |
  | two letters wrong | 11.9 % | 4.5 % |
  | a one- or two-letter word (particles, footnote marks) | 8.7 % | 3.3 % |
  | a Latin word in an Arabic page | 8.2 % | 3.1 % |
  | one letter wrong | 7.9 % | 3.0 % |
  | spelling variant only (alef/hamza, yaa/alef maqsura, taa marbuta/haa) | 1.0 % | 0.4 % |

  The garbled share follows the tashkeel density of the page: freococo pages with 0.26–0.43 marks per letter lose
  50–65 % of their words, Misraj pages with few marks lose 10–35 %, the one clean Misraj page (s-11) 2 %. Numbers come
  mostly from one index page (s-16: 244 of its 271 words are numbers, nearly all lost) and footnote references. The
  comparison is fair: harakat, tatweel, punctuation, digit systems and lam-alef order are already ignored, and loosening
  spelling further would recover only 1 % of the lost words. Page-level causes seen by eye: full vocalisation (freococo),
  old prints (historical books), small footnote type and Latin terms (Misraj). Skew is under 2.3° on every page.
- **Cheap wins tried on the 27 scanned pages (21 Oct; words / chars right, placed):** shipped two-pass pipeline 62.2 /
  62.8 %, 96.5 %. tessdata_best Arabic: 62.2 / 62.8 (no change). Sauvola page binarisation instead of Tesseract's own:
  60.8 / 62.1, placed 94.8 (worse). Straightening up to ±10°: no change (every page is under 2.3°). Dark borders cropped:
  no change (the scans have none). 300 dpi: 61.8 / 61.9 (worse). Page segmentation psm 6 (one block): 63.2 / 63.6 but
  placed 94.8 (lines merge across columns) — not adopted; psm 1 needs the OSD model, which the pack does not ship.
  **Arabic only (English unticked): 67.7 / 72.4 %, 1.5 s a page** — the English model reads scanned Arabic books as
  Latin junk and the line merge then keeps those lines; on bilingual pages Arabic-only cannot read the Latin. A
  confidence margin in the merge changed nothing; letting only lines with real Latin words win was worse (62.8).
  **Adopted:** the "bilingual page" rule now needs Latin words on 30 % of the lines instead of 10 % (the English model's
  junk on book scans tripped it): scanned 62.2 → 63.1 %, synthetic 96.2 → 96.9 %, rendered 75.5 → 76.4 %, placement
  unchanged. Advice for the owner's help text: untick English for Arabic-only books and photocopies (+5 points, 3× faster).
- **Surya OCR 2 on the real set** (`--engine surya`, llama.cpp on this CPU, one page at a time, same cleaned pictures):
  rendered 7 pages **90.5 % words** (chars 50.3 % — reading order of spreads and lists), 82 s a page (the two-page spreads
  take 100–160 s); scanned 27 pages **91.9 % words, 92.5 % chars** (Misraj 76–98 %, the vocalised freococo books 94–100 %, historical prints 39–63 %), 59 s a page. Placement is not measurable for Surya here: Surya 2 returns layout
  blocks, not word boxes, so its text would be written one block at a time (0–29 % "placed" by the word rule); an
  integration would need its line boxes from the block HTML before the text layer can be per word.
- **Before / after (words right / chars right / placed; 21 Oct):**

  | group | Tesseract v2 (20 Oct) | Tesseract v2 + 30 % rule (shipped) | Surya OCR 2 (measured, not shipped) |
  |---|---|---|---|
  | synthetic (8 pages, 871 words) | 96.2 / 94.7 / 99.5 % | **96.9 / 95.3 / 99.5 %** | 99.8 / 96.3 / n/a (20 Oct) |
  | real, rendered from public PDFs (7, 2138) | 75.5 / 41.1 / 96.9 % | **76.4 / 41.4 / 96.5 %** | 90.5 / 50.3 / n/a |
  | real, genuinely scanned (27, 6779) | 62.2 / 62.8 / 96.5 % | **63.1 / 64.1 / 96.5 %** | **91.9 / 92.5 / n/a** |
  | all (42, 9788) | 68.2 / 65.3 / 97.2 % | **69.0 / 66.2 / 97.1 %** | — |
  | seconds a page (this CPU, Node) | 4.7 | 4.6 (Arabic only: 1.5) | 59 scanned, 82 rendered |

- **Recommendation (21 Oct):** ship Tesseract v2 as the default OCR in both the web and the desktop version (19 MB pack,
  fast, words placed ≥ 95 %), with an honest line in the OCR help text: clean office prints read at 90–99 %, scanned
  books, photocopies and vocalised text read less well, and English can be unticked for Arabic-only pages. Offer Surya
  OCR 2 later as an optional desktop add-on pack ("best quality, slow": ~1.5 GB models + llama.cpp, about a minute a page
  on a CPU, GPL-3.0 beside AGPL) for scanned books and photocopies, after its line boxes are wired to the per-word text
  layer so placement stays ≥ 95 %. The web version stays Tesseract; a cloud option (alOCR) is a separate decision the
  owner has not taken.
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

## Phase 4a, second slice — installer, updater, add-on packs, Store package (step F, 21 Oct 2026; NOT released)
Release gate stands: everything below is built and tested locally only; `release/` holds the installer, `.sig` and MSIX
(git-ignored), `release/README.txt` the size + SHA-256, `release/TEST-REPORT.md` the test tables.
- **Installer** (`pnpm desktop:build` → `release/Waraq_<v>_x64-setup.exe`, 27.8 MB vs 147 MB for 0.3.3): NSIS, per-user,
  no admin, English/Arabic by the Windows language (the language dialog had to go: it blocks the passive update
  install), Waraq header/sidebar art from 0.3.3, Start-menu shortcut, desktop shortcut optional (tick on the finish
  page; silent installs make it), uninstall entry, WebView2 bootstrapper when missing, `/S` (+ `/D=dir`) silent.
  `src-tauri/installer/hooks.nsh`: `.pdf` is *offered* (`OpenWithProgids` + ProgId `Waraq.PDF`, default handler
  untouched), `.waraq` owned (Tauri file association, ProgId `Waraq.Portfolio`), right-click "Open in Waraq" on both
  (`SystemFileAssociations\.<ext>\shell\OpenInWaraq`), all HKCU, removed on uninstall. The version comes from
  `package.json` (`tauri.conf.json` → `"version": "../package.json"`). Test: `tools/dev/installer-test.ps1` (29 checks:
  silent install into `%LOCALAPPDATA%\WaraqInstallTest`, keys, ShellExecute of a PDF with the verb → window, second
  file → same window, silent uninstall leaves nothing). No 0.3.3 is installed on this PC, so the full test ran.
- **Updater** (`src-tauri/src/update.rs`, `src/lib/update.svelte.ts`): `tauri-plugin-updater` against
  `https://www.pwaraq.com/downloads-1.0/manifest.json` (URL only — nothing uploaded; `tools/dev/update-manifest.mjs`
  prints the manifest with the `.sig` and the installer's SHA-256). Minisign key pair in `../Backups/keys-private/`
  (private key + password file + README: keep offline, back up; public key in `tauri.conf.json`). Check once a day at
  start and on "Check for updates" (start screen row with the version); a found update downloads in the background
  (signature by the plugin, SHA-256 against the manifest by us) and waits for the click "Restart to update" — never
  silent. Rollback: the installer hook keeps every installed version's setup in `%APPDATA%\com.waraq.app\updates\`;
  a start writes `boot`, the page's `app_started` clears it and writes `last-good`; if `boot` is still there at the next
  start and this version never became `last-good`, the last good version's installer runs silently (`/S /R`), the
  failed version is `skip`ped and the start screen says "Version X did not start, so Waraq went back to Y". The
  previous installer stays until the new version has started once (then one older copy is kept). Test:
  `tools/dev/updater-test.mjs` (two signed builds 0.0.1 → 0.0.2 under identity `com.waraq.test`, local manifest server,
  CDP-driven click, relaunch, simulated failed start → rollback, skip). Store builds (marker file `store-build`) never check.
- **Add-on packs** (`src-tauri/src/packs.rs`, `convert.rs`, `src/lib/packs.svelte.ts`, `PackPrompt.svelte`): the first
  Office/CAD conversion asks "Download the Office & CAD add-on (137 MB)?" (EN/AR, Download / Not now); after the click
  the shell fetches `https://www.pwaraq.com/packs/manifest.json`, accepts only the pack whose SHA-256 is pinned in
  `src-tauri/packs.json` (the 0.3.3 office pack), downloads the 16 MB pieces 4 at a time (each piece checked, the whole
  checked), unpacks zstd+tar into `%APPDATA%\com.waraq.app\engines\office\` (progress events, Cancel), then
  `convert_to_pdf` runs LibreOffice / LibreDWG headless on a temp copy (macros off, no window, 3 min per program,
  cancel, temp folder removed) and returns the PDF. The OCR pack is not needed (web OCR files are bundled). Fixtures:
  `tests/fixtures/office/` (made by `make-office.mjs`: Word with real Arabic, Excel, PowerPoint, DXF via ezdxf, DWG via
  LibreDWG). Tests: `tests/unit/convert.test.mjs` (all five through the pack, Arabic stays text, ~13 s each),
  `cargo test` (Rust converter on the DXF), `tests/e2e/packs.spec.ts` (prompt, progress, Not now), `tools/dev/packs-test.mjs`
  (the real download + conversions in the built app).
- **Microsoft Store:** `packaging/msix/` (manifest with PLACEHOLDER identity, assets, `build.ps1` → `release/Waraq_<v>.msix`
  with MakeAppx from the Windows SDK 10.0.26100.0 found on this PC, README with what the Store needs). Prepared only.
- **Remains:** owner decisions (Store account, privacy page, code signing stays declined → SmartScreen note), the
  real manifest + installer on pwaraq.com after the release gate, a hand test of the add-on download on a slow line,
  the items of the first-slice list below that are still open (drag-over highlight, CSP, overlay scrollbars…).

## Phase 4a — desktop shell with Tauri 2 (step F, 21 Oct 2026, first slice)
Built in `src-tauri/` (Rust, ~110 lines) + `src/lib/desktop.ts` + `TitleBar.svelte`; the web build is untouched
(`desktop.ts` does nothing when `window.__TAURI__` is missing; `tests/e2e/desktop.spec.ts` checks both). **Compiled and
smoke-tested 21 Oct** (Rust installed via winget with the owner's yes): `three.pdf` from the command line is drawn in all
four themes and in Arabic, the top edge is one flat colour from the window edge into the task bar (checked pixel by pixel),
a second launch hands its file to the running window. Screenshots: `Archive-2026-10-12/screenshots/desktop-tauri/`.
- **Decided:** Tauri 2 with the global API (`withGlobalTauri`, no npm `@tauri-apps/api`), identifier `com.waraq.app`,
  icon from `../Designs/Logo` (`pnpm tauri icon`). Frameless window (`decorations: false, shadow: true`); the page draws a
  40 px bar in the paper colour (surface colour once a document is open, so bar and task bar are one flat surface),
  draggable, double-click maximises, our own minimise / maximise / close (36 px, Waraq hover colours). The buttons stay
  top-right in Arabic too (the corner Windows uses; Edge, VS Code do the same). The 1 px DWM border Windows 11 draws
  round a frameless window (accent-coloured when "show accent colour on borders" is on) is switched off
  (`DWMWA_BORDER_COLOR = none`), so only the shadow and the rounded corners remain.
- **Files:** native Open/Save dialogs (`tauri-plugin-dialog`), bytes read/written by our own Rust commands (`read_file`,
  `write_file` via a temp file + rename; text arguments ride percent-encoded in headers). "Save" writes straight back to
  the opened path, "Save as" when there is none or writing fails; every other export goes through the Save-as window.
  Recent files keep the path. A file on the command line (double-click, file association `.pdf` / `.waraq` in the NSIS
  bundle), a second launch (`tauri-plugin-single-instance` → `open-paths` event) or a file dropped on the window
  (`tauri://drag-drop`) opens in the running window. Window size/position remembered (`tauri-plugin-window-state`).
- **Converter bridge:** `convert_to_pdf(name header, bytes body) → PDF bytes | error`; `desktop.ts` sets
  `window.waraqDesktop.convertToPdf` exactly as `convert.ts` expects. The command answers `NO_PACKS` until the packs
  session wires LibreOffice/LibreDWG (then the UI's "conversion failed" becomes a real result).
- **Scripts:** `pnpm desktop` (dev), `pnpm desktop:build` (NSIS installer), `pnpm desktop:smoke`
  (`tools/dev/tauri-smoke.mjs`: debug build, starts the exe with `three.pdf` per theme + Arabic, `win-shot.ps1`
  screenshots the window and checks the flat top edge and the drawn page). Debug builds read `WARAQ_UI=<theme>,<lang>`.
- **Remains (next sessions):** installer polish (NSIS header/sidebar, Arabic texts, ≤ 0.3.3 size), updater
  (`tauri-plugin-updater`, signing key — owner declined a code-signing certificate, so SmartScreen warning or MS Store),
  MSIX / Microsoft Store, right-click "Open in Waraq" (registry in the installer), packs download on first use + the real
  converter, drag-over highlight in the Tauri window (DOM drop events do not fire there), a CSP on the app page, dark
  window background before the page loads (today paper-light for a frame), portfolio `.waraq` save path, overlay
  scrollbars (WebView2 shows classic ones; the Edge flag `msOverlayScrollbarWinStyle` did nothing), native Open/Save
  dialogs and Save-to-path not yet clicked through by hand (code path only), bundle identifier `com.waraq.app` warns on
  macOS (`.app` suffix) — harmless on Windows, rename before any Mac build.

## Ideas from AuroraPDF (github.com/KoMAr38/aurora-pdf, looked at 20 Oct 2026)
One-person Windows PDF reader (Python + PyMuPDF + WebView2, AGPL-3.0, 465 tests, also sold in the Microsoft Store).
No Arabic, no Portfolio, no CAD, no browser version — but it has things Waraq 1.0 lacks. Worth taking (AGPL = we may
read and adapt its code with credit in THIRD-PARTY):
1. **Comments** as standard PDF annotations (highlight, underline, strike, pen, shapes, arrow, text box, note; move/resize/
   recolour/delete) so other readers show and edit them — missing in 1.0; add as a task "Comment" (Phase 3.5, before desktop).
2. **Translation test**: one test reads the code, fails on a missing/unused key or placeholder mismatch between EN and AR.
3. **Redaction reach**: also remove comments, form fields, links and tagged-structure text under the box — check ours.
   **Done 21 Oct 2026:** redact() also removes comments/highlights/notes, form fields (value too, also the parent's), links under a mark and Alt/ActualText of tagged structure on redacted pages; unit test with a fixture (raw-stream search).
4. **Protection follows copies**: split/extract/compress keep the password and permissions; without the owner password only
   "save as copy" with the same limits.
   **Done 21 Oct 2026:** Extract, Split, Compress keep algorithm, password and permissions (`sealLike` in tools.ts); unlock/protect refuse a file with limits without its owner password (NEED_OWNER, EN+AR); Protect screen offers only "save a copy with the same limits". Not yet: Save after Organize/Comment (App.svelte reopens plain bytes).
5. **Certificate signatures** (digital ID, verify signatures in the file, append-only save so earlier signatures stay valid,
   sign into an existing empty signature field) — add to the Sign task later (pyHanko equivalent in JS: pdf-lib + WebCrypto).
6. **Undo = snapshot per change, roll back on failure**; big snapshots to an encrypted temp file (desktop).
7. **Export**: Word (.docx), plain text, pages as PNG/JPG, embedded images; header/footer with page number, date, file name.
8. **Microsoft Store (MSIX)** as a second distribution channel in Phase 4 — the Store signs the package, so no SmartScreen
   warnings and automatic updates without our own code-signing certificate (which the owner declined).
9. **Never overwrite**: exports get "(2)"; removed signatures/IDs go to a folder, not deleted.
   **Done 21 Oct 2026:** `uniqueName` / `addUnique` in src/lib/names.ts used for ZIP entries (split, page images); the desktop wrapper can use it for file paths. (Removed-signature folder: not yet.)
10. **CSP** on the app page so text from a PDF can never run as HTML; the Windows title bar painted in the theme colours.

## Certificate signatures (Sign task, 21 Oct 2026) — decision before code
Standards-based digital signatures next to the drawn set (AuroraPDF idea 5). Checked first: the engine build has no
signing API, but `saveToBuffer('incremental')` appends an update that keeps every earlier byte, encrypts new strings
and streams with the file's own key, and leaves a /Sig /Contents string unencrypted (tested, plain and AES-256).
- **No new dependency.** pkijs/asn1js (~150 kB gzip) would still not open legacy .pfx files; node-forge is big. So
  `src/lib/engine/der.ts` (DER read/write, ~80 lines) + WebCrypto do everything: X.509 self-signed certificate, CMS
  SignedData (SHA-256, RSA PKCS#1 v1.5 2048 or ECDSA P-256, ESS signing-certificate-v2 → PAdES-B-B, SubFilter
  ETSI.CAdES.detached), PKCS#12 import (PBES2/AES, and the legacy pbeWithSHAAnd3-KeyTripleDES / RC2-40 with a small DES
  and RC2 in `src/lib/engine/pfx.ts`), RFC 3161 request/response. Pure modules, Node-testable (`tests/unit/certsign`).
- **Signing** (`src/lib/engine/signcert.ts`, worker op `sigprepare`): the engine adds the field widget (or fills the
  clicked empty /Sig field), an appearance built with `editPage` on a blank page (the same signature set: picture, name,
  date → Arabic shaped as everywhere else), the /Sig dict with a zero /Contents placeholder and a ByteRange placeholder,
  then saves incrementally; the main thread hashes the two ranges, builds the CMS with the unlocked key and writes the
  hex in place. Other placed sets are drawn into the pages first, so the signature covers them. Protected files stay
  protected (the update is encrypted by the engine with the open password). Counter-signing = another increment.
- **Digital IDs** (`src/lib/ids.ts`): IndexedDB store `ids` (db v3): certificate DER in the clear, the PKCS#8 key
  AES-GCM-encrypted with a key from the person's passphrase (PBKDF2-SHA-256, 600 000 rounds, random salt). The
  passphrase is typed when signing and kept only in memory for the sitting; a .pfx password is never kept. Remove = delete.
- **Verify** (worker op `siglist` + `verifyCms`): every /Sig with a V: ByteRange hash, CMS signature, certificate
  dates, self-signed → "not in a trusted list" (Waraq has no trust store: it checks the maths, not who the signer is),
  whole file covered or only an earlier revision; "changed after signing" when the last signature does not reach the
  end. Shown in the Sign panel ("Signatures in this file") and as a badge in its toolbar.
- **Timestamp**: off by default; only to a URL the person types, with the note that a hash is sent, never the document.
- Not done: Acrobat not tested on this PC (OpenSSL cross-check instead); the warning before Save in App.svelte (owned by
  another session; `willBreakSignatures()` in `src/lib/engine/pades.ts` is ready for a two-line hook).

**Built (21 Oct 2026):** as decided above. Sign task: toolbar badge ("1 signature · Valid / Changed after signing /
Invalid"), "Signatures in this file" panel (signer, time, page, verdict, self-signed note, reason/location, timestamp),
"Digital ID (certificate)" section (new ID: name, email, RSA 2048 or P-256, 1–10 years, passphrase; import .pfx/.p12;
passphrase typed once per sitting; reason, location; timestamp URL off by default), a warning bar when a drawn set would
invalidate existing signatures. Checks: `tests/unit/certsign.test.mjs` (7: sign+verify, one byte changed, appended
change, counter-sign, protected file, existing field, .pfx modern/legacy/EC, OpenSSL both ways),
`tests/e2e/certsign.spec.ts` (2, EN+AR), ID form in the audit. Screenshots:
`../Archive-2026-10-12/screenshots/waraq-1.0-preview/certsign/`. Still to do: the Save hook in App.svelte (see
side-session note certsign-notes.md), a badge outside the Sign task, verifying the timestamp server's own signature.

## .waraq robustness (owner asked 21 Oct 2026: "is .waraq not failing, even with the website?") — to build after the desktop slice
Round trip is tested (portfolio.spec). Gaps found by reading `openPortfolioFile` (App.svelte) / `portfolio.ts`:
1. a damaged or foreign `.waraq` shows "not a PDF" → say "not a valid Waraq portfolio" (EN+AR);
2. no `app === 'waraq-portfolio'` / `version` check → "made with a newer Waraq" instead of opening blindly;
3. entry names and `manifest.id` unvalidated → reject names with `..`, `/`, `\`, drive letters, absolute paths, and ids that are not `[a-z0-9-]`; cap entry count and total unzipped size (zip-bomb); needed BEFORE the desktop app writes them to disk;
**Done 21 Oct 2026 (Sonnet session):** `parse()` in portfolio.ts (manifest/version/id/entry-name checks), `unzip` limits + checksum, messages `portfolioInvalid`/`portfolioNewer`; tests waraq-file.test.mjs + waraq-file.spec.ts (the .waraq double-click on desktop is not run yet).
4. tests: corrupt zip, wrong manifest, newer version, path-traversal entry, 200 MB portfolio, Arabic names; desktop: double-click a `.waraq` (file association is in tauri.conf.json, never run yet).

## Recovery plan (owner, 21 Oct 2026: "we also need a recovery plan")
**A. Never lose a person's work (build with Phase 4a/b; one Sonnet session after the desktop slice)**
1. **Safe save:** write to a temp file next to the target, verify it opens with MuPDF (page count, text spot-check), then replace; keep the previous version as `name.bak.pdf` (one generation) until the next successful save; never overwrite in place (desktop: write-then-rename; web: download only).
2. **Autosave drafts:** every edit session keeps a draft of the changed document (pages, annotations, portfolio state) in the app's local storage (OPFS / app data folder) every 30 s and on each undo step; on the next start, if the last session did not close cleanly, the start screen offers "Restore your unsaved work from <time>" (EN+AR) — keep 5 drafts, delete after 30 days or when saved.
3. **Crash and freeze guard:** a worker/engine crash restarts the pool and keeps the document bytes and undo stack (today `pool.reset()` loses nothing on disk but not the in-memory edits); show "Waraq recovered — nothing was lost" instead of a blank page; a hung job gets a Cancel button.
4. **Undo everywhere:** Undo after Close (0.3.x had it), after Save, and after "Discard changes" for 10 minutes (draft kept).
5. **Portfolio:** autosaved to its folder in app storage on every change (today on demand); `.waraq` export is the portable backup; "Restore previous version" lists the last 5 saved states.
6. **Damaged files:** opening a broken PDF tries MuPDF repair, then offers "Open what could be read" with the page count; wrong password and truncated files get plain messages (EN+AR).
7. **Crash log and report (owner, 21 Oct):** every crash is saved automatically on the device — JS errors and unhandled rejections (window.onerror, `unhandledrejection`), engine/worker failures, and in the desktop app Rust panics and a hard exit (a "clean exit" marker file: if it is missing at the next start, the last run crashed). Each entry: time, Waraq version, Windows/browser, language, theme, the task open, the job that failed, the stack trace and the last 50 log lines — **never document content, file names or pages** (file names replaced by "file.pdf"). Kept in `crash-log/` (app data folder / browser storage), last 20, 30 days. On the next start: "Waraq closed unexpectedly. Your work was restored. Send a report?" with **Preview** (the exact text, EN+AR), then three buttons: Send by email (mailto support@pwaraq.com prefilled, the log attached on desktop), Report on GitHub (prefilled issue, trimmed to fit), or Don't send; plus a tick "Always ask" (never "always send" without the owner's later decision — nothing leaves the device without a click, as the support page promises). Settings → "Open crash log folder" and "Copy report". Later (owner decides): private form endpoint so reports need no mail app.
   **Part A items 1-6 built 21 Oct 2026 (Sonnet session):** safe save (src-tauri/src/safe.rs + desktop.ts, page-count check via worker `verify`), drafts (drafts.ts, session.ts: Web Lock unclean-exit check), engine crash/hang guard (pool.ts `recover`, Notice.svelte), Undo close (10 min, start screen), damaged-PDF repair (`repair` op), portfolio versions (last 5, menu in Portfolio). Not built: Undo after Save / after Discard.
   **Item 7 (crash log and report) built 21 Oct 2026 (Sonnet session):** crashreport.ts (clean text, preview, mail/GitHub links), crashlog.ts (entries, 20/30 days, console + errors), CrashReport.svelte dialog, Rust panic hook + `open_external`; start-screen buttons Copy crash report / Open crash log folder. Desktop email: mailto cannot attach, so the log file is shown in Explorer to attach by hand.
8. **Tests:** kill the engine mid-edit, kill the app mid-save (the target is either the old file or the new, never half), restore a draft, a broken PDF, 5-draft rotation.

**B. Never lose the project (owner decisions needed at 3 and 4)**
1. **Source:** GitHub (tshi-dev/PWaraq) is the main copy; **offline backups (owner, 21 Oct): `PDF Open Source\Backups\<date>\` with a verified `git bundle` per repo (waraq-next, PWaraq, waraq) + SHA256SUMS + README; first set made 21 Oct 2026; new dated set monthly and before big changes. Same disk as the project, so a disk failure would take both — copy the newest folder to a USB stick now and then.**
2. **Website:** every Cloudflare Pages deployment is kept; rollback = "Rollback to this deployment" in the dashboard; before each upload the publishing agent notes the current deployment id in OTHER-AGENT-TO-DO Results. Keep the last 3 website ZIPs in `waraq/publish`.
3. **Releases:** keep every installer + SHA-256 + manifest per version (`release-full/`, later GitHub Releases) so a bad update can be pulled and the old version pinned; the updater never removes the previous version until the new one starts.
4. **Secrets and accounts:** the owner keeps recovery codes for Cloudflare, GitHub (2FA) and the domain registrar in a password manager; write a one-page "if I lose access" list (account, recovery method, where the code is — no secrets in the repo).
5. **Update safety:** the updater downloads, verifies SHA-256, installs beside the old version and rolls back on a failed start.

**Support email — set up 21 Oct 2026 (owner's yes, done in his Chrome):** Cloudflare Email Routing for pwaraq.com: 3 MX (route1-3.mx.cloudflare.net), DKIM `cf2024-1._domainkey`, SPF `v=spf1 include:_spf.mx.cloudflare.net ~all`; rule `support@pwaraq.com` → `pdfwaraq@gmail.com` (verified, Active). Catch-all left as it was. Not yet tested with a real email; not yet shown on the website — add the address to `/support` when the owner says so (then mail + the private-form idea become possible).

## Arabic quality program (owner, 21 Oct 2026: "edit Arabic PDF has major issues throughout the software — take your time, run all the sessions you need")
Arabic is the product's most important promise; it blocks the release. Order: (1) **audits** (read-only, evidence): A = editing existing Arabic text (corpus of 30–50 PDFs from many producers/fonts; Waraq vs reference rendering vs MuPDF/pdf.js/Edge-PDFium), B = every place Waraq creates Arabic (page editor, comments/FreeText appearance streams, forms, sign, watermark, numbers, portfolio, metadata, bookmarks); reports in Archive-2026-10-12\reviews\ARABIC-{EDIT,CREATE}-AUDIT-2026-10-21.md; (2) **fix work packages** taken from the reports (likely: one shared font service — fallback chain Noto Naskh/Tajawal/Amiri…, real subsetting, ToUnicode, embedded appearance fonts for annotations; shaping/bidi fixes; fidelity); (3) **Arabic regression suite** from the corpus runs in CI-style (`pnpm test:arabic`) and must be green before any release clearance; (4) the converter font (0.3.x pack path) is part of it. No release clearance asked until (3) is green.

## Stress-test pipeline with (almost) no tokens (owner, 21 Oct 2026) — `pnpm stress`
Scripts do everything; an AI only reads a one-page summary. Orchestrator (~300 lines) over the existing checkers (tools/arabic/*, tools/ocr-accuracy.mjs, tests/unit): (1) generate/fetch corpus (Arabic PDFs × fonts × producers; scans with blur/tilt/shadow/fade; public OCR sets by fetch script only), (2) run the real engine on edit/write/OCR cases, (3) numeric judges (exact Unicode, joining/tofu, position/fidelity, size, image diff vs reference in MuPDF + pdf.js + Edge), (4) compare with `tests/stress/baseline.json` and report ONLY regressions in `stress-report.md` (+ exit code; thresholds: 0 major, OCR placement >= 95 %), (5) optional Haiku triage of failing cases only. Runs nightly/idle via Windows Task Scheduler (`tools/stress/schedule.ps1`, owner's PC), no tokens while running. Doubles as the Arabic regression gate for the release.

## iPhone and iPad (owner, 21 Oct 2026) — LATER, only when every other version (web, Windows, Store) is stable
Not started. Notes for then: the web app already runs the same engine in the browser, so a first step is an installable PWA for iPad/iPhone Safari (touch UI: bigger targets, pinch zoom, a compact bottom task bar instead of the 10-button row, Files-app open/save through the file picker/share sheet, no right-click, memory limits of iOS Safari for big drawings and OCR — measure); a native app is a second step (Tauri 2 mobile/iOS or a thin WKWebView shell; needs a Mac + Apple developer account, App Store review, no Office/CAD pack there, no Surya). Decide after the Windows release and real users' feedback.
