// One MuPDF engine in a background thread. Pages are read once into display lists (kept, least recently used
// first out), so drawing again at another zoom or drawing a zoom tile does not re-read the PDF.
import type * as MuPDF from '../../../engine/mupdf-wasm/dist/mupdf.js';

// The engine (11 MB WebAssembly) loads after this worker is already listening: a message that arrives while it
// loads (a file opened right at start-up) waits for it instead of being lost.
let mupdf: typeof MuPDF;
const engine = import('../../../engine/mupdf-wasm/dist/mupdf.js').then((m) => {
  mupdf = m;
  m.setGraphicsMinLineWidth(1); // CAD hairlines stay visible when zoomed out (Waraq's engine build)
});

type Req = { id: number; op: string; [k: string]: any };
let doc: MuPDF.Document | null = null;
const lists = new Map<number, { list: MuPDF.DisplayList; heavy: boolean }>();
// Pages kept in memory per worker. A heavy CAD page can need ~800 MB (A0 drawing, 14 M drawing commands), so a
// worker keeps at most one heavy page, and up to 6 ordinary ones.
// shortcut: "heavy" = took over 1.5 s to read (memory is not measurable from here); measure the heap if this misfires.
const KEEP = 6, HEAVY_MS = 1500;

function list(n: number): MuPDF.DisplayList {
  const hit = lists.get(n);
  if (hit) { lists.delete(n); lists.set(n, hit); return hit.list; } // most recently used goes last
  const t0 = performance.now(), page = doc!.loadPage(n), l = page.toDisplayList();
  page.destroy();
  const heavy = performance.now() - t0 > HEAVY_MS;
  if (heavy) for (const [k, v] of lists) if (v.heavy) { v.list.destroy(); lists.delete(k); }
  lists.set(n, { list: l, heavy });
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
  open(r) {
    lists.forEach((v) => v.list.destroy()); lists.clear(); doc?.destroy();
    doc = mupdf.Document.openDocument(r.bytes, 'application/pdf');
    const sizes = [];
    for (let i = 0; i < doc.countPages(); i++) {
      const p = doc.loadPage(i), [x0, y0, x1, y1] = p.getBounds();
      sizes.push({ w: x1 - x0, h: y1 - y0 }); p.destroy();
    }
    return { sizes };
  },
  // whole page at `scale` device pixels per point, or one region of it (x, y, w, h in those pixels)
  async render(r) {
    const l = list(r.page), m = mupdf.Matrix.scale(r.scale, r.scale);
    if (r.w == null) return bitmap(l.toPixmap(m, mupdf.ColorSpace.DeviceRGB, false));
    const pix = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [r.x, r.y, r.x + r.w, r.y + r.h], false);
    pix.clear(255);
    const dev = new mupdf.DrawDevice(m, pix);
    l.run(dev, mupdf.Matrix.identity); dev.close(); dev.destroy();
    return bitmap(pix);
  },
  // read a page into memory ahead of time (e.g. its image came from the cache, but zooming will need it)
  warm(r) { list(r.page); return true; },
  // text lines with their box (points, top-left origin), for the selectable text layer
  text(r) {
    const p = doc!.loadPage(r.page), st = p.toStructuredText('preserve-whitespace'), out: any[] = [];
    for (const b of JSON.parse(st.asJSON()).blocks) if (b.type === 'text') for (const l of b.lines)
      if (l.text.trim()) out.push({ x: l.bbox.x, y: l.bbox.y, w: l.bbox.w, h: l.bbox.h, text: l.text, size: l.font.size, rtl: /[֐-ࣿ]/.test(l.text) });
    st.destroy(); p.destroy();
    return out;
  },
  search(r) {
    const p = doc!.loadPage(r.page), hits = p.search(r.query, '').map((quads) => quads.map((q) => [...q]));
    p.destroy();
    return hits;
  },
};

self.onmessage = async ({ data }: MessageEvent<Req>) => {
  try {
    await engine;
    const result = await ops[data.op](data);
    (self as any).postMessage({ id: data.id, result }, result instanceof ImageBitmap ? [result] : []);
  } catch (e) {
    (self as any).postMessage({ id: data.id, error: String((e as Error)?.message || e) });
  }
};
