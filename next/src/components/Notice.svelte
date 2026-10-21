<script lang="ts">
  // A small message at the bottom of the window: "Waraq recovered — nothing was lost" after an engine restart, and
  // "Still working…" with a Cancel button when a job runs for a long time (the engine is replaced, the document stays).
  import { t } from '../lib/i18n.svelte';
  let { message = '', slow = false, oncancel }: { message?: string; slow?: boolean; oncancel: () => void } = $props();
</script>

{#if slow || message}
  <div class="notice" role="status">
    <span>{slow ? t('stillWorking') : message}</span>
    {#if slow}<button class="btn" onclick={oncancel}>{t('cancel')}</button>{/if}
  </div>
{/if}

<style>
  .notice { position: fixed; z-index: 50; inset-inline: var(--s-16); bottom: var(--s-16); margin-inline: auto; width: fit-content; max-width: calc(100% - 2 * var(--s-16));
    display: flex; align-items: center; gap: var(--s-12); padding: var(--s-8) var(--s-16); min-height: var(--touch);
    border: 1px solid var(--green); border-radius: var(--r-12); background: var(--surface); box-shadow: var(--shadow); }
</style>
