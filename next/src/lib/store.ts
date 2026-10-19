// What Waraq remembers on this device: recent files (IndexedDB; with a file handle where the browser gives one, so a
// click reopens the file itself) and portfolios (their .waraq bytes in the browser's private file storage, OPFS).
// The desktop app (Tauri, Phase 4) will keep plain paths instead.

export type Recent = { key: string; kind: 'pdf' | 'portfolio'; name: string; at: number; pages?: number; thumb?: Blob; handle?: FileSystemFileHandle };
const KEEP = 12;

function db(): Promise<IDBDatabase> {
  return new Promise((ok, fail) => {
    const r = indexedDB.open('waraq', 2);
    r.onupgradeneeded = () => { for (const s of ['recent', 'signatures']) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, { keyPath: 'key' }); };
    r.onsuccess = () => ok(r.result); r.onerror = () => fail(r.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void, store = 'recent'): Promise<T | undefined> {
  const d = await db();
  return new Promise((ok, fail) => {
    const t = d.transaction(store, mode), req = run(t.objectStore(store));
    t.oncomplete = () => { ok(req ? req.result : undefined); d.close(); }; t.onerror = () => fail(t.error);
  });
}

export async function recentList(): Promise<Recent[]> {
  try { return ((await tx<Recent[]>('readonly', (s) => s.getAll())) ?? []).sort((a, b) => b.at - a.at); } catch { return []; }
}

/** Adds or refreshes an entry (newest first); only the last KEEP are kept. Fields not given keep their old value. */
export async function remember(entry: Partial<Recent> & Pick<Recent, 'key' | 'kind' | 'name'>) {
  try {
    const all = await recentList(), old = all.find((r) => r.key === entry.key);
    await tx('readwrite', (s) => { s.put({ ...old, ...entry, at: Date.now() }); });
    for (const r of all.filter((r) => r.key !== entry.key).slice(KEEP - 1)) await forget(r.key);
  } catch {} // private mode: nothing is remembered, everything else works
}

export async function forget(key: string) {
  try { await tx('readwrite', (s) => { s.delete(key); }); } catch {}
  if (key.startsWith('portfolio:')) try { await (await folder()).removeEntry(key.slice(10), { recursive: true }); } catch {}
}

// Signatures kept on this device for signing mode: clean PNGs (transparent paper), newest first
export type Signature = { key: string; png: Blob; w: number; h: number; at: number; ink?: number[] }; // ink: 0..1 RGB, for the name and date
export async function signatureList(): Promise<Signature[]> {
  try { return ((await tx<Signature[]>('readonly', (s) => s.getAll(), 'signatures')) ?? []).sort((a, b) => b.at - a.at); } catch { return []; }
}
export async function keepSignature(sig: Signature) { try { await tx('readwrite', (s) => { s.put(sig); }, 'signatures'); } catch {} }
export async function dropSignature(key: string) { try { await tx('readwrite', (s) => { s.delete(key); }, 'signatures'); } catch {} }

/** The file behind a recent entry, asking the browser for permission again if needed (a click allows that). */
export async function reopen(r: Recent): Promise<File | null> {
  if (!r.handle) return null;
  try {
    const h = r.handle as any;
    if ((await h.queryPermission?.({ mode: 'read' })) !== 'granted' && (await h.requestPermission?.({ mode: 'read' })) !== 'granted') return null;
    return await r.handle.getFile();
  } catch { return null; } // moved or deleted
}

// Portfolios: a folder per portfolio in OPFS (manifest.json + files/<id>), so autosave rewrites only the manifest
const folder = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('portfolios', { create: true });
const dir = async (id: string) => (await folder()).getDirectoryHandle(id, { create: true });
export async function writePortfolio(id: string, name: string, bytes: Uint8Array | string) {
  let d = await dir(id);
  const parts = name.split('/');
  for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p, { create: true });
  const w = await (await d.getFileHandle(parts.at(-1)!, { create: true })).createWritable();
  await w.write(bytes as Uint8Array<ArrayBuffer> | string); await w.close();
}
/** One stored file of a portfolio (e.g. a logo for its preview). */
export async function readPortfolioFile(id: string, name: string): Promise<Uint8Array | null> {
  try {
    let d = await dir(id);
    const parts = name.split('/');
    for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p);
    return new Uint8Array(await (await (await d.getFileHandle(parts.at(-1)!)).getFile()).arrayBuffer());
  } catch { return null; }
}
export async function readPortfolio(id: string): Promise<Record<string, Uint8Array> | null> {
  try {
    const d = await dir(id), out: Record<string, Uint8Array> = {};
    try { out['manifest.json'] = new Uint8Array(await (await (await d.getFileHandle('manifest.json')).getFile()).arrayBuffer()); } catch {} // not written yet
    for await (const [name, h] of (await d.getDirectoryHandle('files', { create: true }) as any).entries())
      out['files/' + name] = new Uint8Array(await (await (h as FileSystemFileHandle).getFile()).arrayBuffer());
    return out;
  } catch { return null; }
}

/** Opens files with the system picker where the browser has one (gives handles for "recent"), else `fallback`. */
export async function pickFiles(o: { multiple?: boolean; accept: Record<string, string[]>; fallback: () => void }): Promise<{ file: File; handle?: FileSystemFileHandle }[]> {
  const picker = !navigator.webdriver && (window as any).showOpenFilePicker; // automated tests use the plain file input
  if (!picker) { o.fallback(); return []; }
  try {
    const handles: FileSystemFileHandle[] = await picker({ multiple: !!o.multiple, types: [{ description: 'Waraq', accept: o.accept }] });
    return Promise.all(handles.map(async (handle) => ({ file: await handle.getFile(), handle })));
  } catch { return []; } // cancelled
}

/** Saves bytes as a file: the system "Save as" window where there is one, otherwise a download. */
export async function saveFile(bytes: Uint8Array, name: string, mime = 'application/pdf') {
  const picker = !navigator.webdriver && (window as any).showSaveFilePicker; // automated tests get a download
  const ext = name.slice(name.lastIndexOf('.'));
  if (picker) {
    try {
      const h = await picker({ suggestedName: name, types: [{ description: name, accept: { [mime]: [ext] } }] });
      const w = await h.createWritable(); await w.write(bytes); await w.close();
      return true;
    } catch (e) { if ((e as Error).name === 'AbortError') return false; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
  return true;
}
