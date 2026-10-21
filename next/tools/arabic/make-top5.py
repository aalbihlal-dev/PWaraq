# Before/after strips for the owner's summary. Before = what Waraq writes today (MuPDF render); after = the prototype fix (tools/arabic/proto-*.mjs).
import os
from PIL import Image, ImageDraw
S = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'Archive-2026-10-12', 'screenshots', 'arabic-audit')
def crop(name, scale, page, box):
    im = Image.open(os.path.join(S, name, f'mupdf-p{page:02d}.png')).convert('RGB'); return im.crop(tuple(int(v * scale) for v in box))
def strip(title, before, after, out):
    W = max(before.width, after.width) + 20; H = before.height + after.height + 70
    s = Image.new('RGB', (W, H), (255, 255, 255)); d = ImageDraw.Draw(s)
    d.text((8, 4), title, fill=(0, 0, 0)); d.text((8, 22), 'BEFORE (Waraq today)', fill=(190, 30, 30)); s.paste(before, (10, 36))
    y = 36 + before.height + 8; d.text((8, y), 'AFTER (prototype fix)', fill=(20, 120, 60)); s.paste(after, (10, y + 14)); s.save(os.path.join(S, out)); print(out, s.size)
# 1 digits / tashkeel / Persian in the page editor
b = [crop('editor', 1.4, 0, (60, y, 540, y + 36)) for y in (136, 186, 336)]
a = [crop('proto', 1.2, 0, (40, y, 560, y + 30)) for y in (140, 190, 340)]
def stack(ims):
    s = Image.new('RGB', (max(i.width for i in ims), sum(i.height + 4 for i in ims)), (255, 255, 255)); y = 0
    for i in ims: s.paste(i, (0, y)); y += i.height + 4
    return s
strip('Arabic-Indic digits reversed, tashkeel dropped, Persian letters = boxes (page editor text)', stack(b), stack(a), 'TOP-digits-tashkeel-persian.png')
# 2 comment text box
strip('Comment text box: the Arabic is not in the file (MuPDF; same in pdf.js and Edge)', crop('comment', 1.4, 0, (40, 20, 560, 330)), crop('proto-comment', 1.0, 0, (40, 20, 560, 330)), 'TOP-comment-textbox.png')
# 3 forms fillable, several answers
strip('Form with 4 Arabic answers (still fillable)', crop('forms', 1.4, 0, (40, 40, 560, 160)), crop('proto-forms', 1.1, 0, (40, 40, 560, 160)), 'TOP-forms-several-answers.png')
# 4 flatten
strip('Form flattened', crop('forms-flat', 1.4, 0, (40, 40, 560, 400)), crop('proto-forms-flat', 1.1, 0, (40, 40, 560, 400)), 'TOP-forms-flatten.png')
