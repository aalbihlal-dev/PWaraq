// Portfolio (حافظة): a project that remembers its parts — sections made from files (a week's PDF, photos), each
// with a title (from its file name until renamed), an optional divider page, and pages arranged in the grid.
// The combined PDF (contents, dividers, page numbers, bookmarks) is built from it whenever needed.
// Saved as manifest.json + the original files: a folder in browser storage, or one portable .waraq file (ZIP).
import type { EnginePool } from './engine/pool';
import type { Build, Item } from './engine/assemble';
import { tocPerPage } from './engine/textpage.ts';
import type { Design } from './engine/designs.ts';
import { uid, seen, toItems, type GridItem } from './pages.ts';

export type Section = { id: string; title: string; fromFile: boolean; file?: string; divider: boolean; note: string; items: GridItem[];
  collapsed?: boolean; locked?: boolean; turn?: number }; // collapsed: only the name shows; locked: pages cannot be changed; turn: the divider page
/** The portfolio's own cover page; logos are file ids of the portfolio (left / centre / right). */
export type Cover = { on: boolean; title: string; subtitle: string; names: string; supervisor: string; logos: { left?: string; center?: string; right?: string };
  photo?: string; photoPlace: 'top' | 'full' }; // photo: a file id; across the top, or the whole page under a see-through colour
/** numbers: 'none', 'all' (whole portfolio, renumbered on every change) or a section id (only that section, from 1) */
export type Options = { toc: boolean; numbers: string; bookmarks: boolean; numberPos: 'left' | 'center' | 'right'; design: Design; color: string; cover: Cover;
  logosOnDividers: boolean; header: 'none' | 'small' | 'big' }; // header: the cover's title and names on every section page
const defaults = (): Options => ({ toc: true, numbers: 'all', bookmarks: true, numberPos: 'center', design: 'classic', color: '#3a4248', logosOnDividers: false, header: 'none',
  cover: { on: false, title: '', subtitle: '', names: '', supervisor: '', logos: {}, photoPlace: 'top' } });
/** Options of a portfolio saved by an older Waraq get the new settings' defaults. */
export const withDefaults = (o: Partial<Options>): Options => ({ ...defaults(), ...o, cover: { ...defaults().cover, ...o.cover } });
export type Portfolio = { id: string; name: string; created: number; sections: Section[]; options: Options; files: Record<string, { name: string; mime: string; doc: number }> };

export const newPortfolio = (name: string): Portfolio =>
  ({ id: uid() + uid(), name, created: Date.now(), sections: [], options: defaults(), files: {} });
export const fileTitle = (name: string) => name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim() || name;

export function manifest(p: Portfolio): string {
  const docFile = new Map(Object.entries(p.files).map(([id, f]) => [f.doc, id]));
  return JSON.stringify({
    app: 'waraq-portfolio', version: 1, id: p.id, name: p.name, created: p.created, updated: Date.now(), options: p.options,
    files: Object.fromEntries(Object.entries(p.files).map(([id, f]) => [id, { name: f.name, mime: f.mime }])),
    sections: p.sections.map(({ items, ...s }) => ({ ...s, pages: items.map(({ id, doc, ...it }) => ({ ...it, file: docFile.get(doc) })) })),
  }, null, 1);
}

/** 'invalid': not a Waraq portfolio (damaged, foreign, unsafe); 'newer': made by a newer Waraq. */
export class PortfolioError extends Error {
  kind: 'invalid' | 'newer';
  constructor(kind: 'invalid' | 'newer') { super('portfolio ' + kind); this.kind = kind; } // (no parameter property: Node's test runner only strips types)
}
const SAFE_ID = /^[a-z0-9-]{1,64}$/;
// a name inside the file: manifest.json, or one file under files/ — nothing with .. / \ : or control characters
const SAFE_ENTRY = /^(manifest\.json|files\/(?!.*\.\.)(?!\.$)[^/\\:\u0000-\u001f]{1,200})$/;

/** The manifest of a portfolio read from its entries, after checking the whole file (names, ids, version, shape). */
export function parse(entries: Record<string, Uint8Array>): any {
  const bad = () => { throw new PortfolioError('invalid'); };
  if (Object.keys(entries).some((n) => !SAFE_ENTRY.test(n))) bad();
  let m: any;
  try { m = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(entries['manifest.json'])); } catch { bad(); }
  if (m?.app !== 'waraq-portfolio') bad();
  if (typeof m.version !== 'number') bad();
  if (m.version > 1) throw new PortfolioError('newer');
  const obj = (x: any) => x && typeof x === 'object' && !Array.isArray(x);
  if (typeof m.id !== 'string' || !SAFE_ID.test(m.id) || !obj(m.files) || !Array.isArray(m.sections)) bad();
  if (Object.keys(m.files).some((id) => !SAFE_ID.test(id) || !obj(m.files[id])) || m.sections.some((s: any) => !obj(s) || !Array.isArray(s.pages) || s.pages.some((pg: any) => !obj(pg)))) bad();
  return m;
}

/** The sections a manifest describes, their pages pointing at the already opened `files` (a page of a missing file is left out). */
export const sectionsOf = (m: any, files: Portfolio['files']): Section[] => m.sections.map(({ pages, ...s }: any) => ({ ...s, items: pages
  .filter((pg: any) => pg.blank || files[pg.file])
  .map(({ file, ...pg }: any) => ({ ...pg, id: uid(), doc: pg.blank ? -1 : files[file].doc })) }));

