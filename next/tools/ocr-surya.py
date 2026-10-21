# Surya OCR 2 (github.com/VikParuchuri/surya, surya-ocr 0.22, GPL-3.0; models datalab-to/surya-ocr-2-gguf from Hugging
# Face, fetched on the first run into the HF cache: surya-2.gguf 1.27 GB + mmproj 0.2 GB) on page pictures (PNG files as
# arguments), for tools/ocr-accuracy.mjs --engine surya. Prints one JSON object a page:
# {"lines": [{"words": [{"text", "x0", "y0", "x1", "y1"}]}], "seconds": time reading that page (the first one includes the model start)}
# — one entry per layout block in reading order (Surya 2 gives blocks of HTML, not word boxes).
# Set-up (once):  python -m venv .venv-surya; .venv-surya\Scripts\pip install surya-ocr; unzip llama.cpp's CPU build
# (github.com/ggml-org/llama.cpp release b11756, llama-*-bin-win-cpu-x64.zip, MIT) into .venv-surya/llama.
# Measurement only — not part of the app. Runs on the CPU.
import html, json, os, re, sys, time
from PIL import Image

os.environ.setdefault('LLAMA_CPP_BINARY', os.path.join(os.path.dirname(__file__), '..', '.venv-surya', 'llama', 'llama-server.exe'))
from surya.inference import SuryaInferenceManager
from surya.recognition import RecognitionPredictor

rec = RecognitionPredictor(SuryaInferenceManager(method='llamacpp'))  # CPU; the auto choice (vLLM in Docker) needs an NVIDIA GPU
text = lambda h: html.unescape(re.sub('<[^>]+>', ' ', re.sub('<br\\s*/?>|</p>|</div>', '\n', h))).strip()
sys.stdout.reconfigure(encoding='utf-8')
for f in sys.argv[1:]:
    t0 = time.time()
    page = rec([Image.open(f).convert('RGB')], full_page=True)[0]
    seconds = time.time() - t0
    blocks = sorted((b for b in page.blocks if not b.skipped), key=lambda b: b.reading_order)
    print(json.dumps({'seconds': seconds, 'lines': [{'words': [{'text': text(b.html), 'x0': b.bbox[0], 'y0': b.bbox[1], 'x1': b.bbox[2], 'y1': b.bbox[3]}]} for b in blocks if text(b.html)]}, ensure_ascii=False), flush=True)
