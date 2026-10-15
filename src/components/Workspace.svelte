<script lang="ts">
  // The document workspace: one task bar on top, thumbnails on the left, the page in the middle.
  import type { EnginePool } from '../lib/engine/pool';
  import { t, toggleLanguage, type Key } from '../lib/i18n.svelte';
  import { icon } from '../lib/icons.js';
  import Viewer from './Viewer.svelte';
  import Thumbnails from './Thumbnails.svelte';

  let { pool, sizes, name, onOpen, onClose }: { pool: EnginePool; sizes: { w: number; h: number }[]; name: string; onOpen: () => void; onClose: () => void } = $props();
  let viewer: Viewer;
  let current = $state(1);
  let showThumbs = $state(true);
  let pageInput = $state('1');
  $effect(() => { pageInput = String(current); });
  const tasks: Key[] = ['view', 'organize', 'edit', 'convert', 'sign', 'protect', 'ocr'];

  function onKey(e: KeyboardEvent) {
    if (e.key === 'F4') { e.preventDefault(); showThumbs = !showThumbs; }
  }
  function go() { const n = Math.min(sizes.length, Math.max(1, Number(pageInput) || 1)); viewer.goTo(n); }
</script>

<svelte:window onkeydown={onKey} />
<div class="ws">
  <header class="bar">
    <img src="/brand-mark.svg" alt="" width="28" height="28" />
    <strong class="name" title={name}>{name}</strong>
    <nav class="tasks" aria-label="Tasks">
      {#each tasks as task}
        <button class="task" class:on={task === 'view'} disabled={task !== 'view'} title={task === 'view' ? '' : t('soon')}>{t(task)}</button>
      {/each}
    </nav>
    <span class="end">
      <button class="btn" onclick={onOpen}>{@html icon('upload')}{t('openShort')}</button>
      <button class="btn" onclick={onClose}>{@html icon('close')}{t('close')}</button>
      <button class="btn icon" onclick={toggleLanguage} title={t('language')} aria-label={t('language')}>{@html icon('language')}</button>
    </span>
  </header>
  <div class="tools">
    <button class="btn icon" onclick={() => (showThumbs = !showThumbs)} title="{t('thumbnails')} (F4)" aria-label={t('thumbnails')} aria-pressed={showThumbs}>{@html icon('organize')}</button>
    <span class="sep"></span>
    <form class="pageno" onsubmit={(e) => { e.preventDefault(); go(); }}>
      <label class="sr" for="pageno">{t('page')}</label>
      <input id="pageno" class="num" bind:value={pageInput} inputmode="numeric" onblur={go} />
      <span class="num muted">{t('of')} {sizes.length}</span>
    </form>
    <span class="sep"></span>
    <button class="btn icon" onclick={() => viewer.zoomBy(0.8)} title={t('zoomOut')} aria-label={t('zoomOut')}>−</button>
    <button class="btn" onclick={() => viewer.zoomTo('width')}>{t('fitWidth')}</button>
    <button class="btn" onclick={() => viewer.zoomTo('page')}>{t('fitPage')}</button>
    <button class="btn icon" onclick={() => viewer.zoomBy(1.25)} title={t('zoomIn')} aria-label={t('zoomIn')}>+</button>
  </div>
  <div class="body" class:nothumbs={!showThumbs}>
    {#if showThumbs}<Thumbnails {pool} {sizes} {current} onGo={(n) => viewer.goTo(n)} />{/if}
    <main><Viewer bind:this={viewer} {pool} {sizes} bind:current /></main>
  </div>
</div>

<style>
  .ws { height: 100%; display: grid; grid-template-rows: auto auto 1fr; }
  .bar { display: flex; align-items: center; gap: var(--s-12); padding: var(--s-8) var(--s-16); background: var(--surface); border-bottom: 1px solid var(--line); min-width: 0; }
  .name { max-width: 22ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--fs-14); }
  .tasks { display: flex; gap: var(--s-4); margin-inline: auto; overflow-x: auto; }
  .task { min-height: var(--control); padding: 0 var(--s-12); border: 0; border-radius: var(--r-8); background: none; color: var(--muted); font-weight: 600; white-space: nowrap; }
  .task.on { background: var(--green-soft); color: var(--ink); box-shadow: inset 0 -2px 0 var(--green); }
  .task:disabled { opacity: .55; cursor: default; }
  .end { display: flex; gap: var(--s-8); }
  .tools { display: flex; align-items: center; gap: var(--s-8); padding: var(--s-4) var(--s-16); background: var(--surface); border-bottom: 1px solid var(--line); }
  .sep { width: 1px; height: 24px; background: var(--line); }
  .pageno { display: flex; align-items: center; gap: var(--s-8); }
  .pageno input { width: 56px; min-height: var(--control); text-align: center; border: 1px solid var(--line); border-radius: var(--r-8); background: var(--paper); }
  .muted { color: var(--muted); }
  .body { display: grid; grid-template-columns: 168px 1fr; min-height: 0; }
  .body.nothumbs { grid-template-columns: 1fr; }
  main { min-width: 0; min-height: 0; }
  @media (max-width: 720px) { .tasks { display: none; } .body { grid-template-columns: 1fr; } .body :global(.thumbs) { display: none; } }
</style>
