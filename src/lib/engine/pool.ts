// A pool of engine workers. Page n always goes to worker n % size, so that worker keeps the page in memory.
// Each worker runs one job at a time; waiting jobs stay here, so they can be re-prioritised or dropped
// (a page scrolled away) before they reach the engine, which cannot be interrupted mid-drawing.
import type { Build } from './assemble';

export type Job = { op: string; page?: number; priority: number; args: Record<string, any>; key?: string; any?: boolean };
type Waiting = Job & { resolve: (v: any) => void; reject: (e: Error) => void; queued?: number; started?: number; w?: number; retried?: boolean };
// what the app is told: the engine crashed and was restarted, or a job has been running for a long time (or no longer)
export type Health = { kind: 'recovered'; why: string; op?: string } | { kind: 'slow'; seconds: number } | { kind: 'fine' };
const DEAD = /abort|out of bounds|unreachable|out of memory|memory access/i; // a WebAssembly engine that hit these cannot be trusted any more
// ?timing in the address: engine timings are kept in window.engineTimes (for measurements)
const timing = typeof location !== 'undefined' && location.search.includes('timing');
export const engineTimes: { op: string; page?: number; key?: string; waitMs: number; workMs: number; at: number }[] = [];
if (timing) (globalThis as any).engineTimes = engineTimes;

export class EnginePool {
  private workers: Worker[];
  private busy: boolean[];
  private queues: Waiting[][];
  private replies = new Map<number, Waiting>();
  private nextId = 1;
  private nextDoc = 1;
  private sources = new Map<number, { bytes: Uint8Array; mime: string; password?: string }>(); // to open them again in a restarted worker
  sizes: { w: number; h: number }[] = [];
  repaired = false; // the last opened document needed MuPDF's repair (damaged file)
  onHealth?: (h: Health) => void;
  slowMs = 20_000; // a job running this long gets a Cancel button
  private crashes: number[] = [];
  private watch: ReturnType<typeof setInterval> | undefined;

  // Each worker may hold a heavy page (~800 MB for an A0 CAD sheet): fewer workers on PCs with less memory.
  constructor(size = Math.max(1, Math.min((navigator as any).deviceMemory >= 8 ? 4 : 2, (navigator.hardwareConcurrency || 2) - 1))) {
    this.workers = []; this.busy = []; this.queues = [];
    for (let i = 0; i < size; i++) { this.queues.push([]); this.spawn(i); }
  }

  private spawn(i: number) {
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = ({ data }) => this.reply(i, data);
    w.onerror = (e) => { e.preventDefault(); this.recover(i, e.message || 'worker error'); }; // the worker died with an error nobody caught
    w.onmessageerror = () => this.recover(i, 'worker message error');
    this.workers[i] = w; this.busy[i] = false;
    this.watch ??= setInterval(() => this.checkSlow(), 2000);
  }

  /** The longest a job has been in the engine, in seconds (0 when idle). */
  private longest() { let ms = 0; for (const j of this.replies.values()) if (j.priority !== -1 && j.started) ms = Math.max(ms, performance.now() - j.started); return Math.round(ms / 1000); }
  private slow = false;
  private checkSlow() {
    const sec = this.longest(), slow = sec * 1000 >= this.slowMs;
    if (slow) this.onHealth?.({ kind: 'slow', seconds: sec });
    else if (this.slow) this.onHealth?.({ kind: 'fine' });
    this.slow = slow;
  }

  /** The user gave up waiting: busy workers are replaced (their jobs end as "cancelled"), the open documents stay. */
  async cancelAll() {
    await Promise.all(this.workers.map((_, i) => (this.busy[i] ? this.restart(i) : null)));
    this.slow = false; this.onHealth?.({ kind: 'fine' });
  }

  /** A worker crashed (or its WebAssembly engine aborted): a fresh one takes its place with the same documents, and the
   *  job it was doing is tried once more — a second crash of the same job is reported instead of looping. */
  private async recover(w: number, why: string) {
    const now = Date.now();
    this.crashes = this.crashes.filter((t) => now - t < 10_000).concat(now);
    const lost = [...this.replies].filter(([, j]) => j.w === w);
    for (const [id] of lost) this.replies.delete(id);
    this.workers[w].terminate(); this.spawn(w);
    const giveUp = this.crashes.length > 3; // the engine cannot even start: stop restarting
    try { await Promise.all([...this.sources].map(([doc, s]) => this.direct(w, 'open', { doc, mime: s.mime, password: s.password, bytes: s.bytes.slice() }))); } catch { /* a source that no longer opens fails its own jobs */ }
    for (const [, j] of lost) {
      if (j.priority === -1 || j.retried || giveUp) j.reject(new Error('CRASHED'));
      else { j.retried = true; this.queues[w].unshift(j); }
    }
    this.onHealth?.({ kind: 'recovered', why, op: lost.find(([, j]) => j.priority !== -1)?.[1].op });
    this.pump(w);
  }

  /** Opens the document as source 0 in every worker (each keeps its own copy), forgetting all other sources. */
  async open(bytes: Uint8Array, password?: string) {
    await this.reset();
    this.sizes = await this.load(0, bytes, 'application/pdf', password);
    return this.sizes;
  }

  /** Forgets every open source (a new document or portfolio). */
  async reset() {
    this.queues.forEach((q) => q.splice(0).forEach((j) => j.reject(new Error('cancelled'))));
    // a worker still drawing (a heavy CAD page takes seconds and cannot be interrupted) is replaced, not waited for
    this.sources.clear(); this.nextDoc = 1;
    await Promise.all(this.workers.map((_, i) => (this.busy[i] ? this.restart(i) : null)));
    await Promise.all(this.workers.map((_, i) => this.direct(i, 'reset', {})));
  }

