#!/bin/bash
# Builds Waraq's MuPDF WebAssembly engine (MuPDF 1.28.5 + engine/apply-waraq-changes.py) on Linux / WSL.
# Usage (from Windows):  wsl -d Ubuntu-24.04 -u root -- bash "<waraq-next>/engine/build-mupdf-wasm.sh"
# Needs: build-essential git python3, Emscripten 4.0.8 in /opt/emsdk. Output: engine/mupdf-wasm/dist
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC=/root/mupdf
[ -d "$SRC" ] || git -c advice.detachedHead=false clone -q --depth 1 --branch 1.28.5 --recurse-submodules --shallow-submodules https://github.com/ArtifexSoftware/mupdf.git "$SRC"
python3 "$HERE/apply-waraq-changes.py" "$SRC"
source /opt/emsdk/emsdk_env.sh >/dev/null 2>&1
export PATH="$(dirname "$(command -v node)"):$PATH"
cd "$SRC/platform/wasm"
[ -d node_modules ] || npm install --no-audit --no-fund --silent
# Built for speed (-O3, WebAssembly SIMD) instead of size (-Os): heavy CAD pages are drawn much more often than
# the engine is downloaded. WASM_SPEED=0 builds the official size-optimised variant.
if [ "${WASM_SPEED:-1}" = 1 ]; then
  sed -e 's/^BUILD=.*/BUILD=${BUILD:-release}/' -e 's/-Os -g2/-O3 -msimd128 -g0/' tools/build.sh > tools/build-speed.sh
  EMSDK=/opt/emsdk DEFINES="-DTOFU -DTOFU_CJK_EXT -DFZ_ENABLE_HYPHEN=0 -msimd128" bash tools/build-speed.sh
else
  EMSDK=/opt/emsdk bash tools/build.sh
fi
mkdir -p "$HERE/mupdf-wasm/dist" && cp dist/mupdf.js dist/mupdf.d.ts dist/mupdf-wasm.js dist/mupdf-wasm.wasm dist/mupdf-wasm.d.ts "$HERE/mupdf-wasm/dist/"
echo "built: $(ls -la "$HERE/mupdf-wasm/dist" | wc -l) files in engine/mupdf-wasm/dist"
