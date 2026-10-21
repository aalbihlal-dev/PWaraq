<script lang="ts">
  // The desktop window's top edge: the app's own paper colour, draggable, our minimise / maximise / close. Only
  // mounted in the Tauri shell. The buttons stay at the top-right corner in Arabic too (where Windows puts them).
  import { t } from '../lib/i18n.svelte';
  import { icon } from '../lib/icons.js';
  import { appWindow } from '../lib/desktop';
  let { flush = false }: { flush?: boolean } = $props(); // flush: same colour as the task bar under it (a document is open)
  const win = appWindow();
  let max = $state(false);
  const sync = async () => (max = await win.isMaximized());
  sync(); win.onResized(sync);
</script>

<div class="titlebar" class:flush data-tauri-drag-region>
  <span class="win">
  <button class="btn icon" onclick={() => win.minimize()} title={t('minimize')} aria-label={t('minimize')}>{@html icon('minimize')}</button>
  <button class="btn icon" onclick={() => win.toggleMaximize()} title={t(max ? 'restore' : 'maximize')} aria-label={t(max ? 'restore' : 'maximize')}>{@html icon(max ? 'restore' : 'maximize')}</button>
  <button class="btn icon x" onclick={() => win.close()} title={t('close')} aria-label={t('close')}>{@html icon('close')}</button>
  </span>
</div>

<style>
  .titlebar { height: 40px; direction: ltr; display: flex; justify-content: flex-end; background: var(--paper); user-select: none; }
  .win { display: flex; align-items: center; gap: var(--s-8); padding-inline: var(--s-8); }
  .flush { background: var(--surface); }
  .btn { border-color: transparent; background: transparent; }
  .btn:hover { background: var(--green-soft); }
  .btn.x:hover { background: var(--danger); color: #fff; }
</style>
