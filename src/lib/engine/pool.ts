// A pool of engine workers. Page n always goes to worker n % size, so that worker keeps the page in memory.
// Each worker runs one job at a time; waiting jobs stay here, so they can be re-prioritised or dropped
// (a page scrolled away) before they reach the engine, which cannot be interrupted mid-drawing.

export type Job = { op: string; page?: number; priority: number; args: Record<string, any>; key?: string };
type Waiting = Job & { resolve: (v: any) => void; reject: (e: Error) => void; queued?: number; started?: number };
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
  sizes: { w: number; h: number }[] = [];

  // Each worker may hold a heavy page (~800 MB for an A0 CAD sheet): fewer workers on PCs with less memory.
  constructor(size = Math.max(1, Math.min((navigator as any).deviceMemory >= 8 ? 4 : 2, (navigator.hardwareConcurrency || 2) - 1))) {
    this.workers = Array.from({ length: size }, () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }));
    this.busy = this.workers.map(() => false);
    this.queues = this.workers.map(() => []);
    this.workers.forEach((w, i) => (w.onmessage = ({ data }) => this.reply(i, data)));
  }

  /** Opens the document in every worker (each keeps its own copy). */
  async open(bytes: Uint8Array) {
    this.queues.forEach((q) => q.splice(0).forEach((j) => j.reject(new Error('cancelled'))));
    const all = await Promise.all(this.workers.map((_, i) => this.direct(i, 'open', { bytes: bytes.slice() })));
    this.sizes = all[0].sizes;
    return this.sizes;
  }

  /** Queues a job; a job with the same key replaces the waiting one (e.g. a newer zoom for the same page). */
  run<T = any>(job: Job): Promise<T> {
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
    this.busy[w] = true; job.started = performance.now(); this.replies.set(id, job);
    this.workers[w].postMessage({ id, op: job.op, page: job.page, ...job.args });
  }

  private direct(w: number, op: string, args: Record<string, any>) {
    return new Promise<any>((resolve, reject) => {
      const id = this.nextId++;
      this.replies.set(id, { op, priority: -1, args, resolve, reject });
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
