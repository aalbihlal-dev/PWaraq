<script lang="ts">
  // Page thumbnails, drawn when they scroll into view, after the pages being read (lower priority).
  import { onMount } from 'svelte';
  import type { EnginePool } from '../lib/engine/pool';
  import { t } from '../lib/i18n.svelte';

  let { pool, sizes, current, onGo }: { pool: EnginePool; sizes: { w: number; h: number }[]; current: number; onGo: (n: number) => void } = $props();
  const WIDTH = 120;
  let list: HTMLElement;
  const canvases: HTMLCanvasElement[] = [];

  onMount(() => {
    const io = new IntersectionObserver(async (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        io.unobserve(e.target);
        const n = Number((e.target as HTMLElement).dataset.n), s = (WIDTH / sizes[n].w) * Math.min(devicePixelRatio || 1, 2);
        pool.run<ImageBitmap>({ op: 'render', page: n, priority: 5, key: 'thumb' + n, args: { scale: s } }).then((bmp) => {
          const c = canvases[n]; c.width = bmp.width; c.height = bmp.height; c.getContext('2d')!.drawImage(bmp, 0, 0); bmp.close();
        }).catch(() => io.observe(e.target)); // dropped: try again when it is visible
      }
    }, { root: list, rootMargin: '100% 0px' });
    list.querySelectorAll('[data-n]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  });
  // keep the current page's thumbnail in view, scrolling only this list
  $effect(() => {
    const el = list?.querySelector<HTMLElement>(`[data-n="${current - 1}"]`); if (!el) return;
    const r = el.getBoundingClientRect(), box = list.getBoundingClientRect();
    if (r.top < box.top) list.scrollTop -= box.top - r.top + 8; else if (r.bottom > box.bottom) list.scrollTop += r.bottom - box.bottom + 8;
  });
</script>

<nav class="thumbs" bind:this={list} aria-label={t('thumbnails')}>
  {#each sizes as size, n}
    <button class="thumb" class:on={n === current - 1} data-n={n} onclick={() => onGo(n + 1)} aria-label="{t('page')} {n + 1}"
      aria-current={n === current - 1 ? 'page' : undefined}>
      <canvas bind:this={canvases[n]} style:aspect-ratio="{size.w} / {size.h}"></canvas>
      <span class="num">{n + 1}</span>
    </button>
  {/each}
</nav>

<style>
  .thumbs { height: 100%; overflow-y: auto; overflow-x: hidden; padding: var(--s-12); display: grid; gap: var(--s-12); align-content: start; border-inline-end: 1px solid var(--line); background: var(--surface); }
  .thumb { display: grid; gap: var(--s-4); justify-items: center; padding: var(--s-8); border: 2px solid transparent; border-radius: var(--r-8); background: none; color: var(--muted); }
  .thumb:hover { background: var(--green-soft); }
  .thumb.on { border-color: var(--green); color: var(--ink); }
  .thumb canvas { width: 120px; max-width: 100%; height: auto; background: #fff; box-shadow: var(--shadow); }
  .thumb span { font-size: var(--fs-12); }
</style>
