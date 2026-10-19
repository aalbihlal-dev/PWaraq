#!/usr/bin/env python3
# Waraq's changes to MuPDF's WebAssembly bridge (platform/wasm), applied to a MuPDF 1.28.5 checkout.
# Exposes what the official build keeps internal:
#   setGraphicsMinLineWidth(px) - lines never thinner than px pixels (CAD hairlines stay visible when zoomed out)
#   setAntiAliasLevel(bits)     - anti-aliasing bits, 0..8
#   Font.getBuffer()            - the font file of a font (an embedded PDF font's own bytes; null for Type 3 / base 14)
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

EXPORT
fz_buffer * wasm_font_get_buffer(fz_font *font)
{
	POINTER(fz_keep_buffer, font->buffer)
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
TS_FONT_ANCHOR = '''	isItalic() {
		return !!libmupdf._wasm_font_is_italic(this.pointer)
	}
'''
TS_FONT_ADD = '''
	getBuffer(): Buffer | null {
		let p = libmupdf._wasm_font_get_buffer(this.pointer)
		return p ? new Buffer(p) : null
	}
'''
s = c.read_text()
anchor = 'EXPORT\nvoid wasm_disable_icc(void)'
assert anchor in s, 'mupdf.c anchor not found'
for fn in C_ADD.strip('\n').split('\n\n'):  # each function once (a checkout may already have the older ones)
    if fn.split('(')[0].split()[-1] not in s:
        s = s.replace(anchor, fn + '\n\n' + anchor, 1)
c.write_text(s)
s = ts.read_text()
if 'setGraphicsMinLineWidth' not in s:
    anchor = 'export function setUserCSS(text: string) {'
    assert anchor in s, 'mupdf.ts anchor not found'
    s = s.replace(anchor, TS_ADD.lstrip('\n') + '\n' + anchor, 1)
if '_wasm_font_get_buffer' not in s:
    assert TS_FONT_ANCHOR in s, 'mupdf.ts Font anchor not found'
    s = s.replace(TS_FONT_ANCHOR, TS_FONT_ANCHOR + TS_FONT_ADD, 1)
ts.write_text(s)
print('Waraq changes applied')
