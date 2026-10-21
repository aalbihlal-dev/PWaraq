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
export const writePath = (path: string, bytes: Uint8Array): Promise<void> => tauri!.core.invoke('write_file', bytes, { headers: { path: ascii(path) } });
/** The system "Save as" window, then writes; the chosen path, or null when cancelled. */
export async function saveAs(name: string, bytes: Uint8Array): Promise<string | null> {
  const ext = name.slice(name.lastIndexOf('.') + 1);
  const path = await tauri!.dialog.save({ defaultPath: name, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
  if (path) await writePath(path, bytes);
  return path;
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
