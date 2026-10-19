// One MuPDF engine in a background thread. Pages are read once into display lists (kept, least recently used
// first out), so drawing again at another zoom or drawing a zoom tile does not re-read the PDF.
import type * as MuPDF from '../../../engine/mupdf-wasm/dist/mupdf.js';
import { assemble } from './assemble';
import { editPage, pageObjects, type Edit, type Own } from './editpage';
import { findSpots, signPdf } from './sign';
import type { Fonts } from './textpage';
import { BUNDLED_FILES, fontAt, pick } from './ownfont';

// HarfBuzz and the bundled Arabic fonts, for a replaced line written in its own font (or the closest bundled one)
let own: Own | null = null;
async function loadOwn() {
  if (own) return own;
  const [hb, ...files] = await Promise.all([import('harfbuzzjs'), ...BUNDLED_FILES.map(async (f) => new Uint8Array(await (await fetch(new URL('/fonts/' + f, location.origin))).arrayBuffer()))]);
  const bytes = new Map<string, Uint8Array>(BUNDLED_FILES.map((f, i) => [f, files[i]]));
  return (own = { hb, file: (f) => bytes.get(f)! });
}

// The engine (11 MB WebAssembly) loads after this worker is already listening: a message that arrives while it
// loads (a file opened right at start-up) waits for it instead of being lost.
let mupdf: typeof MuPDF;
const engine = import('../../../engine/mupdf-wasm/dist/mupdf.js').then((m) => {
  mupdf = m;
  m.setGraphicsMinLineWidth(1); // CAD hairlines stay visible when zoomed out (Waraq's engine build)
});

// Tajawal for the pages Waraq writes (dividers, contents), loaded the first time they are needed
let fonts: Fonts | null = null;
async function loadFonts() {
  if (fonts) return;
  const get = async (f: string) => new Uint8Array(await (await fetch(new URL('/fonts/' + f, location.origin))).arrayBuffer());
  const [regular, bold] = await Promise.all([get('Tajawal-Regular.ttf'), get('Tajawal-Bold.ttf')]);
  fonts = { regular: new mupdf.Font('Tajawal', regular), bold: new mupdf.Font('Tajawal-Bold', bold) };
}

type Req = { id: number; op: string; doc?: number; [k: string]: any };
// Open sources by id: 0 = the document in the viewer; Organize and Portfolio add more (other PDFs, images).
const docs = new Map<number, { doc: MuPDF.Document; bytes: Uint8Array }>();
const lists = new Map<string, { list: MuPDF.DisplayList; heavy: boolean }>();
const source = (id = 0) => { const s = docs.get(id); if (!s) throw new Error('not open: ' + id); return s; };
// Pages kept in memory per worker. A heavy CAD page can need ~800 MB (A0 drawing, 14 M drawing commands), so a
// worker keeps at most one heavy page, and up to 6 ordinary ones.
// shortcut: "heavy" = took over 1.5 s to read (memory is not measurable from here); measure the heap if this misfires.
const KEEP = 6, HEAVY_MS = 1500;

function list(n: number, id = 0): MuPDF.DisplayList {
  const key = id + ':' + n, hit = lists.get(key);
  if (hit) { lists.delete(key); lists.set(key, hit); return hit.list; } // most recently used goes last
  const t0 = performance.now(), page = source(id).doc.loadPage(n), l = page.toDisplayList();
  page.destroy();
  const heavy = performance.now() - t0 > HEAVY_MS;
  if (heavy) for (const [k, v] of lists) if (v.heavy) { v.list.destroy(); lists.delete(k); }
  lists.set(key, { list: l, heavy });
  while (lists.size > KEEP) { const [old, v] = lists.entries().next().value!; v.list.destroy(); lists.delete(old); }
  return l;
}

// MuPDF RGB samples -> RGBA ImageBitmap the page can draw directly
function bitmap(pix: MuPDF.Pixmap): Promise<ImageBitmap> {
  const w = pix.getWidth(), h = pix.getHeight(), rgb = pix.getPixels(), rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) { rgba[j] = rgb[i]; rgba[j + 1] = rgb[i + 1]; rgba[j + 2] = rgb[i + 2]; rgba[j + 3] = 255; }
  pix.destroy();
  return createImageBitmap(new ImageData(rgba, w, h));
}

