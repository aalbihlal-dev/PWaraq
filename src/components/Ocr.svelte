<script lang="ts">
  // OCR: reads the pictures of scanned pages (Tesseract, on this device) and adds the words as invisible text over them, so
  // search and copy work. The pictures stay as they are. The result replaces the document (then Save as usual).
  import type { EnginePool } from '../lib/engine/pool';
  import type { Layer } from '../lib/engine/ocr';
  import { startOcr } from '../lib/ocr';
  import { lazyPage } from '../lib/lazy';
  import { t } from '../lib/i18n.svelte';
  import { icon } from '../lib/icons.js';

  let { pool, sizes, bytes, onReplace }: { pool: EnginePool; sizes: { w: number; h: number }[]; bytes: Uint8Array; onReplace: (bytes: Uint8Array) => Promise<void> } = $props();
  const W = 560, k = (i: number) => W / sizes[i].w, lazy = lazyPage(() => pool, 'ocr', k);
  let ara = $state(true), eng = $state(true), scope = $state<'scanned' | 'all'>('scanned');
  let busy = $state(false), stopped = false, note = $state(''), error = $state(''), at = $state({ n: 0, of: 0, ratio: 0 });
  const languages = $derived([ara && 'ara', eng && 'eng'].filter(Boolean).join('+'));

  async function start() {
    busy = true; stopped = false; error = note = ''; at = { n: 0, of: 0, ratio: 0 };
    let engine: Awaited<ReturnType<typeof startOcr>> | undefined;
    try {
      // a page without any text is a scan (its words are read from its picture)
      const todo: number[] = [];
      for (let page = 0; page < sizes.length; page++) {
        if (scope === 'all' || !(await pool.run<unknown[]>({ op: 'text', page, priority: 3, key: 'ocrtext' + page, args: { doc: 0 } })).length) todo.push(page);
      }
      if (!todo.length) { note = t('ocrNothing'); return; }
      at.of = todo.length;
      engine = await startOcr(languages, (ratio) => (at.ratio = ratio));
      const layers: Layer[] = [];
      for (const [n, page] of todo.entries()) {
        if (stopped) return;
        at = { n: n + 1, of: todo.length, ratio: 0 };
        const s = Math.min(250 / 72, 3600 / Math.max(sizes[page].w, sizes[page].h)); // about 250 dpi, never beyond 3600 pixels
        const bmp = await pool.run<ImageBitmap>({ op: 'render', page, priority: 1, args: { scale: s } });
        const canvas = document.createElement('canvas'); canvas.width = bmp.width; canvas.height = bmp.height;
        canvas.getContext('2d')!.drawImage(bmp, 0, 0); bmp.close();
        layers.push({ page, scale: s, words: await engine.read(canvas, s * 72) });
        canvas.width = canvas.height = 0;
      }
      await onReplace(await pool.tool('ocrlayer', { bytes: bytes.slice(), layers }));
    } catch { error = t('toolFailed'); }
    finally { await engine?.stop(); busy = false; }
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
    <span class="grow"></span>
    {#if busy && at.n}
      <p class="state num" aria-live="polite">{t('ocrProgress')} {at.n} / {at.of} — {Math.round(at.ratio * 100)}%</p>
      <progress max="1" value={(at.n - 1 + at.ratio) / at.of} aria-label={t('ocrProgress')}></progress>
    {:else}
      <p class="state" aria-live="polite">{busy ? t('reading') : note}</p>
    {/if}
    {#if busy}
      <button class="btn" onclick={() => (stopped = true)}>{@html icon('close')}{t('cancel')}</button>
    {:else}
      <button class="btn primary" onclick={start} disabled={!languages}>{@html icon('ocr')}{t('ocrStart')}</button>
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
