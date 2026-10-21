// What Waraq keeps for itself on this device — drafts, the crash log, portfolio versions: files in the app's data
// folder (desktop app) or the browser's private file storage (OPFS). Never anything the person did not open in Waraq.
import { isDesktop, vaultPut, vaultGet, vaultList, vaultRemove, vaultReveal } from './desktop';

export type Entry = { name: string; size: number; at: number };
const bytes = (d: Uint8Array | string) => (typeof d === 'string' ? new TextEncoder().encode(d) : d);

async function dir(path: string, create = false) {
  let d = await (await navigator.storage.getDirectory()).getDirectoryHandle('vault', { create: true });
  for (const part of path.split('/').filter(Boolean)) d = await d.getDirectoryHandle(part, { create });
  return d;
}
const split = (path: string) => { const i = path.lastIndexOf('/'); return [path.slice(0, i < 0 ? 0 : i), path.slice(i + 1)] as const; };

export async function put(path: string, data: Uint8Array | string): Promise<void> {
  if (isDesktop) return vaultPut(path, bytes(data));
  const [parent, name] = split(path);
  const w = await (await (await dir(parent, true)).getFileHandle(name, { create: true })).createWritable(); // the browser swaps the file in on close
  await w.write(bytes(data) as Uint8Array<ArrayBuffer>); await w.close();
}
export async function get(path: string): Promise<Uint8Array | null> {
  try {
    if (isDesktop) return await vaultGet(path);
    const [parent, name] = split(path);
    return new Uint8Array(await (await (await (await dir(parent)).getFileHandle(name)).getFile()).arrayBuffer());
  } catch { return null; }
}
export const getText = async (path: string) => { const b = await get(path); return b && new TextDecoder().decode(b); };
/** Files in a folder, newest first. */
export async function list(path: string): Promise<Entry[]> {
  try {
    if (isDesktop) return (await vaultList(path)).sort((a, b) => b.at - a.at);
    const out: Entry[] = [];
    for await (const [name, h] of (await dir(path) as any).entries()) if (h.kind === 'file') { const f = await (h as FileSystemFileHandle).getFile(); out.push({ name, size: f.size, at: f.lastModified }); }
    return out.sort((a, b) => b.at - a.at);
  } catch { return []; }
}
/** A file, or a whole folder. */
export async function remove(path: string): Promise<void> {
  try {
    if (isDesktop) return await vaultRemove(path);
    const [parent, name] = split(path);
    await (await dir(parent)).removeEntry(name, { recursive: true });
  } catch { /* already gone */ }
}
/** Desktop only: shows the folder in Explorer (or selects the file); its path. */
export const reveal = (path: string, select = false) => (isDesktop ? vaultReveal(path, select) : Promise.resolve(''));
