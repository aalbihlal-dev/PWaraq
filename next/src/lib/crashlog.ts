// The crash log: every crash is written to this device by itself (in the vault's crash-log folder: the app data folder on
// the desktop, the browser's private storage on the web). Nothing is sent anywhere — the person chooses, in the dialog, after
// seeing the exact text. Entries hold no document content and no real file names (see crashreport.ts).
import * as vault from './vault';
import { isDesktop } from './desktop';
import { clean, cleanStack, normalise, reportText, systemOf, type Entry, type Kind } from './crashreport';

const DIR = 'crash-log', KEEP = 20, DAYS = 30, LINES = 50, ASK = 'waraq-crash-ask', LAST = 'waraq-last-run';
declare const __WARAQ_VERSION__: string | undefined;
const version = typeof __WARAQ_VERSION__ === 'string' ? __WARAQ_VERSION__ : 'dev';

/** What the app is doing now: the open task (View, Organize…) and the real names of the open files, which are replaced in the log. */
export const context = { task: '', names: [] as string[] };
const log: string[] = [];
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };
const load = <T>(k: string, d: T): T => { try { return JSON.parse(localStorage.getItem(k) ?? 'null') ?? d; } catch { return d; } };
let dirty = false;

/** Adds a line to the log tail (the last 50 are kept with a crash). Only short lines about what Waraq did. */
export function note(line: string) {
  log.push(`${new Date().toISOString().slice(11, 19)} ${clean(line, context.names, 160)}`);
  if (log.length > LINES) log.shift();
  dirty = true;
}
export function setTask(task: string, names?: string[]) {
  context.task = task; if (names) context.names = names;
  note('task: ' + (task || 'start'));
  save(LAST, { task, lang: document.documentElement.lang, theme: document.documentElement.dataset.theme ?? 'light' });
}

let recorded = 0; const seenMessages = new Set<string>();
/** Writes a crash-log entry. `job` is the engine job that failed, when known. Never throws. */
export async function record(kind: Kind, err: { message?: unknown; stack?: unknown } | string, job?: string, previous?: { task: string; log: string[] }) {
  try {
    const message = clean(typeof err === 'string' ? err : err?.message, context.names), key = kind + message;
    if (recorded >= 10 || seenMessages.has(key)) return; // one broken loop must not fill the log
    recorded++; seenMessages.add(key);
    const at = Date.now(), last = load<{ lang?: string; theme?: string }>(LAST, {});
    const entry: Entry = { id: `${at}-${kind}`, at, kind, version, system: systemOf(navigator.userAgent, isDesktop), lang: document.documentElement.lang || last.lang || '',
      theme: document.documentElement.dataset.theme ?? 'light', task: previous?.task ?? context.task, job, message,
      stack: typeof err === 'string' ? undefined : cleanStack(err?.stack, context.names) || undefined, log: previous?.log ?? [...log] };
    await vault.put(`${DIR}/${entry.id}.json`, JSON.stringify(entry));
    await prune();
  } catch { /* the log must never be the thing that crashes */ }
}

/** Newest first. */
export async function entries(): Promise<Entry[]> {
  const out: Entry[] = [];
  for (const f of await vault.list(DIR)) {
    if (!f.name.endsWith('.json')) continue;
    try { out.push(normalise(JSON.parse((await vault.getText(`${DIR}/${f.name}`))!))); } catch { /* a half-written entry is skipped */ }
  }
  return out.sort((a, b) => b.at - a.at);
}
async function prune(now = Date.now()) {
  for (const f of (await vault.list(DIR)).filter((f, i) => i >= KEEP || now - f.at > DAYS * 86_400_000)) await vault.remove(`${DIR}/${f.name}`);
}
export async function markSeen(list: Entry[]) {
  for (const e of list) if (!e.seen) await vault.put(`${DIR}/${e.id}.json`, JSON.stringify({ ...e, seen: true }));
}

/** The "Always ask" setting: on by default; off means the dialog stays away (the log is still written and can be copied). */
export const askFirst = () => localStorage.getItem(ASK) !== 'no';
export const setAsk = (on: boolean) => { try { localStorage.setItem(ASK, on ? 'yes' : 'no'); } catch { /* private mode */ } };

export const copyReport = async () => { const [e] = await entries(); if (e) await navigator.clipboard.writeText(reportText(e)); return !!e; };
export const openFolder = () => vault.reveal(DIR);
export const openFile = (e: Entry) => vault.reveal(`${DIR}/${e.id}.json`, true);

/** Starts listening: page errors, forgotten promises, console warnings and errors (cleaned), and keeps the log tail on disk for the next start. */
export function install() {
  for (const level of ['warn', 'error'] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => { note(`[${level}] ${args.map((a) => (a instanceof Error ? a.message : typeof a === 'string' ? a : typeof a)).join(' ')}`); original(...args); };
  }
  addEventListener('error', (e) => { if (!/ResizeObserver/.test(e.message)) record('error', e.error ?? e.message); });
  addEventListener('unhandledrejection', (e) => {
    const r = e.reason, text = String(r?.message ?? r);
    if (r?.name === 'AbortError' || /^(cancelled|CRASHED)$/.test(text)) return; // a closed picker, a job the app dropped itself
    record('rejection', r instanceof Error ? r : text);
  });
  setInterval(() => { if (dirty) { dirty = false; save(LAST + '-log', log); } }, 2000);
  addEventListener('pagehide', () => save(LAST + '-log', log));
}
/** What the run before this one was doing when it stopped (kept by `install`/`setTask`), for the "closed without a clean exit" entry. */
export const previousRun = () => ({ task: load<{ task?: string }>(LAST, {}).task ?? '', log: load<string[]>(LAST + '-log', []) });
