# Waraq PDF engine (MuPDF 1.28.5, WebAssembly)

`mupdf-wasm/dist` is MuPDF.js built from MuPDF 1.28.5 with Waraq's two additions
(`apply-waraq-changes.py`): `setGraphicsMinLineWidth(px)` and `setAntiAliasLevel(bits)`.
Waraq uses a minimum line width of 1 px so thin CAD lines stay visible when a drawing is zoomed out.

Rebuild (Linux or WSL, Emscripten 4.0.8 in /opt/emsdk):

    wsl -d Ubuntu-24.04 -u root -- bash "<path to waraq-next>/engine/build-mupdf-wasm.sh"

Licence: GNU AGPL v3 or later (MuPDF © Artifex Software). Our changes are in this folder.
