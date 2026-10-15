<script lang="ts">
  // The document viewer: pages laid out top to bottom, drawn by the engine pool.
  // Zooming resizes the pages at once (the current image stretches) and the engine redraws them sharp shortly after;
  // when a page would be too large for one image, the visible part is drawn as a sharp tile on top.
  import { onMount, tick } from 'svelte';
  import type { EnginePool } from '../lib/engine/pool';
  import { t } from '../lib/i18n.svelte';
  import { cached, remember } from '../lib/engine/page-cache';

  let { pool, sizes, current = $bindable(1) }: { pool: EnginePool; sizes: { w: number; h: number }[]; current?: number } = $props();

  let scroller: HTMLDivElement;
  let zoom = $state<'width' | 'page' | number>('width');
  let scale = $state(1); // CSS pixels per PDF point
  const MAX_PIXELS = 16_000_000; // one page image; beyond this the visible part is drawn as a tile
  const dpr = () => Math.min(window.devicePixelRatio || 1, 3);
  const widest = $derived(Math.max(...sizes.map((s) => s.w)));

  type PageState = { el?: HTMLDivElement; canvas?: HTMLCanvasElement; tile?: HTMLCanvasElement; drawn: number; visible: boolean };
  // svelte-ignore state_referenced_locally (a new document gets a new workspace, so the page count is fixed here)
  const pages: PageState[] = sizes.map(() => ({ drawn: 0, visible: false }));

  function fitScale() {
    const w = scroller.clientWidth - 48, h = scroller.clientHeight - 32;
    if (zoom === 'width') return Math.max(0.05, w / widest);
    if (zoom === 'page') return Math.max(0.05, Math.min(w / sizes[current - 1].w, h / sizes[current - 1].h));
    return zoom;
  }
  // device pixels per point for the whole-page image: steps of √2 so small zoom changes reuse the image
  function imageScale(n: number) {
    const want = scale * dpr(), step = Math.pow(2, Math.round(Math.log2(want) * 2) / 2);
    const cap = Math.sqrt(MAX_PIXELS / (sizes[n].w * sizes[n].h));
    return Math.min(step, cap);
  }

  let settle: ReturnType<typeof setTimeout>;
  function schedule(delay = 0) { clearTimeout(settle); settle = setTimeout(drawVisible, delay); }

  function drawVisible() {
    const visible = pages.map((p, i) => (p.visible ? i : -1)).filter((i) => i >= 0);
    pool.drop((job) => job.op !== 'render' || visible.includes(job.page!) || (job.key ?? '').startsWith('thumb'));
    for (const n of visible) drawPage(n);
  }

  async function drawPage(n: number) {
    const p = pages[n], s = imageScale(n);
    if (p.drawn !== s) {
      try {
        let bmp = await cached(n, s);
        if (!bmp) {
          const t0 = performance.now();
          bmp = await pool.run<ImageBitmap>({ op: 'render', page: n, priority: n === current - 1 ? 0 : 1, key: 'page' + n, args: { scale: s } });
          if (performance.now() - t0 > 1500) remember(n, s, bmp); // heavy page: keep it for the next time this file is opened
        }
        if (p.canvas) { p.canvas.width = bmp.width; p.canvas.height = bmp.height; p.canvas.getContext('2d')!.drawImage(bmp, 0, 0); p.drawn = s; }
        bmp.close();
      } catch { return; }
    }
    drawTile(n);
  }

  // Zoomed in beyond one image: draw just the visible part of the page at full sharpness.
  async function drawTile(n: number) {
    const p = pages[n], s = scale * dpr();
    if (!p.el || !p.tile) return;
    if (p.drawn >= s * 0.95) { p.tile.hidden = true; return; }
    const r = p.el.getBoundingClientRect(), box = scroller.getBoundingClientRect();
    const x0 = Math.max(0, box.left - r.left), y0 = Math.max(0, box.top - r.top);
    const x1 = Math.min(r.width, box.right - r.left), y1 = Math.min(r.height, box.bottom - r.top);
    if (x1 <= x0 || y1 <= y0) return;
    const d = dpr(), args = { scale: s, x: Math.floor(x0 * d), y: Math.floor(y0 * d), w: Math.ceil((x1 - x0) * d), h: Math.ceil((y1 - y0) * d) };
    try {
      const bmp = await pool.run<ImageBitmap>({ op: 'render', page: n, priority: 0, key: 'tile' + n, args });
      if (Math.abs(scale * dpr() - s) > 1e-6) { bmp.close(); return; } // zoom changed meanwhile
      Object.assign(p.tile.style, { left: x0 + 'px', top: y0 + 'px', width: x1 - x0 + 'px', height: y1 - y0 + 'px' });
      p.tile.width = bmp.width; p.tile.height = bmp.height; p.tile.getContext('2d')!.drawImage(bmp, 0, 0); p.tile.hidden = false;
      bmp.close();
    } catch {}
  }

  // Zoom keeping the point under the cursor (or the centre) in place.
  export async function zoomTo(next: number | 'width' | 'page', cx?: number, cy?: number) {
    const box = scroller.getBoundingClientRect();
    cx ??= box.left + box.width / 2; cy ??= box.top + box.height / 2;
    const fx = (scroller.scrollLeft + cx - box.left) / scroller.scrollWidth, fy = (scroller.scrollTop + cy - box.top) / scroller.scrollHeight;
    zoom = typeof next === 'number' ? Math.min(16, Math.max(0.05, next)) : next;
    scale = fitScale();
    pages.forEach((p) => p.tile && (p.tile.hidden = true));
    await tick();
    scroller.scrollLeft = fx * scroller.scrollWidth - (cx - box.left);
    scroller.scrollTop = fy * scroller.scrollHeight - (cy - box.top);
    schedule(160);
  }
  export const zoomBy = (factor: number) => zoomTo(scale * factor);
  export function goTo(n: number) { pages[n - 1]?.el?.scrollIntoView({ block: 'start' }); }
  export const zoomLabel = () => Math.round(scale * 100) + '%';

  function onWheel(e: WheelEvent) {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    zoomTo(scale * Math.exp(-(e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY) * 0.0022), e.clientX, e.clientY);
  }
  // pan with the middle button or Space + drag
  let space = $state(false), drag: { x: number; y: number; l: number; t: number } | null = null;
  function onDown(e: PointerEvent) {
    if (e.button !== 1 && !(e.button === 0 && space)) return;
    e.preventDefault(); scroller.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, l: scroller.scrollLeft, t: scroller.scrollTop };
  }
  function onMove(e: PointerEvent) { if (drag) { scroller.scrollLeft = drag.l - (e.clientX - drag.x); scroller.scrollTop = drag.t - (e.clientY - drag.y); } }

  onMount(() => {
    scale = fitScale();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) pages[Number((e.target as HTMLElement).dataset.n)].visible = e.isIntersecting;
      schedule();
    }, { root: scroller, rootMargin: '50% 0px' });
    const track = new IntersectionObserver((entries) => {
      const top = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (top) current = Number((top.target as HTMLElement).dataset.n) + 1;
    }, { root: scroller, threshold: [0.25, 0.5, 0.75] });
    pages.forEach((p) => { io.observe(p.el!); track.observe(p.el!); });
    const resize = new ResizeObserver(() => { if (typeof zoom !== 'number') { scale = fitScale(); schedule(160); } });
    resize.observe(scroller);
    const keys = (e: KeyboardEvent) => {
      if (e.key === ' ' && !(e.target as HTMLElement).closest('input,textarea')) { space = e.type === 'keydown'; if (space) e.preventDefault(); }
      if (e.type !== 'keydown' || !(e.ctrlKey || e.metaKey)) return;
      const act: Record<string, () => void> = { '=': () => zoomBy(1.25), '+': () => zoomBy(1.25), '-': () => zoomBy(0.8), '0': () => zoomTo('page'), '1': () => zoomTo(1), '2': () => zoomTo('width') };
      if (act[e.key]) { e.preventDefault(); act[e.key](); }
    };
    addEventListener('keydown', keys); addEventListener('keyup', keys);
    return () => { io.disconnect(); track.disconnect(); resize.disconnect(); removeEventListener('keydown', keys); removeEventListener('keyup', keys); };
  });
</script>

<div class="scroller" bind:this={scroller} onwheel={onWheel} onpointerdown={onDown} onpointermove={onMove}
  onpointerup={() => (drag = null)} onscroll={() => schedule(120)} class:grab={space} role="document" aria-label={t('pages')}>
  {#each sizes as size, n}
    <div class="page" data-n={n} bind:this={pages[n].el} style:width="{size.w * scale}px" style:height="{size.h * scale}px"
      role="img" aria-label="{t('page')} {n + 1}">
      <canvas bind:this={pages[n].canvas}></canvas>
      <canvas class="tile" bind:this={pages[n].tile} hidden></canvas>
    </div>
  {/each}
</div>

<style>
  .scroller { position: relative; height: 100%; overflow: auto; background: var(--canvas); padding: var(--s-16) var(--s-24); overscroll-behavior: contain; }
  .scroller.grab { cursor: grab; }
  .page { position: relative; margin: 0 auto var(--s-16); background: #fff; box-shadow: var(--shadow); }
  .page canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
  .page canvas.tile { inset: auto; }
</style>
