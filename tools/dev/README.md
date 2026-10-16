# Dev tools (Waraq 1.0)

`drive-window.mjs` opens the dev server in a real, visible window (Electron from ../waraq/node_modules) and drives
it over DevTools: opens a PDF from `public/_test/`, times the first drawing and a deep-zoom tile, optionally runs a
search, saves screenshots, and prints engine job timings (`?timing`). Use this instead of the Claude browser pane
for drawing/performance checks — a hidden pane pauses rendering and gives false results.

    # dev server must be running (pnpm dev  -> http://localhost:5188)
    node tools/dev/drive-window.mjs "<waraq>/node_modules/electron/dist/electron.exe" tools/dev/web-window <file.pdf in public/_test> <screenshot dir> [search term]
    # SETTLE=9000 waits longer before zooming (e.g. to let a cached heavy page warm up)

Automatic journeys: `pnpm test:e2e` (Playwright in Microsoft Edge, tests/e2e).
