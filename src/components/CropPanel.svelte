<script lang="ts">
  // Crop in Organize: drag a box on the page; what is outside it is hidden (CropBox — nothing is deleted, so it can be
  // undone or uncropped later). The box is kept as fractions of the page as seen, so it fits turned pages too.
  import type { EnginePool } from '../lib/engine/pool';
  import { t } from '../lib/i18n.svelte';
  import { icon } from '../lib/icons.js';
  import { seen, turned, type GridItem } from '../lib/pages';

  let { pool, item, count, onApply, onClose }: { pool: EnginePool; item: GridItem; count: number;
    onApply: (crop: number[] | undefined, all: boolean) => void; onClose: () => void } = $props();

  const W = 268;
  const s = $derived(seen(item)), k = $derived(Math.min(W / s.w, (W * 1.3) / s.h));
  // svelte-ignore state_referenced_locally (the panel is rebuilt for another page)
  let box = $state<number[]>(item.crop ? [...item.crop] : [0.05, 0.05, 0.95, 0.95]);
  let canvas: HTMLCanvasElement, area: HTMLDivElement;
  $effect(() => {
    const it = item;
    if (it.blank) return;
    pool.run<ImageBitmap>({ op: 'render', page: it.page, priority: 1, key: 'crop', args: { doc: it.doc, scale: (W / it.w) * Math.min(devicePixelRatio || 1, 2) } })
      .then((bmp) => { canvas.width = bmp.width; canvas.height = bmp.height; canvas.getContext('2d')!.drawImage(bmp, 0, 0); bmp.close(); }).catch(() => {});
  });

  // drag on the page draws a new box; arrows / fields allow exact values
  let start: number[] | null = null;
  const at = (e: PointerEvent) => { const r = area.getBoundingClientRect(); return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))]; };
  function down(e: PointerEvent) { area.setPointerCapture(e.pointerId); start = at(e); }
  function moved(e: PointerEvent) {
    if (!start) return;
    const p = at(e);
    box = [Math.min(start[0], p[0]), Math.min(start[1], p[1]), Math.max(start[0], p[0]), Math.max(start[1], p[1])];
  }
  const pct = (v: number) => Math.round(v * 1000) / 10;
  const ok = $derived(box[2] - box[0] > 0.02 && box[3] - box[1] > 0.02);
  // margins in % for the fields: left, top, right, bottom
  const margin = (i: number) => pct(i < 2 ? box[i] : 1 - box[i]);
  function setMargin(i: number, v: number) { const f = Math.min(45, Math.max(0, v)) / 100; box[i] = i < 2 ? f : 1 - f; }
</script>

<aside class="panel" aria-label={t('crop')}>
  <div class="head"><h2>{t('crop')}</h2><button class="btn icon" onclick={onClose} title={t('close')} aria-label={t('close')}>{@html icon('close')}</button></div>
  <p class="help">{t('cropHelp')}</p>
  <!-- svelte-ignore a11y_no_static_element_interactions (pointer drawing; the margin fields below do the same by keyboard) -->
  <div class="area" bind:this={area} style="width:{s.w * k}px;height:{s.h * k}px" onpointerdown={down} onpointermove={moved} onpointerup={() => (start = null)}>
    <canvas bind:this={canvas} style="width:{item.w * k}px;height:{item.h * k}px;transform:translate(-50%,-50%) rotate({turned(item)}deg)"></canvas>
    <i class="keep" style="left:{box[0] * 100}%;top:{box[1] * 100}%;width:{(box[2] - box[0]) * 100}%;height:{(box[3] - box[1]) * 100}%"></i>
  </div>
  <div class="margins">
    {#each [['cropLeft', 0], ['cropTop', 1], ['cropRight', 2], ['cropBottom', 3]] as [label, i]}
      <label><span>{t(label as any)}</span><input type="number" min="0" max="45" step="0.5" aria-label={t(label as any)} value={margin(i as number)} oninput={(e) => setMargin(i as number, +e.currentTarget.value)} />%</label>
    {/each}
  </div>
  <button class="btn primary" disabled={!ok} onclick={() => onApply(box, false)}>{@html icon('crop')}{t('cropSelected')} ({count})</button>
  <button class="btn" disabled={!ok} onclick={() => onApply(box, true)}>{t('cropAll')}</button>
  <button class="btn" onclick={() => onApply(undefined, false)}>{t('uncrop')}</button>
</aside>

<style>
  .panel { width: 320px; display: flex; flex-direction: column; gap: var(--s-12); padding: var(--s-16); background: var(--surface); border-inline-start: 1px solid var(--line); overflow-y: auto; }
  .head { display: flex; align-items: center; justify-content: space-between; }
  h2 { margin: 0; font-size: var(--fs-18); }
  .help { margin: 0; color: var(--muted); }
  .area { position: relative; align-self: center; background: #fff; box-shadow: var(--shadow); overflow: hidden; cursor: crosshair; touch-action: none; }
  .area canvas { position: absolute; left: 50%; top: 50%; pointer-events: none; }
  .keep { position: absolute; outline: 2px solid var(--green); box-shadow: 0 0 0 9999px #233c3666; pointer-events: none; }
  .margins { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-8); }
  .margins label { display: grid; grid-template-columns: 1fr auto auto; align-items: center; gap: var(--s-4); }
  .margins input { width: 64px; min-height: var(--control); padding: 0 var(--s-8); border: 1px solid var(--line); border-radius: var(--r-8); background: var(--paper); }
</style>
