# Recompresses the scan corpus (tests/fixtures/arabic/scans/*.pdf) like a real scanner would: JPEG at quality 60, at most
# the dpi the file was made at. Keeps the OCR text layers of the hybrid files. Run with the scratch venv (pymupdf >= 1.24).
import pathlib, sys
import pymupdf
d = pathlib.Path(__file__).resolve().parents[2] / 'tests/fixtures/arabic/scans'
for f in sorted(d.glob('*.pdf')):
    doc = pymupdf.open(str(f)); before = f.stat().st_size
    doc.rewrite_images(dpi_threshold=0, dpi_target=0, quality=60, lossy=True, lossless=True, bitonal=True, color=True, gray=True, set_to_gray=False)
    doc.save(str(f) + '.tmp', garbage=3, deflate=True); doc.close()
    pathlib.Path(str(f) + '.tmp').replace(f)
    print(f.name, round(before / 1024), '->', round(f.stat().st_size / 1024), 'kB')