  /** Opens one more source (a PDF or an image) next to the document; jobs name it by `args.doc`. */
  async add(bytes: Uint8Array, mime = 'application/pdf') {
    const id = this.nextDoc++;
    return { id, sizes: await this.load(id, bytes, mime) };
  }

  /** A whole-file tool (compress, protect, unlock) on `bytes`, in whichever worker is free. */
  tool<T = Uint8Array>(op: 'compress' | 'protect' | 'unlock' | 'guard' | 'seal' | 'redact' | 'formfields' | 'fillform' | 'ocrlayer' | 'annotlist' | 'annotapply' | 'verify' | 'repair', args: Record<string, any>) { return this.run<T>({ op, priority: 0, args, any: true }); }

  /** The password the open document was opened with ('' when none). */
  get password() { return this.sources.get(0)?.password ?? ''; }

  /** `out` (a new copy of the open document) with the document's own protection: same algorithm, password and limits. */
  keep(out: Uint8Array) {
    const s = this.sources.get(0);
    return s ? this.tool('seal', { bytes: out, src: s.bytes.slice(), current: s.password ?? '' }) : Promise.resolve(out);
  }

  /** A new PDF from pages of the open sources. */
  build(build: Build) {
    this.drop(() => false); // jobs waiting in line are asked for again by their pages later: building comes first
    return this.run<Uint8Array>({ op: 'build', priority: 0, args: { build }, any: true });
  }

  private async load(doc: number, bytes: Uint8Array, mime = 'application/pdf', password?: string): Promise<{ w: number; h: number }[]> {
    const all = await Promise.all(this.workers.map((_, i) => this.direct(i, 'open', { doc, mime, password, bytes: bytes.slice() })));
    this.sources.set(doc, { bytes, mime, password });
    if (doc === 0) this.repaired = !!all[0].repaired;
    return all[0].sizes;
  }

  /** A fresh worker in place of worker `w` (whose job is dropped), with every source opened again. */
  private async restart(w: number) {
    this.workers[w].terminate();
    for (const [id, j] of this.replies) if (j.w === w) { this.replies.delete(id); j.reject(new Error('cancelled')); }
    this.spawn(w);
    await Promise.all([...this.sources].map(([doc, s]) => this.direct(w, 'open', { doc, mime: s.mime, password: s.password, bytes: s.bytes.slice() })));
  }

  /** Queues a job; a job with the same key replaces the waiting one (e.g. a newer zoom for the same page). */
  run<T = any>(job: Job): Promise<T> {
    // every worker has every source open: a job for `any` worker goes to an idle one; when all are in the middle of
    // a drawing (heavy CAD pages take seconds), one is restarted for it (opening the sources again is quick)
    if (job.any) {
      const idle = this.busy.findIndex((b, i) => !b && !this.queues[i].length);
      if (idle < 0) return this.restart(0).then(() => this.run<T>({ ...job, any: false, page: 0 }));
      return this.run<T>({ ...job, any: false, page: idle });
    }
    const w = (job.page ?? 0) % this.workers.length, q = this.queues[w];
    if (job.key) { const old = q.findIndex((j) => j.key === job.key); if (old >= 0) q.splice(old, 1)[0].reject(new Error('cancelled')); }
    return new Promise<T>((resolve, reject) => { q.push({ ...job, resolve, reject, queued: performance.now() }); this.pump(w); });
  }

  /** Drops waiting jobs that no longer matter (keeps the one already in the engine). */
  drop(keep: (job: Job) => boolean) {
    for (const q of this.queues) for (let i = q.length - 1; i >= 0; i--) if (!keep(q[i])) q.splice(i, 1)[0].reject(new Error('cancelled'));
  }

  private pump(w: number) {
    if (this.busy[w] || !this.queues[w].length) return;
    const q = this.queues[w];
    q.sort((a, b) => a.priority - b.priority); // lower number first (visible pages)
    const job = q.shift()!, id = this.nextId++;
    this.busy[w] = true; job.started = performance.now(); job.w = w; this.replies.set(id, job);
    this.workers[w].postMessage({ id, op: job.op, page: job.page, ...job.args });
  }

  private direct(w: number, op: string, args: Record<string, any>) {
    return new Promise<any>((resolve, reject) => {
      const id = this.nextId++;
      this.replies.set(id, { op, priority: -1, args, resolve, reject, w });
      this.workers[w].postMessage({ id, op, ...args }, args.bytes ? [args.bytes.buffer] : []);
    });
  }

  private reply(w: number, data: { id: number; result?: any; error?: string }) {
    const job = this.replies.get(data.id); this.replies.delete(data.id);
    if (job && job.priority !== -1) this.busy[w] = false;
    if (timing && job?.started) engineTimes.push({ op: job.op, page: job.page, key: job.key, waitMs: Math.round(job.started - job.queued!), workMs: Math.round(performance.now() - job.started), at: Math.round(performance.now()) });
    if (data.error && DEAD.test(data.error) && job && job.priority !== -1) { this.replies.set(data.id, job); this.recover(w, data.error); return; } // the engine says it aborted
    if (job) data.error ? job.reject(new Error(data.error)) : job.resolve(data.result);
    this.pump(w);
  }

  destroy() { clearInterval(this.watch); this.workers.forEach((w) => w.terminate()); }
}
