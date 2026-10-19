<script lang="ts">
  // The document workspace: one task bar on top, thumbnails on the left, the page in the middle.
  import type { EnginePool } from '../lib/engine/pool';
  import { t, toggleLanguage, type Key } from '../lib/i18n.svelte';
  import { icon } from '../lib/icons.js';
  import Viewer from './Viewer.svelte';
  import Thumbnails from './Thumbnails.svelte';
  import Organize from './Organize.svelte';

  let { pool, sizes, name, modified, onOpen, onClose, onSave, onReplace }: { pool: EnginePool; sizes: { w: number; h: number }[]; name: string; modified: boolean;
    onOpen: () => void; onClose: () => void; onSave: () => void; onReplace: (bytes: Uint8Array) => Promise<void> } = $props();
  let mode = $state<'view' | 'organize'>('view'), organize = $state<Organize>(), organized = $state(false), applying = $state(false);
  // leaving Organize applies its changes: the document is rebuilt and opened again in View
  async function task_(next: Key) {
    if (next === mode) return;
    if (next === 'organize') { mode = 'organize'; return; }
    if (organized && organize) { applying = true; try { await onReplace(await organize.build()); } finally { applying = false; } }
    else mode = 'view';
  }
  async function save() {
    if (mode === 'organize' && organized && organize) { applying = true; try { await onReplace(await organize.build()); } finally { applying = false; } }
    onSave();
  }
  let viewer = $state() as Viewer;
  let current = $state(1);
  let showThumbs = $state(true);
  let pageInput = $state('1');
  $effect(() => { pageInput = String(current); });
  const tasks: Key[] = ['view', 'organize', 'edit', 'convert', 'sign', 'protect', 'ocr'];

  // Find: every page is searched in the background (heavy pages take seconds); matches appear as they come in.
  let findOpen = $state(false), query = $state(''), hits = $state<{ page: number; rects: number[][] }[]>([]), active = $state(0), searching = $state(false);
  let findInput = $state<HTMLInputElement>(), searchRun = 0, findTimer: ReturnType<typeof setTimeout>;
  async function search(q: string) {
    const run = ++searchRun; hits = []; active = 0; viewer.showHits([], 0);
    if (q.trim().length < 2) return;
    searching = true;
    await Promise.all(sizes.map(async (_, page) => {
      try {
        const found: number[][][] = await pool.run({ op: 'search', page, priority: 4, key: 'search' + page, args: { query: q } });
        if (run !== searchRun || !found.length) return;
        const add = found.map((quads) => ({ page, rects: quads.map((q) => { const xs = [q[0], q[2], q[4], q[6]], ys = [q[1], q[3], q[5], q[7]]; return [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)]; }) }));
        hits = [...hits, ...add].sort((a, b) => a.page - b.page);
        viewer.showHits(hits, active);
      } catch {}
    }));
    if (run === searchRun) searching = false;
  }
  function step(d: number) { if (!hits.length) return; active = (active + d + hits.length) % hits.length; viewer.showHits(hits, active); }

  function onKey(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); return; }
    if (mode !== 'view') return;
    if (e.key === 'F4') { e.preventDefault(); showThumbs = !showThumbs; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); findOpen = true; setTimeout(() => findInput?.focus()); }
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
        {@const live = task === 'view' || task === 'organize'}
        <button class="task" class:on={task === mode} disabled={!live || applying} title={live ? '' : t('soon')} onclick={() => task_(task)}>{t(task)}</button>
      {/each}
    </nav>
    <span class="end">
      {#if modified || organized}<span class="mod">{t('modified')}</span>{/if}
      <button class="btn" class:primary={modified} onclick={save} disabled={applying}>{@html icon('download')}{t('save')}</button>
      <button class="btn" onclick={onOpen}>{@html icon('upload')}{t('openShort')}</button>
      <button class="btn" onclick={onClose}>{@html icon('close')}{t('close')}</button>
      <button class="btn icon" onclick={toggleLanguage} title={t('language')} aria-label={t('language')}>{@html icon('language')}</button>
    </span>
  </header>
  {#if mode === 'organize'}
  <div class="orgwrap">
    {#if applying}<p class="applying" role="status">{t('applying')}</p>{/if}
    <Organize bind:this={organize} bind:changed={organized} {pool} {sizes} {name} />
  </div>
  {:else}
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
    <span class="find" class:open={findOpen}>
      <button class="btn icon" onclick={() => { findOpen = !findOpen; if (findOpen) setTimeout(() => findInput?.focus()); }} title={t('find')} aria-label={t('find')}>{@html icon('search')}</button>
      {#if findOpen}
        <input bind:this={findInput} bind:value={query} type="search" placeholder={t('find')} aria-label={t('find')}
          oninput={() => { clearTimeout(findTimer); searching = query.trim().length >= 2; findTimer = setTimeout(() => search(query), 300); }}
          onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); step(e.shiftKey ? -1 : 1); } if (e.key === 'Escape') { findOpen = false; query = ''; search(''); } }} />
        <span class="num muted" aria-live="polite">{query.trim().length < 2 ? '' : hits.length ? `${active + 1} / ${hits.length}${searching ? '…' : ''}` : searching ? '…' : t('noResults')}</span>
      {/if}
    </span>
  </div>
  <div class="body" class:nothumbs={!showThumbs}>
    {#if showThumbs}<Thumbnails {pool} {sizes} {current} onGo={(n) => viewer.goTo(n)} />{/if}
    <main><Viewer bind:this={viewer} {pool} {sizes} bind:current /></main>
  </div>
  {/if}
</div>

<style>
  .ws { height: 100%; display: grid; grid-template-rows: auto auto 1fr; }
  .orgwrap { grid-row: 2 / 4; min-height: 0; position: relative; }
  .applying { position: absolute; inset: 0; z-index: 2; margin: 0; display: grid; place-items: center; background: #fafbf8cc; font-size: var(--fs-16); font-weight: 600; }
  .mod { color: var(--muted); font-size: var(--fs-12); white-space: nowrap; }
  .bar { display: flex; align-items: center; gap: var(--s-12); padding: var(--s-8) var(--s-16); background: var(--surface); border-bottom: 1px solid var(--line); min-width: 0; }
  .name { max-width: 22ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--fs-14); }
  .tasks { display: flex; gap: var(--s-8); margin-inline: auto; overflow-x: auto; }
  .task { min-height: var(--control); padding: 0 var(--s-12); border: 0; border-radius: var(--r-8); background: none; color: var(--muted); font-weight: 600; white-space: nowrap; }
  .task.on { background: var(--green-soft); color: var(--ink); box-shadow: inset 0 -2px 0 var(--green); }
  .task:disabled { opacity: .55; cursor: default; }
  .end { display: flex; gap: var(--s-8); }
  .tools { display: flex; align-items: center; gap: var(--s-8); padding: var(--s-8) var(--s-16); background: var(--surface); border-bottom: 1px solid var(--line); }
  .sep { width: 1px; height: 24px; background: var(--line); }
  .pageno { display: flex; align-items: center; gap: var(--s-8); }
  .pageno input { width: 56px; min-height: var(--control); text-align: center; border: 1px solid var(--line); border-radius: var(--r-8); background: var(--paper); }
  .muted { color: var(--muted); }
  .find { display: flex; align-items: center; gap: var(--s-8); margin-inline-start: auto; }
  .find input { width: 220px; min-height: var(--control); padding: 0 var(--s-12); border: 1px solid var(--line); border-radius: var(--r-8); background: var(--paper); }
  .body { display: grid; grid-template-columns: 168px 1fr; min-height: 0; }
  .body.nothumbs { grid-template-columns: 1fr; }
  main { min-width: 0; min-height: 0; }
  @media (max-width: 720px) { .tasks { display: none; } .body { grid-template-columns: 1fr; } .body :global(.thumbs) { display: none; } }
</style>
