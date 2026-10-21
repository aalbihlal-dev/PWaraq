// "Best quality" OCR in the desktop app: the add-on pack "ocr-best" (Surya OCR 2 on a llama.cpp server, ~1.5 GB, see
// src-tauri/src/ocrbest.rs and ocr-strong.ts). In the browser, or in a build that does not pin the pack, it is not offered.
import { ensure } from './packs.svelte';

const tauri = (globalThis as { __TAURI__?: { core: { invoke(c: string, a?: unknown): Promise<any> } } }).__TAURI__;

/** True when this build can offer Best quality: the desktop app, and the pack is pinned in its packs.json. */
export async function bestAvailable(): Promise<boolean> {
  if (!tauri) return false;
  try { return (await tauri.core.invoke('pack_status', { name: 'ocr-best' })).size > 0; } catch { return false; }
}

/** The local server's address once the pack is there (asks to download it first) and the server answers; null when the
 *  person declined or the server did not start. */
export async function startBest(): Promise<string | null> {
  if (!tauri || !(await ensure('ocr-best'))) return null;
  try { return `http://127.0.0.1:${await tauri.core.invoke('ocr_best_start')}`; } catch { return null; }
}

export const stopBest = (): Promise<unknown> => tauri?.core.invoke('ocr_best_stop') ?? Promise.resolve();
