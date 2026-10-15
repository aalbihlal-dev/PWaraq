# Waraq 1.0 — plan (15 October 2026)

Owner's rating of 0.3.x: 6/10. Waraq 1.0 is a rebuild next to the live 0.3.x (in `../waraq`), switched over only
when 1.0 is better at every everyday task.

## Decisions (owner, 15 Oct 2026)
- **Open source, GNU AGPL v3 or later**, with **MuPDF** as the PDF engine (0.3.x relicensed the same day).
- **Rebuild alongside** 0.3.x, in phases that each ship something usable.
- **Tauri** desktop shell (Windows' built-in WebView2) instead of Electron.

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

## Phases (each ships)
1. **Foundation:** project, custom MuPDF WASM build, worker pool, viewer (large drawings, zoom/pan, thumbnails,
   search), new workspace shell, Open/Close/Recent, end-to-end test harness. Ships as "Waraq 1.0 preview".
2. **Organize & everyday tools:** reorder/rotate/delete/insert, merge, split, compress, crop, page numbers,
   watermark, sign, protect/unlock, export.
3. **Editing & documents:** real text/image editing (Arabic with HarfBuzz), redaction, forms, OCR (text layer),
   Office/CAD via packs.
4. **Desktop & website:** Tauri shell, file associations and right-click menu, packs, signed updater, branded
   installer; new product page + /app; switch 0.3.x users over.