const ops: Record<string, (r: Req) => any> = {
  // forget every source (a new document or portfolio)
  reset() {
    lists.forEach((v) => v.list.destroy()); lists.clear();
    docs.forEach((s) => s.doc.destroy()); docs.clear();
    return true;
  },
  // open a source as id `doc`: a PDF, or an image (a one-page source)
  open(r) {
    const id = r.doc ?? 0, old = docs.get(id);
    if (old) { for (const [k, v] of lists) if (k.startsWith(id + ':')) { v.list.destroy(); lists.delete(k); } old.doc.destroy(); }
    const doc = mupdf.Document.openDocument(r.bytes, r.mime ?? 'application/pdf');
    docs.set(id, { doc, bytes: r.mime?.startsWith('image/') ? r.bytes : new Uint8Array() }); // image bytes are needed to build pages
    const sizes = [];
    for (let i = 0; i < doc.countPages(); i++) {
      const p = doc.loadPage(i), [x0, y0, x1, y1] = p.getBounds();
      sizes.push({ w: x1 - x0, h: y1 - y0 }); p.destroy();
    }
    return { sizes };
  },
  // whole page at `scale` device pixels per point, or one region of it (x, y, w, h in those pixels)
  async render(r) {
    const l = list(r.page, r.doc), m = mupdf.Matrix.scale(r.scale, r.scale);
    if (r.w == null) return bitmap(l.toPixmap(m, mupdf.ColorSpace.DeviceRGB, false));
    const pix = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [r.x, r.y, r.x + r.w, r.y + r.h], false);
    pix.clear(255);
    const dev = new mupdf.DrawDevice(m, pix);
    l.run(dev, mupdf.Matrix.identity); dev.close(); dev.destroy();
    return bitmap(pix);
  },
  // read a page into memory ahead of time (e.g. its image came from the cache, but zooming will need it)
  warm(r) { list(r.page, r.doc); return true; },
  // text lines with their box (points, top-left origin), for the selectable text layer
  text(r) {
    const p = source(r.doc).doc.loadPage(r.page), st = p.toStructuredText('preserve-whitespace'), out: any[] = [];
    for (const b of JSON.parse(st.asJSON()).blocks) if (b.type === 'text') for (const l of b.lines)
      if (l.text.trim()) out.push({ x: l.bbox.x, y: l.bbox.y, w: l.bbox.w, h: l.bbox.h, text: l.text, size: l.font.size, rtl: /[֐-ࣿ]/.test(l.text) });
    st.destroy(); p.destroy();
    return out;
  },
  search(r) {
    const p = source(r.doc).doc.loadPage(r.page), hits = p.search(r.query, '').map((quads) => quads.map((q) => [...q]));
    p.destroy();
    return hits;
  },
  // a new PDF from pages of the open sources (Organize, Portfolio)
  async build(r) {
    if (r.build.items.some((it: any) => it.divider || it.toc)) await loadFonts();
    return assemble(mupdf, source, r.build, () => fonts!);
  },
  // page editor: the lines of text and photos on a page
  objects(r) { const p = source(r.doc).doc.loadPage(r.page); try { return pageObjects(p); } finally { p.destroy(); } },
  // page editor: which font a replaced line will be written in, and the letters its own font lacks
  async fontcheck(r) {
    const o = await loadOwn(), p = source(r.doc).doc.loadPage(r.page);
    try { const { font, using, missing } = pick(o.hb, fontAt(p, r.from), r.text, r.bold, o.file); return { font, using, missing }; } finally { p.destroy(); }
  },
  // page editor: the page with `edits` applied — a one-page PDF, or with `scale` the editor's background (what the edits
  // take away already gone) as a picture
  async edit(r) {
    if (r.edits.some((e: Edit) => e.kind === 'text')) await loadFonts();
    const o = r.scale == null && r.edits.some((e: Edit) => e.kind === 'text' && e.from) ? await loadOwn() : undefined;
    const pdf = source(r.doc).doc.asPDF();
    if (!pdf) throw new Error('not a PDF: ' + r.doc);
    const out = editPage(mupdf, pdf, r.page, r.edits, r.photos ?? [], () => fonts!, r.scale != null, o);
    try {
      if (r.scale == null) return out.saveToBuffer('garbage=compact').asUint8Array().slice();
      const p = out.loadPage(0), pix = p.toPixmap(mupdf.Matrix.scale(r.scale, r.scale), mupdf.ColorSpace.DeviceRGB, false);
      p.destroy();
      return bitmap(pix);
    } finally { out.destroy(); }
  },
  // signing mode: where the file in `bytes` needs signing, every page
  spots(r) {
    const d = mupdf.Document.openDocument(r.bytes, 'application/pdf');
    try { return [...Array(d.countPages())].flatMap((_, i) => { const p = d.loadPage(i); try { return findSpots(p, i); } finally { p.destroy(); } }); }
    finally { d.destroy(); }
  },
  // signing mode: the file in `bytes` with the signature sets drawn on its pages
  async sign(r) { await loadFonts(); return signPdf(mupdf, r.bytes, r.pages, r.photos, () => fonts!); },
};

self.onmessage = async ({ data }: MessageEvent<Req>) => {
  try {
    await engine;
    const result = await ops[data.op](data);
    (self as any).postMessage({ id: data.id, result }, result instanceof ImageBitmap ? [result] : result instanceof Uint8Array ? [result.buffer] : []);
  } catch (e) {
    (self as any).postMessage({ id: data.id, error: String((e as Error)?.message || e) });
  }
};
