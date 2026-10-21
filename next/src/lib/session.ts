// Did the last run end badly? Every running Waraq holds a Web Lock named after its session id; a crash or a power cut
// releases it without a goodbye, a normal exit also removes the id from the list. An id in the list with no lock = a run
// that did not end cleanly (works with several tabs open, and in the desktop window).
const LIST = 'waraq-sessions', lockName = (id: string) => 'waraq-run-' + id;
const read = (): string[] => { try { return JSON.parse(localStorage.getItem(LIST) ?? '[]'); } catch { return []; } };
const write = (ids: string[]) => { try { localStorage.setItem(LIST, JSON.stringify(ids)); } catch { /* private mode: no detection */ } };

/** Registers this run; true when an earlier run ended badly. */
export async function startSession(): Promise<boolean> {
  const id = Math.random().toString(36).slice(2), locks = navigator.locks;
  if (!locks) return false;
  await new Promise<void>((ok) => { locks.request(lockName(id), () => { ok(); return new Promise(() => {}); }); }); // held until this page is gone
  const held = new Set((await locks.query()).held?.map((l) => l.name)), before = read();
  const dead = before.filter((x) => !held.has(lockName(x)));
  write([...before.filter((x) => held.has(lockName(x))), id]);
  addEventListener('pagehide', () => write(read().filter((x) => x !== id)));
  return dead.length > 0;
}
