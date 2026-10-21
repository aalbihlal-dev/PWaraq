# Third opinion on the saved pages of audit-edit.mjs: PDFium (pypdfium2, the engine of Edge's and Chrome's PDF viewer)
# opens each file and renders the new line; qpdf (pikepdf) checks the file structure; PyMuPDF (MuPDF 1.29) reads the
# text back and lists the fonts. Run with the scratch venv:
#   <venv>/Scripts/python tools/arabic/audit-check.py [--out tests/audit-arabic/out]
import json, sys, pathlib, unicodedata, re
import pypdfium2 as pdfium
import pikepdf
import pymupdf

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / (sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else 'tests/audit-arabic/out')
data = json.loads((OUT / 'results.json').read_text(encoding='utf-8'))
norm = lambda s: re.sub(r'\s+', ' ', unicodedata.normalize('NFKC', s)).strip()
out = {}
for r in data['results']:
    if r.get('error'):
        continue
    f = OUT / (r['id'] + '.pdf'); rec = {}
    # PDFium: open, render the new line box at 4x, read the text
    try:
        pdf = pdfium.PdfDocument(str(f)); page = pdf[0]
        if r.get('newLineBox'):
            x0, y0, x1, y1 = r['newLineBox']; s = 4
            w, h = page.get_width(), page.get_height()
            bitmap = page.render(scale=s, crop=(x0, max(0, h - y1), max(0, w - x1), y0))  # (left, bottom, right, top) cut off
            bitmap.to_pil().save(OUT / 'img' / (r['id'] + '-pdfium.png'))
        tp = page.get_textpage(); text = tp.get_text_bounded()
        rec['pdfium'] = {'opens': True, 'pageHas': norm(r['intended']) in norm(text), 'chars': len(text)}
        if r.get('newLineBox'):  # what Copy gives in Edge/Chrome for the new line
            x0, y0, x1, y1 = r['newLineBox']; h = page.get_height()
            line = tp.get_text_bounded(left=x0, bottom=h - y1, right=x1, top=h - y0)
            rec['pdfium']['line'] = line
            letters = lambda t: re.sub(r'\s+', '', norm(t))
            rec['pdfium']['lineOk'] = norm(line.replace(chr(13) + chr(10), ' ')) == norm(r['intended'])
            rec['pdfium']['lettersOk'] = letters(line) == letters(r['intended'])
            rec['pdfium']['junk'] = ''.join(sorted(set(c for c in line if not re.match('[\s\u0600-\u06ff\u0750-\u077f\ufb50-\ufefcA-Za-z0-9]', c) and unicodedata.category(c)[0] not in 'PSNZ')))
        tp.close(); page.close(); pdf.close()
    except Exception as e:
        rec['pdfium'] = {'opens': False, 'error': str(e)[:200]}
    # qpdf structure check
    try:
        with pikepdf.open(str(f)) as pdf:
            problems = pdf.check_pdf_syntax()
            rec['qpdf'] = {'ok': not problems, 'problems': [str(p)[:160] for p in problems[:3]]}
    except Exception as e:
        rec['qpdf'] = {'ok': False, 'problems': [str(e)[:200]]}
    # PyMuPDF (MuPDF 1.29): text and fonts
    try:
        doc = pymupdf.open(str(f)); page = doc[0]
        text = page.get_text()
        fonts = [{'xref': x[0], 'ext': x[1], 'type': x[2], 'name': x[3], 'res': x[4], 'enc': x[5]} for x in page.get_fonts(full=True)]
        rec['pymupdf'] = {'pageHas': norm(r['intended']) in norm(text), 'fonts': fonts, 'repaired': doc.is_repaired}
        doc.close()
    except Exception as e:
        rec['pymupdf'] = {'error': str(e)[:200]}
    out[r['id']] = rec
(OUT / 'checks.json').write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding='utf-8')
vals = list(out.values())
print(f"{len(vals)} files: PDFium opens {sum(v['pdfium'].get('opens', False) for v in vals)}, PDFium has text {sum(v['pdfium'].get('pageHas', False) for v in vals)}, "
      f"qpdf clean {sum(v['qpdf']['ok'] for v in vals)}, PyMuPDF has text {sum(v.get('pymupdf', {}).get('pageHas', False) for v in vals)}")
