<script lang="ts">
  // The desktop window's top edge: the app's own paper colour, draggable, our minimise / maximise / close. Only
  // mounted in the Tauri shell. The buttons stay at the top-right corner in Arabic too (where Windows puts them).
  import { t } from '../lib/i18n.svelte';
  import { icon } from '../lib/icons.js';
  import { appWindow, setBorder } from '../lib/desktop';
  import { theme } from '../lib/theme.svelte';
  let { flush = false, float = false }: { flush?: boolean; float?: boolean } = $props(); // flush: same colour as the top row (a document is open); float: only the window buttons, over that row
  const win = appWindow();
  let max = $state(false);
  const sync = async () => (max = await win.isMaximized());
  sync(); win.onResized(sync);
  let el: HTMLDivElement;
  $effect(() => { theme.name; flush; setBorder(getComputedStyle(el).backgroundColor); }); // frame follows the bar's colour
</script>

<div class={float ? 'winfloat' : 'titlebar'} class:flush data-tauri-drag-region bind:this={el}>
  <span class="win">
  <button class="btn icon" onclick={() => win.minimize()} title={t('minimize')} aria-label={t('minimize')}>{@html icon('minimize')}</button>
  <button class="btn icon" onclick={() => win.toggleMaximize()} title={t(max ? 'restore' : 'maximize')} aria-label={t(max ? 'restore' : 'maximize')}>{@html icon(max ? 'restore' : 'maximize')}</button>
  <button class="btn icon x" onclick={() => win.close()} title={t('close')} aria-label={t('close')}>{@html icon('close')}</button>
  </span>
</div>

<style>
  .titlebar { height: 40px; direction: ltr; display: flex; justify-content: flex-end; background: var(--paper); user-select: none; }
  .winfloat { position: fixed; z-index: 40; top: 0; right: 0; height: 53px; direction: ltr; background: var(--surface); user-select: none; } /* sits in the top row of an open document, which keeps the colour and drag region */
  .win { display: flex; align-items: center; height: 100%; gap: var(--s-8); padding-inline: var(--s-8); }
  .flush { background: var(--surface); }
  .btn { border-color: transparent; background: transparent; }
  .btn:hover { background: var(--green-soft); }
  .btn.x:hover { background: var(--danger); color: #fff; }
</style>
