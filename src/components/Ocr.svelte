<script lang="ts">
  // OCR: reads the pictures of scanned pages (Tesseract, on this device) and adds the words as invisible text over them, so
  // search and copy work. The pictures stay as they are. The result replaces the document (then Save as usual).
  import type { EnginePool } from '../lib/engine/pool';
  import type { Layer } from '../lib/engine/ocr';
  import { onMount } from 'svelte';
  import { startOcr, readPage, upright, pngOf } from '../lib/ocr';
  import { toGray, clean, enlarge } from '../lib/ocr-clean';
  import { bestAvailable, startBest, stopBest } from '../lib/ocr-best';
  import { readBlocks, LONG_SIDE } from '../lib/ocr-strong';
  import { alignBlocks } from '../lib/ocr-align';
  import { lazyPage } from '../lib/lazy';
  import { t } from '../lib/i18n.svelte';
  import { icon } from '../lib/icons.js';

  let { pool, sizes, bytes, onReplace }: { pool: EnginePool; sizes: { w: number; h: number }[]; bytes: Uint8Array; onReplace: (bytes: Uint8Array) => Promise<void> } = $props();
  const W = 560, k = (i: number) => W / sizes[i].w, lazy = lazyPage(() => pool, 'ocr', k);
  let ara = $state(true), eng = $state(true), scope = $state<'scanned' | 'all'>('scanned');
  let quality = $state<'fast' | 'best'>('fast'), bestOn = $state(false); // Best: the desktop add-on, offered only where it can run
  onMount(() => { bestAvailable().then((v) => (bestOn = v)); });
  let busy = $state(false), stopped = false, note = $state(''), error = $state(''), at = $state({ n: 0, of: 0, ratio: 0 });
  // both languages: an Arabic-only pass first, then Arabic + English, merged line by line (the surer reading wins) —
  // measured on tests/fixtures/ocr: 95 % of words right against 94 % for one ara+eng pass (tools/ocr-accuracy.mjs)
  const passes = $derived(ara && eng ? ['ara', 'ara+eng'] : [ara ? 'ara' : eng ? 'eng' : ''].filter(Boolean));

  let abort: AbortController | undefined;
  async function start() {
    busy = true; stopped = false; error = note = ''; at = { n: 0, of: 0, ratio: 0 };
    let engines: Awaited<ReturnType<typeof startOcr>>[] = [], best: string | null = null;
    try {
      // a page without any text is a scan (its words are read from its picture)
      const todo: number[] = [];
      for (let page = 0; page < sizes.length; page++) {
        if (scope === 'all' || !(await pool.run<unknown[]>({ op: 'text', page, priority: 3, key: 'ocrtext' + page, args: { doc: 0 } })).length) todo.push(page);
      }
      if (!todo.length) { note = t('ocrNothing'); return; }
      at.of = todo.length;
      engines = await Promise.all(passes.map((l, k) => startOcr(l, (ratio) => (at.ratio = (k + ratio) / passes.length))));
      if (quality === 'best') { best = await startBest(); if (!best) note = t('ocrBestOff'); } // declined or not started: Fast reads it
      abort = new AbortController();
      const layers: Layer[] = [];
      for (const [n, page] of todo.entries()) {
        if (stopped) return;
        at = { n: n + 1, of: todo.length, ratio: 0 };
        const s = Math.min(250 / 72, 3600 / Math.max(sizes[page].w, sizes[page].h)); // about 250 dpi, never beyond 3600 pixels
        const bmp = await pool.run<ImageBitmap>({ op: 'render', page, priority: 1, args: { scale: s } });
        const canvas = document.createElement('canvas'); canvas.width = bmp.width; canvas.height = bmp.height;
        const ctx = canvas.getContext('2d')!; ctx.drawImage(bmp, 0, 0); bmp.close();
        // the picture Tesseract sees is grey, cleaned and straightened (the page itself stays as it is)
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height), w0 = canvas.width, h0 = canvas.height;
        const up = await upright((g, dpi) => engines[0].readGray(g, dpi), toGray(img.data, w0, h0), s * 72); // a sideways sheet is turned first
        const { gray, angle, ruled } = clean(up.gray);
        let lines = await readPage(engines, gray, s * 72, ruled);
        if (best) { // the stronger model's text on Tesseract's word positions; if it fails, Tesseract's own reading stays
          try {
            const sc = Math.min(1, LONG_SIDE / Math.max(gray.w, gray.h)), small = sc < 1 ? enlarge(gray, sc) : gray;
            lines = alignBlocks((await readBlocks(best, await pngOf(small), small.w, small.h, abort.signal)).map((b) => ({ ...b, x0: b.x0 / sc, x1: b.x1 / sc, y0: b.y0 / sc, y1: b.y1 / sc })), lines);
          } catch { if (stopped) return; }
        }
        layers.push({ page, scale: s, lines, tilt: { angle, w: w0, h: h0, quarter: up.quarter } });
        canvas.width = canvas.height = 0;
      }
      await onReplace(await pool.tool('ocrlayer', { bytes: bytes.slice(), layers }));
    } catch { error = t('toolFailed'); }
    finally { await Promise.all(engines.map((e) => e.stop())); if (best) await stopBest(); busy = false; }
  }
