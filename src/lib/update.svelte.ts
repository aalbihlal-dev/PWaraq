// Updates in the desktop app (src-tauri/src/update.rs). The check runs once a day at start and on demand; a found
// update is downloaded in the background (signature + SHA-256 checked by the shell) and waits for the person's
// click on "Restart to update". Nothing installs by itself. In the browser nothing here runs.
import { isDesktop } from './desktop';

const tauri = (globalThis as { __TAURI__?: { core: { invoke(c: string, a?: unknown): Promise<any> }; event: { listen(n: string, cb: (e: { payload: any }) => void): Promise<unknown> } } }).__TAURI__;
declare const __WARAQ_VERSION__: string | undefined; // vite.config.ts define
const DAY = 86_400_000, KEY = 'waraq-update-checked';
export const version = typeof __WARAQ_VERSION__ === 'string' ? __WARAQ_VERSION__ : 'dev';

export const update = $state({
  status: 'idle' as 'idle' | 'checking' | 'latest' | 'downloading' | 'ready' | 'error',
  version: '', done: 0, total: 0,
  rolledBack: null as { failed: string; back: string } | null,
});

/** Tells the shell the page is up (this version is good) and picks up a rollback note from the last start. */
export async function started() {
  if (!isDesktop) return;
  const note: string | null = await tauri!.core.invoke('app_started');
  if (typeof note === 'string' && note.includes('\n')) { const [failed, back] = note.split('\n'); update.rolledBack = { failed, back }; }
  if (Date.now() - Number(localStorage.getItem(KEY) || 0) > DAY) check();
}

export async function check() {
  if (!isDesktop || update.status === 'checking' || update.status === 'downloading' || update.status === 'ready') return;
  update.status = 'checking';
  try {
    const found: { version: string } | null = await tauri!.core.invoke('check_update');
    localStorage.setItem(KEY, String(Date.now()));
    if (!found?.version) { update.status = 'latest'; return; }
    update.version = found.version; update.status = 'downloading'; update.done = update.total = 0;
    const stop = await tauri!.event.listen('update-progress', (e) => { [update.done, update.total] = e.payload; });
    try { await tauri!.core.invoke('download_update'); } finally { (stop as () => void)(); }
    update.status = 'ready';
  } catch { update.status = 'error'; }
}

/** The click: the shell runs the installer and the app restarts into the new version. */
export const restart = () => tauri!.core.invoke('install_update');
