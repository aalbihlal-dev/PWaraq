// Add-on packs in the desktop app (src-tauri/src/packs.rs). The first Office/CAD conversion asks "Download the
// Office & CAD add-on (137 MB)?"; after the click the shell downloads, checks and unpacks it (progress, cancel) and
// the conversion goes on. `ensure()` resolves true when the pack is there, false when the person declined/cancelled.
const tauri = (globalThis as { __TAURI__?: { core: { invoke(c: string, a?: unknown): Promise<any> }; event: { listen(n: string, cb: (e: { payload: any }) => void): Promise<unknown> } } }).__TAURI__;

export const pack = $state({
  open: false,
  status: 'ask' as 'ask' | 'downloading' | 'unpacking' | 'error',
  error: '' as '' | 'PACK_MISMATCH' | 'FAILED',
  done: 0, total: 0, size: 0,
});
let settle: ((ok: boolean) => void) | null = null;

export async function ensure(name = 'office'): Promise<boolean> {
  const s: { installed: boolean; size: number } = await tauri!.core.invoke('pack_status', { name });
  if (s.installed) return true;
  pack.size = Math.round(s.size / 1048576); pack.status = 'ask'; pack.error = ''; pack.open = true;
  return new Promise<boolean>((r) => (settle = r));
}
export const decline = () => { pack.open = false; settle?.(false); settle = null; };
export const cancel = () => tauri!.core.invoke('pack_cancel');

export async function download(name = 'office') {
  pack.status = 'downloading'; pack.done = 0; pack.total = 0;
  const stop = await tauri!.event.listen('pack-progress', (e) => { [pack.done, pack.total] = e.payload; if (pack.done >= pack.total && pack.total) pack.status = 'unpacking'; });
  try {
    await tauri!.core.invoke('pack_install', { name });
    pack.open = false; settle?.(true); settle = null;
  } catch (e) {
    if (String(e) === 'CANCELLED') decline();
    else { pack.status = 'error'; pack.error = String(e) === 'PACK_MISMATCH' ? 'PACK_MISMATCH' : 'FAILED'; }
  } finally { (stop as () => void)(); }
}
