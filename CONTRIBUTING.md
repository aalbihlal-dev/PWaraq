# Contributing to Waraq

Thank you for helping. Waraq is a small project with a clear aim — **good Arabic and English PDF tools that never send your
files anywhere** — so the most useful contributions are *reports and test files that show a real problem*, then fixes with a
test next to them.

## Before you start
- **Never attach customers' or private documents** to an issue or a pull request. A small PDF you made yourself (or a public
  one whose licence allows it, with the URL) that shows the problem is best. Test files in this repository must be generated
  by a script or public-domain / licence-OK, and small (about 300 kB or less each).
- For a security problem, do not open a public issue — see [SECURITY.md](SECURITY.md).
- The code in `next/` (Waraq 1.0) is brought here from the maintainer's development repository. Open an issue or a pull
  request here as usual; the maintainer carries accepted changes across.

## Build and run Waraq 1.0 (`next/`)
Node.js 22 or newer and pnpm (`corepack enable` gives you pnpm). On Windows use PowerShell.
```bash
cd next
pnpm install
pnpm dev                 # http://localhost:5188 (the first page compiles the 11 MB engine: about a minute)
pnpm build && pnpm preview
```
The desktop shell (`next/src-tauri`) needs Rust (stable, MSVC toolchain) and the WebView2 runtime that comes with Windows 11:
```bash
pnpm desktop             # tauri dev
pnpm desktop:build       # installer; see next/release/README.txt for what it produces
```
The MuPDF WebAssembly engine is committed in `next/engine/mupdf-wasm/dist`; rebuilding it is described in
[`next/engine/README.md`](next/engine/README.md). Waraq 0.3 (`app/`) has its own notes in [`app/README.md`](app/README.md).

## Checks that must be green before a pull request
```bash
pnpm check               # svelte-check: 0 errors, 0 warnings
pnpm test:unit           # engine self-checks in Node (fast)
pnpm test:e2e            # real journeys in Microsoft Edge; PREVIEW=1 after `pnpm build` tests the production build
pnpm stress:quick        # a few seconds: unit, edit, OCR and write suites on a 10 % sample; `pnpm stress` is the full run
```
- The **design audit** (`tests/e2e/audit.spec.ts`) checks every screen in English and Arabic on all four themes. A new screen
  needs an entry there.
- `pnpm stress` compares against `tests/stress/baseline.json` and fails on new problems. If your change makes a number
  better, say so in the pull request; the baseline is re-recorded by the maintainer.

## Design rules (the audit enforces most of them)
- Colours and sizes live only in `src/styles/tokens.css`. Type sizes 12 / 14 / 16 / 18 / 20 / 24 / 32 / 40; contrast at
  least 4.5 : 1; controls at least 36 px; 8 px gaps; sentence case.
- App colours are Waraq's (paper, green, mint, ink); user documents (covers and so on) may use any colour.
- **Every string exists in English and Arabic** in `src/lib/i18n.svelte.ts`; `tests/unit/i18n.test.mjs` catches duplicate keys.
- Drawings must stay crisp at any zoom. Text Waraq writes must be real text (copy and search work), shaped with HarfBuzz
  through `src/lib/engine/fontstore.ts`; never a picture of text.
- No pop-ups for work the page can show in place; no network calls the user did not start.

## Arabic test files
Arabic is the point of the project, so there is a lot of test material and it is generated, not collected:
- `tests/fixtures/arabic/` — about 90 small PDFs of the same Arabic paragraphs from many producers and fonts (Edge print in
  25 fonts, Word, LibreOffice, MuPDF, Waraq's own writers, a CAD-like file), 23 document types and arrangements, and 18 scans
  and hybrids. `tags.json` records each file's type, arrangement and source; the README there says how each is made
  (`tools/arabic/make-corpus.mjs`, `make-corpus-types.mjs`, `make-scans.mjs`, `make-corpus.py`).
- `tests/audit-arabic/` — the editing audit (`tools/arabic/audit-edit.mjs --all`, then `audit-check.py` and `audit-browser.mjs`,
  then `report.mjs`). Start with `tests/audit-arabic/REMAINING-2026-10-22.md`, which lists what is still open and what to try next.
- If you add a file: make it with a script, keep it small, record its tags, and say in the pull request which producer or
  font it is meant to cover. A failing Arabic case with a repro line is a welcome pull request on its own.

## Commits and pull requests
- One change per commit; the first line says what changed *for the user or the document* in plain words ("Page editor lift:
  harakat stay on their letters"), the body says why and how it was checked. English; Arabic examples are welcome.
- Commit only the files you changed; do not commit generated output (`test-results/`, `.stress-cache/`, `dist/`, build folders).
- Describe how you checked it: which of the commands above you ran, and the numbers if a measured suite moved.
- Nothing is published, uploaded or sold on your behalf; releases are made by the maintainer after the checks and a look at the screens.

## Licence
By contributing you agree that your contribution is licensed under the
**GNU Affero General Public License, version 3 or later** (see [LICENSE](LICENSE)), like the rest of Waraq.
New third-party code or fonts need a licence that is compatible with the AGPL and an entry in [THIRD-PARTY.md](THIRD-PARTY.md).
