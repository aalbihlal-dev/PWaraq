<script lang="ts">
  // The "⋯" menu of the top row on phones: the less important buttons, in a small popover.
  import type { Snippet } from 'svelte';
  import { t } from '../lib/i18n.svelte';
  import { icon } from '../lib/icons.js';
  let { children }: { children: Snippet } = $props();
  let open = $state(false);
</script>

<span class="wrap" onfocusout={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) open = false; }} onkeydown={(e) => { if (e.key === 'Escape') open = false; }} role="presentation">
  <button class="btn icon" aria-expanded={open} aria-haspopup="menu" title={t('moreTasks')} aria-label={t('moreTasks')} onclick={() => (open = !open)}>{@html icon('more')}</button>
  {#if open}<div class="pop" role="menu">{@render children()}</div>{/if}
</span>

<style>
  .wrap { position: relative; display: flex; }
  .pop { position: absolute; z-index: 40; top: calc(100% + var(--s-8)); inset-inline-end: 0; display: flex; flex-wrap: wrap; gap: var(--s-8); width: max-content; max-width: calc(100vw - 2 * var(--s-16)); padding: var(--s-8);
    border: 1px solid var(--line); border-radius: var(--r-12); background: var(--surface); box-shadow: var(--shadow); }
  .pop :global(.btn) { justify-content: flex-start; }
</style>
