// Pages as Organize and Portfolio arrange them: a page of an open source (engine doc id + page index), turned by
// `rotate` on top of its own rotation; `w`/`h` are its size as the engine reports it (points, own rotation applied).
export type GridItem = { id: string; doc: number; page: number; rotate: number; w: number; h: number; blank?: boolean; image?: boolean;
  crop?: number[] }; // crop: [left, top, right, bottom] fractions of the page as seen
export type Group = { id: string; items: GridItem[] };
import type { Item } from './engine/assemble';

export const uid = () => Math.random().toString(36).slice(2, 10);
export const turned = (it: { rotate: number }) => ((it.rotate % 360) + 360) % 360;
/** Size as seen: width and height swap when turned a quarter. */
export const seen = (it: GridItem) => (turned(it) % 180 ? { w: it.h, h: it.w } : { w: it.w, h: it.h });

/** Moves the items with `ids` (keeping their order) to `index` of group `to`; index counts the items left there. */
export function move(groups: Group[], ids: Set<string>, to: string, index: number): Group[] {
  const moving = groups.flatMap((g) => g.items.filter((it) => ids.has(it.id)));
  const target = groups.find((g) => g.id === to)!;
  const before = target.items.slice(0, index).filter((it) => !ids.has(it.id)).length; // index after removing the moved
  return groups.map((g) => {
    const rest = g.items.filter((it) => !ids.has(it.id));
    return g.id === to ? { ...g, items: [...rest.slice(0, before), ...moving, ...rest.slice(before)] } : { ...g, items: rest };
  });
}
export const edit = (groups: Group[], ids: Set<string>, f: (it: GridItem) => GridItem | null): Group[] =>
  groups.map((g) => ({ ...g, items: g.items.flatMap((it) => (ids.has(it.id) ? f(it) ?? [] : [it])) }));

/** Engine build items for these pages. A photo page takes the size of the nearest real page (before it, else after).
 *  shortcut: the grid shows a photo in its own shape; the built page has the neighbour's shape with the photo inside. */
export function toItems(items: GridItem[]): Item[] {
  const real = (x: GridItem) => !x.image && !x.blank;
  return items.map((it, i) => {
    if (it.blank) return { blank: true, fit: { w: it.w, h: it.h }, rotate: it.rotate, crop: it.crop && [...it.crop] };
    const near = it.image ? items.slice(0, i).reverse().find(real) ?? items.slice(i).find(real) : undefined;
    return { doc: it.doc, page: it.page, rotate: it.rotate, fit: near ? seen(near) : undefined, crop: it.crop && [...it.crop] }; // plain copies: the engine cannot take live interface objects
  });
}

/** Opens files as engine sources and returns their pages (PDF pages, or one page per photo). */
export async function addFiles(pool: import('./engine/pool').EnginePool, files: File[]): Promise<{ file: File; doc: number; bytes: Uint8Array; items: GridItem[] }[]> {
  const out = [];
  for (const file of files) {
    const image = /^image\/(png|jpeg|gif|bmp|tiff|webp)$/.test(file.type), bytes = new Uint8Array(await file.arrayBuffer());
    const { id, sizes } = await pool.add(bytes, image ? file.type : 'application/pdf');
    out.push({ file, doc: id, bytes, items: sizes.map((s, page) => ({ id: uid(), doc: id, page, rotate: 0, w: s.w, h: s.h, image })) });
  }
  return out;
}
