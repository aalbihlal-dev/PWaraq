#!/usr/bin/env python3
# Waraq's changes to MuPDF's WebAssembly bridge (platform/wasm), applied to a MuPDF 1.28.5 checkout.
# Exposes two drawing settings the official build keeps internal:
#   setGraphicsMinLineWidth(px) - lines never thinner than px pixels (CAD hairlines stay visible when zoomed out)
#   setAntiAliasLevel(bits)     - anti-aliasing bits, 0..8
import sys, pathlib
wasm = pathlib.Path(sys.argv[1]) / 'platform' / 'wasm' / 'lib'
c, ts = wasm / 'mupdf.c', wasm / 'mupdf.ts'
C_ADD = '''
EXPORT
void wasm_set_graphics_min_line_width(float width)
{
	VOID(fz_set_graphics_min_line_width, width)
}

EXPORT
void wasm_set_aa_level(int bits)
{
	VOID(fz_set_aa_level, bits)
}
'''
TS_ADD = '''
export function setGraphicsMinLineWidth(width: number) {
	libmupdf._wasm_set_graphics_min_line_width(width)
}

export function setAntiAliasLevel(bits: number) {
	libmupdf._wasm_set_aa_level(bits)
}
'''
s = c.read_text()
if 'wasm_set_graphics_min_line_width' not in s:
    anchor = 'EXPORT\nvoid wasm_disable_icc(void)'
    assert anchor in s, 'mupdf.c anchor not found'
    c.write_text(s.replace(anchor, C_ADD.lstrip('\n') + '\n' + anchor, 1))
s = ts.read_text()
if 'setGraphicsMinLineWidth' not in s:
    anchor = 'export function setUserCSS(text: string) {'
    assert anchor in s, 'mupdf.ts anchor not found'
    ts.write_text(s.replace(anchor, TS_ADD.lstrip('\n') + '\n' + anchor, 1))
print('Waraq changes applied')
