// Drafts: while a document has unsaved changes, a copy of it is kept on this device (every change and every 30 s), so a crash,
// a power cut or a closed window never takes the work with it. The start screen offers the newest one after an unclean exit.
import * as vault from './vault';

export type Draft = { id: string; name: string; at: number; pages: number };
export const KEEP = 5, DAYS = 30, EVERY = 30_000;
const meta = (id: string) => `drafts/${id}.json`, file = (id: string) => `drafts/${id}.pdf`;

export async function saveDraft(id: string, name: string, bytes: Uint8Array, pages: number) {
  await vault.put(file(id), bytes); // the file first: a meta file always points at a complete copy
  await vault.put(meta(id), JSON.stringify({ id, name, pages, at: Date.now() } satisfies Draft));
  await prune();
}
/** Newest first; a draft whose file is missing is not offered. */
export async function listDrafts(): Promise<Draft[]> {
  const out: Draft[] = [], files = await vault.list('drafts'), have = new Set(files.map((f) => f.name));
  for (const e of files) {
    if (!e.name.endsWith('.json')) continue;
    try { const d: Draft = JSON.parse((await vault.getText('drafts/' + e.name))!); if (have.has(`${d.id}.pdf`)) out.push(d); } catch { /* damaged meta: pruned below */ }
  }
  return out.sort((a, b) => b.at - a.at);
}
export const readDraft = (id: string) => vault.get(file(id));
export async function dropDraft(id: string) { await vault.remove(file(id)); await vault.remove(meta(id)); }
/** At most KEEP drafts, none older than DAYS days. */
export async function prune(now = Date.now()) {
  const all = await listDrafts();
  for (const [i, d] of all.entries()) if (i >= KEEP || now - d.at > DAYS * 86_400_000) await dropDraft(d.id);
  const known = new Set(all.map((d) => d.id)); // files left behind by a write that was cut off
  for (const e of await vault.list('drafts')) if (!known.has(e.name.replace(/\.(json|pdf)$/, ''))) await vault.remove('drafts/' + e.name);
}
