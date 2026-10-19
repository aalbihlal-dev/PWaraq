// Portfolio (حافظة): a project that remembers its parts — sections made from files (a week's PDF, photos), each
// with a title (from its file name until renamed), an optional divider page, and pages arranged in the grid.
// The combined PDF (contents, dividers, page numbers, bookmarks) is built from it whenever needed.
// Saved as manifest.json + the original files: a folder in browser storage, or one portable .waraq file (ZIP).
import type { EnginePool } from './engine/pool';
import type { Build, Item } from './engine/assemble';
import { tocPerPage } from './engine/textpage.ts';
import { uid, seen, toItems, type GridItem } from './pages.ts';

export type Section = { id: string; title: string; fromFile: boolean; file?: string; divider: boolean; note: string; items: GridItem[] };
/** numbers: 'none', 'all' (whole portfolio, renumbered on every change) or a section id (only that section, from 1) */
export type Options = { toc: boolean; numbers: string; bookmarks: boolean };
export type Portfolio = { id: string; name: string; created: number; sections: Section[]; options: Options; files: Record<string, { name: string; mime: string; doc: number }> };

export const newPortfolio = (name: string): Portfolio =>
  ({ id: uid() + uid(), name, created: Date.now(), sections: [], options: { toc: true, numbers: 'all', bookmarks: true }, files: {} });
export const fileTitle = (name: string) => name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim() || name;

export function manifest(p: Portfolio): string {
  const docFile = new Map(Object.entries(p.files).map(([id, f]) => [f.doc, id]));
  return JSON.stringify({
    app: 'waraq-portfolio', version: 1, id: p.id, name: p.name, created: p.created, updated: Date.now(), options: p.options,
    files: Object.fromEntries(Object.entries(p.files).map(([id, f]) => [id, { name: f.name, mime: f.mime }])),
    sections: p.sections.map(({ items, ...s }) => ({ ...s, pages: items.map(({ id, doc, ...it }) => ({ ...it, file: docFile.get(doc) })) })),
  }, null, 1);
}

/** Opens a saved portfolio (manifest + files) in the engine. */
export async function load(pool: EnginePool, entries: Record<string, Uint8Array>): Promise<Portfolio> {
  const m = JSON.parse(new TextDecoder().decode(entries['manifest.json']));
  if (m.app !== 'waraq-portfolio') throw new Error('not a Waraq portfolio');
  await pool.reset();
  const files: Portfolio['files'] = {};
  for (const [id, f] of Object.entries<any>(m.files)) {
    const bytes = entries['files/' + id];
    if (bytes) files[id] = { ...f, doc: (await pool.add(bytes, f.mime)).id };
  }
  const sections = m.sections.map(({ pages, ...s }: any) => ({ ...s, items: pages
    .filter((pg: any) => pg.blank || files[pg.file])
    .map(({ file, ...pg }: any) => ({ ...pg, id: uid(), doc: pg.blank ? -1 : files[file].doc })) }));
  return { id: m.id, name: m.name, created: m.created, options: m.options, sections, files };
}

/** Files the pages still use, for the portable copy. */
export function used(p: Portfolio) {
  const docs = new Set(p.sections.flatMap((s) => s.items.map((it) => it.doc)));
  return Object.entries(p.files).filter(([, f]) => docs.has(f.doc)).map(([id]) => id);
}

export type Slot = { index: number } & ({ kind: 'toc'; part: number } | { kind: 'divider'; section: Section } | { kind: 'page'; section: Section; item: GridItem });
const A4 = { w: 595, h: 842 };
const firstReal = (items: GridItem[]) => items.find((it) => !it.image && !it.blank);

/** Where every page of the combined PDF comes from, in order: contents, then per section its divider and pages. */
export function plan(p: Portfolio) {
  const shown = p.sections.filter((s) => s.divider || s.items.length);
  const first = p.sections.map((s) => firstReal(s.items)).find(Boolean), tocSize = first ? seen(first) : A4;
  const tocParts = p.options.toc && shown.length ? Math.ceil(shown.length / tocPerPage(tocSize.w, tocSize.h)) : 0;
  const slots: Slot[] = [], target = new Map<string, number>(), at = new Map<string, number>();
  for (let part = 0; part < tocParts; part++) slots.push({ kind: 'toc', part, index: slots.length });
  for (const s of shown) {
    target.set(s.id, slots.length); // contents and bookmarks open the divider, or the section's first page
    if (s.divider) slots.push({ kind: 'divider', section: s, index: slots.length });
    for (const item of s.items) { at.set(item.id, slots.length); slots.push({ kind: 'page', section: s, item, index: slots.length }); }
  }
  return { slots, target, at, tocSize, shown };
}

/** The engine build for the combined PDF. `words` are the interface language's "Contents" and "Section". */
export function build(p: Portfolio, words: { contents: string; section: string; rtl: boolean }): Build {
  const { slots, target, tocSize, shown } = plan(p);
  const pageSlots = slots.filter((s) => s.kind === 'page');
  const built = toItems(pageSlots.map((s) => s.item)), per = tocPerPage(tocSize.w, tocSize.h);
  const entries = shown.map((s) => ({ title: s.title, number: target.get(s.id)! + 1, to: target.get(s.id)! }));
  let k = 0;
  const items: Item[] = slots.map((slot) => {
    if (slot.kind === 'toc') return { toc: { ...tocSize, heading: words.contents, rtl: words.rtl, entries: entries.slice(slot.part * per, (slot.part + 1) * per) } };
    if (slot.kind === 'divider') {
      const size = firstReal(slot.section.items), s = size ? seen(size) : tocSize;
      return { divider: { ...s, label: `${words.section} ${shown.indexOf(slot.section) + 1}`, title: slot.section.title, note: slot.section.note } };
    }
    return built[k++];
  });
  const o = p.options;
  const numbers = o.numbers === 'all' ? true : o.numbers === 'none' ? undefined : pageSlots.filter((s) => s.section.id === o.numbers).map((s) => s.index);
  const bookmarks = o.bookmarks ? [...(slots[0]?.kind === 'toc' ? [{ title: words.contents, at: 0 }] : []), ...shown.map((s) => ({ title: s.title, at: target.get(s.id)! }))] : undefined;
  return { items, numbers, bookmarks };
}
