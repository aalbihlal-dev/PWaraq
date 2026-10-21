// Geometry variants of every base document: rotated 90/180/270, MediaBox origin <> 0, CropBox inset, and combinations.
// -> tests/fixtures/arabic-create/variants/<doc>--<variant>.pdf and variants/index.json (the transform from the base page as seen
// to the variant as seen, so the writers' output can be judged against where things really are).
import fs from 'node:fs'; import path from 'node:path';
import { m, OUT } from '../lib.mjs';
const BASE = path.join(OUT, 'base'), V = path.join(OUT, 'variants'); fs.mkdirSync(V, { recursive: true });
export const VARIANTS = {
  plain: { rot: 0, dx: 0, dy: 0, c: 0 }, rot90: { rot: 90, dx: 0, dy: 0, c: 0 }, rot180: { rot: 180, dx: 0, dy: 0, c: 0 }, rot270: { rot: 270, dx: 0, dy: 0, c: 0 },
  origin: { rot: 0, dx: 100, dy: 200, c: 0 }, crop: { rot: 0, dx: 0, dy: 0, c: 24 }, 'origin-crop-rot270': { rot: 270, dx: 100, dy: 200, c: 24 },
  // content stored turned and shown upright through /Rotate (a landscape scan or CAD sheet saved sideways): what is seen equals the base page
  stored90: { rot: 90, stored: true, dx: 0, dy: 0, c: 0 }, stored180: { rot: 180, stored: true, dx: 0, dy: 0, c: 0 }, stored270: { rot: 270, stored: true, dx: 0, dy: 0, c: 0 }, 'stored90-origin-crop': { rot: 90, stored: true, dx: 100, dy: 200, c: 24 },
};
/** base seen point -> variant seen point (top-left origin) */
export function mapPoint(v, W, H, x, y) {
  x -= v.c; y -= v.c; const w = W - 2 * v.c, h = H - 2 * v.c;
  if (v.stored) return [x, y];
  return v.rot === 90 ? [h - y, x] : v.rot === 180 ? [w - x, h - y] : v.rot === 270 ? [y, w - x] : [x, y];
}
export const seenSize = (v, W, H) => { const w = W - 2 * v.c, h = H - 2 * v.c; return v.rot % 180 && !v.stored ? [h, w] : [w, h]; };
export const mapBox = (v, W, H, b) => { const p = [mapPoint(v, W, H, b.x, b.y), mapPoint(v, W, H, b.x + b.w, b.y + b.h)]; return { x: Math.min(p[0][0], p[1][0]), y: Math.min(p[0][1], p[1][1]), w: Math.abs(p[1][0] - p[0][0]), h: Math.abs(p[1][1] - p[0][1]) }; };

const index = [];
if ((process.argv[1] ?? '').endsWith('make-variants.mjs')) {
  for (const f of fs.readdirSync(BASE).filter((f) => f.endsWith('.pdf'))) {
    const id = f.replace('.pdf', ''), meta = JSON.parse(fs.readFileSync(path.join(BASE, id + '.json'), 'utf8'));
    for (const [name, v] of Object.entries(VARIANTS)) {
      const d = new m.PDFDocument(new Uint8Array(fs.readFileSync(path.join(BASE, f)))), p = d.findPage(0);
      const W = meta.w, H = meta.h, turn = v.stored ? { 90: `0 1 -1 0 ${H} 0`, 180: `-1 0 0 -1 ${W} ${H}`, 270: `0 -1 1 0 0 ${W}` }[v.rot] : '', [uw, uh] = v.stored && v.rot !== 180 ? [H, W] : [W, H];
      if (v.dx || v.dy || turn) { // the page drawn at an offset and / or stored turned: contents moved, MediaBox starts at (dx, dy)
        const old = p.get('Contents'), all = d.newArray();
        all.push(d.addStream(`q 1 0 0 1 ${v.dx} ${v.dy} cm ${turn ? turn + ' cm' : ''}\n`, {}));
        if (old.isArray()) old.forEach((c) => all.push(c)); else all.push(old);
        all.push(d.addStream('\nQ', {})); p.put('Contents', all);
        // annotations (links) would need moving too: the base documents have none
        const ann = p.get('Annots'); if (ann.isArray() && ann.length) throw new Error('annots in base ' + id);
      }
      p.put('MediaBox', [v.dx, v.dy, v.dx + uw, v.dy + uh]);
      if (v.c) p.put('CropBox', [v.dx + v.c, v.dy + v.c, v.dx + uw - v.c, v.dy + uh - v.c]); else p.delete('CropBox');
      if (v.rot) p.put('Rotate', v.rot); else p.delete('Rotate');
      const out = path.join(V, `${id}--${name}.pdf`); fs.writeFileSync(out, d.saveToBuffer('garbage=compact').asUint8Array().slice());
      index.push({ doc: id, variant: name, file: `${id}--${name}.pdf`, ...v, W, H, type: meta.type, arrangement: meta.arrangement });
    }
  }
  fs.writeFileSync(path.join(V, 'index.json'), JSON.stringify(index, null, 1)); console.log(index.length, 'variants');
}
