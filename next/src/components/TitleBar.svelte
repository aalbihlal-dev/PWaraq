<script lang="ts">
  // The desktop window's top edge: the app's own paper colour, draggable, our minimise / maximise / close. Only
  // mounted in the Tauri shell. The buttons stay at the top-right corner in Arabic too (where Windows puts them).
  import { t } from '../lib/i18n.svelte';
  import { icon } from '../lib/icons.js';
  import { appWindow, setBorder } from '../lib/desktop';
  import { theme } from '../lib/theme.svelte';
  import { rail } from '../lib/rail.svelte';
  import FileName from './FileName.svelte';
  import { isDesktop } from '../lib/desktop';
  let { flush = false }: { flush?: boolean } = $props(); // flush: same colour as the task bar under it (a document is open)
  const win = isDesktop ? appWindow() : null; // the web build has the rail but no window buttons
  let max = $state(false);
  const sync = async () => (max = await win!.isMaximized());
  if (win) { sync(); win.onResized(sync); }
  let el: HTMLDivElement;
  $effect(() => { theme.name; flush; if (isDesktop) setBorder(getComputedStyle(el).backgroundColor); }); // frame follows the bar's colour
</script>

<div class="rail" class:titlebar={isDesktop} class:desk={isDesktop} class:flush data-tauri-drag-region bind:this={el}>
  {#if rail.name}
    <div class="mid" data-tauri-drag-region>
      <FileName name={rail.name} fill={false} />
      {#if rail.modified}<span class="mod" ><span class="dot"></span>{t('modified')}</span>{/if}
    </div>
  {/if}
  {#if win}
  <span class="win">
  <button class="btn icon" onclick={() => win.minimize()} title={t('minimize')} aria-label={t('minimize')}>{@html icon('minimize')}</button>
  <button class="btn icon" onclick={() => win.toggleMaximize()} title={t(max ? 'restore' : 'maximize')} aria-label={t(max ? 'restore' : 'maximize')}>{@html icon(max ? 'restore' : 'maximize')}</button>
  <button class="btn icon x" onclick={() => win.close()} title={t('close')} aria-label={t('close')}>{@html icon('close')}</button>
  </span>
  {/if}
</div>

<style>
  .rail { position: relative; height: 36px; display: flex; align-items: center; justify-content: center; background: var(--paper); user-select: none; }
  .desk { height: 40px; }
  .mid { display: flex; align-items: center; justify-content: center; gap: var(--s-8); min-width: 0; width: 100%; padding-inline: var(--s-16); }
  .desk .mid { padding-inline: 156px; } /* symmetrical, so the name is centred and clears the three window buttons */
  .mod { display: flex; align-items: center; gap: var(--s-8); flex: none; color: var(--muted); font-size: var(--fs-12); white-space: nowrap; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--green); }
  .win { position: absolute; top: 0; right: 0; direction: ltr; display: flex; align-items: center; height: 100%; gap: var(--s-8); padding-inline: var(--s-8); }
  .flush { background: var(--surface); }
  .btn { border-color: transparent; background: transparent; }
  .btn:hover { background: var(--green-soft); }
  .btn.x:hover { background: var(--danger); color: #fff; }
</style>
