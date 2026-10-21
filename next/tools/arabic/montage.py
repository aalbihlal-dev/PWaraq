# Side-by-side sheet of one page as three consumers see it: MuPDF | pdf.js | Edge (PDFium). Usage: python montage.py <name> <page> [height]
import sys, os
from PIL import Image, ImageDraw
SHOTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'Archive-2026-10-12', 'screenshots', 'arabic-audit')
name, page = sys.argv[1], int(sys.argv[2]); H = int(sys.argv[3]) if len(sys.argv) > 3 else 760
tiles = []
for c in ['mupdf', 'pdfjs', 'edge']:
    p = os.path.join(SHOTS, name, f'{c}-p{page:02d}.png')
    if not os.path.exists(p): continue
    im = Image.open(p).convert('RGB')
    if c == 'edge':  # drop the viewer's dark side bars: keep the white page
        px = im.load(); w, h = im.size; xs = [x for x in range(w) if px[x, h // 2][0] > 200]
        if xs: im = im.crop((min(xs), 0, max(xs) + 1, h))
    r = H / im.height; im = im.resize((max(1, int(im.width * r)), H))
    d = ImageDraw.Draw(im); d.rectangle((0, 0, 70, 14), fill=(255, 255, 200)); d.text((2, 1), c, fill=(0, 0, 0))
    tiles.append(im)
W = sum(t.width for t in tiles) + 6 * (len(tiles) - 1)
sheet = Image.new('RGB', (W, H), (120, 120, 120)); x = 0
for t in tiles: sheet.paste(t, (x, 0)); x += t.width + 6
out = os.path.join(SHOTS, name, f'sheet-p{page:02d}.png'); sheet.save(out); print(out)