</script>

<div class="ocr">
  <section class="pages" aria-label={t('pages')}>
    {#each sizes as s, i}
      <div class="sheet" style="width:{W}px;height:{s.h * k(i)}px"><canvas use:lazy={i}></canvas></div>
    {/each}
  </section>

  <aside class="side">
    <h2>{t('ocr')}</h2>
    <p class="help">{t('ocrHelp')}</p>
    <h2>{t('ocrLanguages')}</h2>
    <label class="switch"><input type="checkbox" bind:checked={ara} disabled={busy} />{t('ocrArabic')}</label>
    <label class="switch"><input type="checkbox" bind:checked={eng} disabled={busy} />{t('ocrEnglish')}</label>
    <h2>{t('ocrPages')}</h2>
    <label class="choice"><input type="radio" bind:group={scope} value="scanned" disabled={busy} />{t('ocrScanned')}</label>
    <label class="choice"><input type="radio" bind:group={scope} value="all" disabled={busy} />{t('ocrAll')}</label>
    {#if bestOn}
      <h2>{t('ocrQuality')}</h2>
      <label class="choice"><input type="radio" bind:group={quality} value="fast" disabled={busy} />{t('ocrFast')}</label>
      <label class="choice"><input type="radio" bind:group={quality} value="best" disabled={busy} />{t('ocrBest')}</label>
      {#if quality === 'best'}<p class="help">{t('ocrBestHelp')}</p>{/if}
    {/if}
    <span class="grow"></span>
    {#if busy && at.n}
      <p class="state num" aria-live="polite">{t('ocrProgress')} {at.n} / {at.of} — {Math.round(at.ratio * 100)}%</p>
      <progress max="1" value={(at.n - 1 + at.ratio) / at.of} aria-label={t('ocrProgress')}></progress>
    {:else}
      <p class="state" aria-live="polite">{busy ? t('reading') : note}</p>
    {/if}
    {#if busy}
      <button class="btn" onclick={() => { stopped = true; abort?.abort(); }}>{@html icon('close')}{t('cancel')}</button>
    {:else}
      <button class="btn primary" onclick={start} disabled={!passes.length}>{@html icon('ocr')}{t('ocrStart')}</button>
    {/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
  </aside>
</div>

<style>
  .ocr { height: 100%; display: grid; grid-template-columns: 1fr 340px; min-height: 0; }
  .pages { display: flex; flex-direction: column; align-items: center; gap: var(--s-16); background: var(--canvas); padding: var(--s-24); overflow: auto; }
  .sheet { position: relative; flex: none; background: #fff; box-shadow: var(--shadow); }
  .sheet canvas { width: 100%; height: 100%; display: block; }
  .side { display: flex; flex-direction: column; gap: var(--s-12); padding: var(--s-16); background: var(--surface); border-inline-start: 1px solid var(--line); overflow-y: auto; }
  h2 { margin: var(--s-8) 0 0; font-size: var(--fs-18); }
  .help, .state { margin: 0; color: var(--muted); }
  .state { font-size: var(--fs-12); min-height: 18px; }
  progress { width: 100%; accent-color: var(--green); }
  .switch, .choice { display: flex; align-items: center; gap: var(--s-8); min-height: var(--control); font-weight: 600; }
  .switch input, .choice input { flex: none; width: 20px; height: 20px; accent-color: var(--green); }
  .grow { flex: 1; }
  .error { margin: 0; color: var(--danger); }
  @media (max-width: 900px) { .ocr { grid-template-columns: 1fr; grid-template-rows: 1fr auto; } .side { border-inline-start: 0; border-top: 1px solid var(--line); } }
</style>
