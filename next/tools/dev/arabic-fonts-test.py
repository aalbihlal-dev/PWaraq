# Checks the PDFs `cargo test office_fixtures_with_the_real_pack` wrote to src-tauri/target/office-pdfs: the Arabic words
# of the fixtures are real extractable text and the embedded Arabic font is Amiri (never Mangal / Ghalam / a
# Nastaliq face).   python tools/dev/arabic-fonts-test.py
import fitz, pathlib, re, sys, zipfile
d = pathlib.Path(__file__).resolve().parents[2] / 'src-tauri/target/office-pdfs'
bad = 0
def check(what, ok, note=''):
    global bad; bad += not ok; print('PASS' if ok else 'FAIL', what, note)
# the Arabic words of the source .docx itself (not retyped)
src = zipfile.ZipFile(d.parents[2] / 'tests/fixtures/office/arabic.docx').read('word/document.xml').decode('utf8')
src_words = re.findall(r'[؀-ۿ]+', ' '.join(re.findall(r'<w:t[^>]*>([^<]*)</w:t>', src)))
for name, words in [('arabic-docx', src_words), ('table-xlsx', []), ('slide-pptx', [])]:
    doc = fitz.open(d / (name + '.pdf'))
    text = ''.join(p.get_text() for p in doc)
    fonts = sorted({x[3].split('+')[-1] for p in doc for x in p.get_fonts()})
    arabic = any('\u0600' <= c <= '\u06ff' for c in text)
    # tashkeel is dropped and digit runs may come out reversed (LibreOffice stores right-to-left runs in visual order)
    strip = lambda t: re.sub('[ً-ٟ]', '', t)
    for w in words: check(f'{name}: word {w} extracted', strip(w) in strip(text) or (w.isdigit() and strip(w[::-1]) in strip(text)), 'digits as in the source' if w.isdigit() else '')
    if arabic:
        check(f'{name}: Arabic font is Amiri', any('Amiri' in f for f in fonts) and not any(x in f for f in fonts for x in ('Mangal', 'Ghalam', 'Nastaliq', 'Urdu')), ', '.join(fonts))
    else: print('INFO', name, 'no Arabic;', ', '.join(fonts))
sys.exit(bad)
