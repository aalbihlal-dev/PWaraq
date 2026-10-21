# Gallery: the same crop (points) of several pages, each as MuPDF | pdf.js | PDFium. Usage: python gallery.py <name> <scale> <x0,y0,x1,y1> <page,page,...> [out]
# crop is in points from the page's top left as rendered (scale = the render scale used for the PNGs)
import sys, os
from PIL import Image, ImageDraw
SHOTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'Archive-2026-10-12', 'screenshots', 'arabic-audit')
name, scale = sys.argv[1], float(sys.argv[2]); box = [float(v) * scale for v in sys.argv[3].split(',')]
pages = [int(p) for p in sys.argv[4].split(',')]
rows = []
for pg in pages:
    tiles = []
    for c in ['mupdf', 'pdfjs', 'pdfium']:
        p = os.path.join(SHOTS, name, f'{c}-p{pg:02d}.png')
        if not os.path.exists(p): continue
        im = Image.open(p).convert('RGB').crop(tuple(int(v) for v in box))
        d = ImageDraw.Draw(im); d.rectangle((0, 0, 60, 12), fill=(255, 255, 200)); d.text((2, 0), f'{c} p{pg}', fill=(0, 0, 0)); tiles.append(im)
    if not tiles: continue
    W = sum(t.width for t in tiles) + 4 * (len(tiles) - 1); row = Image.new('RGB', (W, tiles[0].height), (150, 150, 150)); x = 0
    for t in tiles: row.paste(t, (x, 0)); x += t.width + 4
    rows.append(row)
H = sum(r.height for r in rows) + 4 * (len(rows) - 1); W = max(r.width for r in rows)
sheet = Image.new('RGB', (W, H), (90, 90, 90)); y = 0
for r in rows: sheet.paste(r, (0, y)); y += r.height + 4
out = sys.argv[5] if len(sys.argv) > 5 else os.path.join(SHOTS, name, 'gallery.png'); sheet.save(out); print(out, sheet.size)
