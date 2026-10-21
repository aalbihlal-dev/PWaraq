<script lang="ts">
  // "Download the Office & CAD add-on (137 MB)?" — shown by the first Office/CAD conversion in the desktop app.
  // Download / Not now; then progress with Cancel; errors offer Try again. Nothing is downloaded before the click.
  import { t } from '../lib/i18n.svelte';
  import { pack, download, decline, cancel } from '../lib/packs.svelte';

  let dialog = $state<HTMLDialogElement>();
  $effect(() => { if (pack.open) dialog?.showModal(); else dialog?.close(); });
  const mb = (n: number) => Math.round(n / 1048576);
</script>

{#if pack.open}
  <dialog bind:this={dialog} aria-labelledby="pack-h" oncancel={(e) => { e.preventDefault(); if (pack.status === 'downloading' || pack.status === 'unpacking') cancel(); else decline(); }}>
    <h2 id="pack-h">{t('packAsk').replace('{size}', String(pack.size))}</h2>
    {#if pack.status === 'ask'}
      <p class="muted">{t('packHelp')}</p>
      <div class="buttons">
        <button class="btn primary" onclick={() => download()}>{t('packDownload')}</button>
        <button class="btn" onclick={decline}>{t('packNotNow')}</button>
      </div>
    {:else if pack.status === 'error'}
      <p role="alert">{t(pack.error === 'PACK_MISMATCH' ? 'packMismatch' : 'packFailed')}</p>
      <div class="buttons">
        {#if pack.error !== 'PACK_MISMATCH'}<button class="btn primary" onclick={() => download()}>{t('tryAgain')}</button>{/if}
        <button class="btn" onclick={decline}>{t('close')}</button>
      </div>
    {:else}
      <p role="status" aria-live="polite">{pack.status === 'unpacking' ? t('packUnpacking') : `${t('packDownloading')} ${mb(pack.done)} / ${mb(pack.total || pack.size * 1048576)} MB`}</p>
      <progress max={pack.total || 1} value={pack.status === 'unpacking' ? pack.total || 1 : pack.done} aria-label={t('packDownloading')}></progress>
      <div class="buttons"><button class="btn" onclick={cancel} disabled={pack.status === 'unpacking'}>{t('cancel')}</button></div>
    {/if}
  </dialog>
{/if}

<style>
  dialog { width: min(560px, calc(100% - 2 * var(--s-16))); display: grid; gap: var(--s-12); padding: var(--s-24);
    border: 1px solid var(--line); border-radius: var(--r-16); background: var(--surface); color: var(--ink); box-shadow: var(--shadow); }
  dialog::backdrop { background: var(--veil); }
  dialog[open] { display: grid; }
  h2 { margin: 0; font-size: var(--fs-20); }
  p { margin: 0; }
  .muted { color: var(--muted); }
  .buttons { display: flex; flex-wrap: wrap; gap: var(--s-8); }
  progress { width: 100%; height: 8px; accent-color: var(--green); }
</style>