/** Opens a saved portfolio (manifest + files) in the engine. */
export async function load(pool: EnginePool, entries: Record<string, Uint8Array>): Promise<Portfolio> {
  const m = parse(entries);
  await pool.reset();
  const files: Portfolio['files'] = {};
  for (const [id, f] of Object.entries<any>(m.files)) {
    const bytes = entries['files/' + id];
    if (bytes) files[id] = { ...f, doc: (await pool.add(bytes, f.mime)).id };
  }
  const sections = sectionsOf(m, files);
  return { id: m.id, name: m.name, created: m.created, options: withDefaults(m.options ?? {}), sections, files };
}

/** Files the pages still use, for the portable copy. */
export function used(p: Portfolio) {
  const docs = new Set(p.sections.flatMap((s) => s.items.map((it) => it.doc))), logos = new Set([...Object.values(p.options.cover.logos), p.options.cover.photo]);
  return Object.entries(p.files).filter(([id, f]) => docs.has(f.doc) || logos.has(id)).map(([id]) => id);
}

export type Slot = { index: number } & ({ kind: 'cover' } | { kind: 'toc'; part: number } | { kind: 'divider'; section: Section } | { kind: 'page'; section: Section; item: GridItem });
const A4 = { w: 595, h: 842 };
const firstReal = (items: GridItem[]) => items.find((it) => !it.image && !it.blank);

/** Where every page of the combined PDF comes from, in order: contents, then per section its divider and pages. */
export function plan(p: Portfolio) {
  const shown = p.sections.filter((s) => s.divider || s.items.length);
  const first = p.sections.map((s) => firstReal(s.items)).find(Boolean), tocSize = first ? seen(first) : A4;
  const tocParts = p.options.toc && shown.length ? Math.ceil(shown.length / tocPerPage(tocSize.w, tocSize.h)) : 0;
  const slots: Slot[] = [], target = new Map<string, number>(), at = new Map<string, number>();
  if (p.options.cover.on) slots.push({ kind: 'cover', index: 0 });
  for (let part = 0; part < tocParts; part++) slots.push({ kind: 'toc', part, index: slots.length });
  for (const s of shown) {
    target.set(s.id, slots.length); // contents and bookmarks open the divider, or the section's first page
    if (s.divider) slots.push({ kind: 'divider', section: s, index: slots.length });
    for (const item of s.items) { at.set(item.id, slots.length); slots.push({ kind: 'page', section: s, item, index: slots.length }); }
  }
  return { slots, target, at, tocSize, shown };
}

/** The engine build for the combined PDF. `words` are the interface language's "Contents" and "Section". */
export function build(p: Portfolio, words: { contents: string; section: string; supervisor: string; rtl: boolean }): Build {
  const { slots, target, tocSize, shown } = plan(p);
  const pageSlots = slots.filter((s) => s.kind === 'page');
  const built = toItems(pageSlots.map((s) => s.item)), per = tocPerPage(tocSize.w, tocSize.h);
  const entries = shown.map((s) => ({ title: s.title, number: target.get(s.id)! + 1, to: target.get(s.id)! }));
  const o = p.options, c = o.cover, doc = (f?: string) => (f && p.files[f] ? p.files[f].doc : undefined);
  const logos = { left: doc(c.logos.left), center: doc(c.logos.center), right: doc(c.logos.right) };
  const names = c.names.split(/\r?\n/).map((n) => n.trim()).filter(Boolean);
  const header = o.header === 'none' ? undefined : { title: c.title.trim() || p.name, name: names.join('  ·  '), size: o.header };
  let k = 0;
  const items: Item[] = slots.map((slot) => {
    if (slot.kind === 'cover') return { cover: { ...tocSize, design: o.design, color: o.color, rtl: words.rtl, title: c.title.trim() || p.name, subtitle: c.subtitle.trim(),
      names, supervisor: c.supervisor, supervisorLabel: words.supervisor, logos, photo: doc(c.photo) != null ? { doc: doc(c.photo)!, place: c.photoPlace } : undefined } };
    if (slot.kind === 'toc') return { toc: { ...tocSize, heading: words.contents, rtl: words.rtl, entries: entries.slice(slot.part * per, (slot.part + 1) * per) } };
    if (slot.kind === 'divider') {
      const size = firstReal(slot.section.items), s = size ? seen(size) : tocSize;
      return { divider: { ...s, label: `${words.section} ${shown.indexOf(slot.section) + 1}`, title: slot.section.title, note: slot.section.note, design: o.design, color: o.color,
        rtl: words.rtl, logos: o.logosOnDividers ? logos : undefined, header }, rotate: slot.section.turn ?? 0 };
    }
    return built[k++];
  });
  // numbers: every page but the cover (it still counts), or one section's pages
  const numbers = o.numbers === 'all' ? slots.filter((s) => s.kind !== 'cover').map((s) => s.index) : o.numbers === 'none' ? undefined : pageSlots.filter((s) => s.section.id === o.numbers).map((s) => s.index);
  const bookmarks = o.bookmarks ? [...(slots.find((x) => x.kind === 'toc') ? [{ title: words.contents, at: slots.find((x) => x.kind === 'toc')!.index }] : []), ...shown.map((s) => ({ title: s.title, at: target.get(s.id)! }))] : undefined;
  return { items, numbers, numberStyle: { position: o.numberPos === 'left' ? 'bl' : o.numberPos === 'right' ? 'br' : 'bc', start: o.numbers === 'all' && c.on ? 2 : 1 }, bookmarks };
}
