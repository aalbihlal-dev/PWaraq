# Dev tools (Waraq 1.0)

`drive-window.mjs` opens the dev server in a real, visible window (Electron from ../waraq/node_modules) and drives
it over DevTools: opens a PDF from `public/_test/`, times the first drawing and a deep-zoom tile, optionally runs a
search, saves screenshots, and prints engine job timings (`?timing`). Use this instead of the Claude browser pane
for drawing/performance checks — a hidden pane pauses rendering and gives false results.

    # dev server must be running (pnpm dev  -> http://localhost:5188)
    node tools/dev/drive-window.mjs "<waraq>/node_modules/electron/dist/electron.exe" tools/dev/web-window <file.pdf in public/_test> <screenshot dir> [search term]
    # SETTLE=9000 waits longer before zooming (e.g. to let a cached heavy page warm up)

Automatic journeys: `pnpm test:e2e` (Playwright in Microsoft Edge, tests/e2e).

Screenshot tour of the built app (Arabic, for the owner): `pnpm build`, then
`npx playwright test -c tools/dev/tour.config.ts` (set `TOUR_OUT` for the folder; default `test-results/tour`).
Built-version journeys: `PREVIEW=1 npx playwright test` (after `pnpm build`). Engine self-checks: `pnpm test:unit`.
Test files: `node tests/fixtures/make-fixtures.mjs` remakes `three.pdf` and `photo.png`.
