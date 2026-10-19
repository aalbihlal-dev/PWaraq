// A pool of engine workers. Page n always goes to worker n % size, so that worker keeps the page in memory.
// Each worker runs one job at a time; waiting jobs stay here, so they can be re-prioritised or dropped
// (a page scrolled away) before they reach the engine, which cannot be interrupted mid-drawing.
import type { Build } from './assemble';

export type Job = { op: string; page?: number; priority: number; args: Record<string, any>; key?: string; any?: boolean };
type Waiting = Job & { resolve: (v: any) => void; reject: (e: Error) => void; queued?: number; started?: number; w?: number };
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
  private sources = new Map<number, { bytes: Uint8Array; mime: string }>(); // to open them again in a restarted worker
  sizes: { w: number; h: number }[] = [];

  // Each worker may hold a heavy page (~800 MB for an A0 CAD sheet): fewer workers on PCs with less memory.
  constructor(size = Math.max(1, Math.min((navigator as any).deviceMemory >= 8 ? 4 : 2, (navigator.hardwareConcurrency || 2) - 1))) {
    this.workers = []; this.busy = []; this.queues = [];
    for (let i = 0; i < size; i++) { this.queues.push([]); this.spawn(i); }
  }

  private spawn(i: number) {
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = ({ data }) => this.reply(i, data);
    this.workers[i] = w; this.busy[i] = false;
  }

  /** Opens the document as source 0 in every worker (each keeps its own copy), forgetting all other sources. */
  async open(bytes: Uint8Array) {
    await this.reset();
    this.sizes = await this.load(0, bytes);
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

  /** A new PDF from pages of the open sources. */
  build(build: Build) {
    this.drop(() => false); // jobs waiting in line are asked for again by their pages later: building comes first
    return this.run<Uint8Array>({ op: 'build', priority: 0, args: { build }, any: true });
  }

  private async load(doc: number, bytes: Uint8Array, mime = 'application/pdf'): Promise<{ w: number; h: number }[]> {
    this.sources.set(doc, { bytes, mime });
    const all = await Promise.all(this.workers.map((_, i) => this.direct(i, 'open', { doc, mime, bytes: bytes.slice() })));
    return all[0].sizes;
  }

  /** A fresh worker in place of worker `w` (whose job is dropped), with every source opened again. */
  private async restart(w: number) {
    this.workers[w].terminate();
    for (const [id, j] of this.replies) if (j.w === w) { this.replies.delete(id); j.reject(new Error('cancelled')); }
    this.spawn(w);
    await Promise.all([...this.sources].map(([doc, s]) => this.direct(w, 'open', { doc, mime: s.mime, bytes: s.bytes.slice() })));
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
    if (job) data.error ? job.reject(new Error(data.error)) : job.resolve(data.result);
    this.pump(w);
  }

  destroy() { this.workers.forEach((w) => w.terminate()); }
}
