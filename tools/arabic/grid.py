# Contact sheet: many pages of one consumer in a grid. Usage: python grid.py <name> <consumer> <cols> <height> [pages] [out]
import sys, os
from PIL import Image, ImageDraw
SHOTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'Archive-2026-10-12', 'screenshots', 'arabic-audit')
name, c, cols, H = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
d = os.path.join(SHOTS, name)
files = sorted(f for f in os.listdir(d) if f.startswith(c + '-p'))
if len(sys.argv) > 5 and sys.argv[5] != 'all': keep = {int(p) for p in sys.argv[5].split(',')}; files = [f for f in files if int(f.split('-p')[1][:2]) in keep]
tiles = []
for f in files:
    im = Image.open(os.path.join(d, f)).convert('RGB'); r = H / im.height; im = im.resize((max(1, int(im.width * r)), H))
    dr = ImageDraw.Draw(im); dr.rectangle((0, 0, 24, 11), fill=(255, 255, 160)); dr.text((2, 0), f.split('-p')[1][:2], fill=(0, 0, 0)); tiles.append(im)
rows = [tiles[i:i + cols] for i in range(0, len(tiles), cols)]
W = max(sum(t.width + 4 for t in r) for r in rows); sheet = Image.new('RGB', (W, len(rows) * (H + 4)), (110, 110, 110))
for ri, r in enumerate(rows):
    x = 0
    for t in r: sheet.paste(t, (x, ri * (H + 4))); x += t.width + 4
out = sys.argv[6] if len(sys.argv) > 6 else os.path.join(SHOTS, name, f'grid-{c}.png'); sheet.save(out); print(out, sheet.size)
