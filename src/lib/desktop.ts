// The Tauri desktop shell (src-tauri). In the browser `tauri` is undefined, `isDesktop` is false and the callers keep
// their browser behaviour (file pickers, downloads). Uses Tauri's global API (withGlobalTauri) so no npm package.
import { CAD, OFFICE, type Desktop } from './convert';

type Tauri = {
  core: { invoke(cmd: string, args?: unknown, opts?: { headers: Record<string, string> }): Promise<any> };
  event: { listen(name: string, cb: (e: { payload: any }) => void): Promise<() => void> };
  dialog: { open(o: object): Promise<string | string[] | null>; save(o: object): Promise<string | null> };
  window: { getCurrentWindow(): any };
};
const tauri = (globalThis as { __TAURI__?: Tauri }).__TAURI__;
export const isDesktop = !!tauri;
export const appWindow = () => tauri!.window.getCurrentWindow();
const FILTERS = [{ name: 'PDF', extensions: ['pdf'] }, { name: 'Waraq', extensions: ['waraq'] }, { name: 'Office, CAD', extensions: [...OFFICE, ...CAD] }];
export const baseName = (p: string) => p.slice(Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/')) + 1);
const ascii = (s: string) => encodeURIComponent(s); // header values must be ASCII; Rust decodes

export async function readPath(path: string): Promise<File> {
  const buf: ArrayBuffer = await tauri!.core.invoke('read_file', { path });
  return new File([buf], baseName(path));
}
export async function pickPaths(multiple = false): Promise<string[]> {
  const r = await tauri!.dialog.open({ multiple, filters: FILTERS });
  return r == null ? [] : ([] as string[]).concat(r);
}
/** Safe save: the new file is written beside the target, read back and checked by `check` (throws when it does not open), and only
 *  then swapped in — the old file stays as `name.bak.ext`. If anything fails the target is untouched. */
export async function writePath(path: string, bytes: Uint8Array, check?: (back: Uint8Array) => Promise<unknown>): Promise<void> {
  const tmp: string = await tauri!.core.invoke('save_temp', bytes, { headers: { path: ascii(path) } });
  try {
    if (check) await check(new Uint8Array(await tauri!.core.invoke('read_file', { path: tmp })));
    await tauri!.core.invoke('save_commit', { path, tmp });
  } catch (e) { await tauri!.core.invoke('save_discard', { path, tmp }); throw e; }
}
/** The system "Save as" window, then writes; the chosen path, or null when cancelled. */
export async function saveAs(name: string, bytes: Uint8Array, check?: (back: Uint8Array) => Promise<unknown>): Promise<string | null> {
  const ext = name.slice(name.lastIndexOf('.') + 1);
  const path = await tauri!.dialog.save({ defaultPath: name, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
  if (path) await writePath(path, bytes, check);
  return path;
}
// Waraq's own folder in the app data folder (drafts, crash log, portfolio versions); see src/lib/vault.ts
export const vaultPut = (path: string, bytes: Uint8Array): Promise<void> => tauri!.core.invoke('vault_put', bytes, { headers: { path: ascii(path) } });
export const vaultGet = async (path: string): Promise<Uint8Array> => new Uint8Array(await tauri!.core.invoke('vault_get', { path }));
export const vaultList = (dir: string): Promise<{ name: string; size: number; at: number }[]> => tauri!.core.invoke('vault_list', { dir });
export const vaultRemove = (path: string): Promise<void> => tauri!.core.invoke('vault_remove', { path });
/** Shows a vault folder (or selects one file) in Explorer; its full path. */
export const vaultReveal = (path: string, select = false): Promise<string> => tauri!.core.invoke('vault_reveal', { path, select });
/** Opens a crash-report link (mail program or GitHub) in the system; the desktop program accepts only those two targets. */
export const openExternal = (url: string): Promise<void> => tauri!.core.invoke('open_external', { url });
/** The 1 px frame Windows draws round the window, in the title bar's colour, so the top edge shows no hairline. */
export function setBorder(cssRgb: string) {
  const [r, g, b] = cssRgb.match(/\d+/g)!.map(Number);
  tauri!.core.invoke('set_border', { color: (b << 16) | (g << 8) | r }); // COLORREF is 0x00bbggrr
}
/** Files the user wants opened: the command line, a second launch (single instance), a file dropped on the window. */
export function onOpenPaths(cb: (paths: string[]) => void) {
  tauri!.core.invoke('launch_paths').then((p: string[]) => p.length && cb(p));
  tauri!.event.listen('open-paths', (e) => e.payload.length && cb(e.payload));
  tauri!.event.listen('tauri://drag-drop', (e) => cb(e.payload.paths));
}

if (tauri) {
  document.documentElement.dataset.desktop = ''; // makes room for the title bar (tokens.css)
  (globalThis as { waraqDesktop?: Desktop }).waraqDesktop = {
    convertToPdf: async (name, bytes) => new Uint8Array(await tauri.core.invoke('convert_to_pdf', bytes, { headers: { name: ascii(name) } })),
  };
}
