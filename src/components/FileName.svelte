<script lang="ts">
  // The name in a top bar: uses the free space of the bar, a long name is shortened in the MIDDLE (the end, ".pdf" and what tells
  // two files apart, stays visible); the full name is the tooltip, and a click or Enter shows it whole with a Copy button.
  import { t } from '../lib/i18n.svelte';
  import { splitName } from '../lib/names';
  import { icon } from '../lib/icons.js';
  let { name, fill = true }: { name: string; fill?: boolean } = $props(); // fill: take the free space of the bar (else only what the name needs)
  let open = $state(false), copied = $state(false);
  const parts = $derived(splitName(name));
  async function copy() { try { await navigator.clipboard.writeText(name); copied = true; setTimeout(() => (copied = false), 2000); } catch { /* no clipboard permission */ } }
</script>

<span class="wrap" class:fill onfocusout={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) open = false; }} onkeydown={(e) => { if (e.key === 'Escape') open = false; }} role="presentation">
  <button class="name" title={name} aria-expanded={open} aria-label={t('fullName')} onclick={() => (open = !open)}>
    <span class="head">{parts[0]}</span><span class="tail">{parts[1]}</span>
  </button>
  {#if open}
    <div class="pop" role="dialog" aria-label={t('fullName')}>
      <p>{name}</p>
      <button class="btn" onclick={copy}>{@html icon('duplicate')}{copied ? t('crashCopied') : t('copyName')}</button>
    </div>
  {/if}
</span>

<style>
  .wrap { position: relative; flex: 0 100 auto; min-width: 12ch; max-width: 40%; display: flex; } /* gives way before the task buttons do */
  .wrap.fill { flex-grow: 1; }
  .name { display: flex; min-width: 0; max-width: 100%; min-height: var(--control); align-items: center; padding: 0 var(--s-8); border: 1px solid transparent; border-radius: var(--r-8);
    background: none; font-size: var(--fs-14); font-weight: 700; color: var(--ink); text-align: start; overflow: hidden; }
  .name:hover, .name[aria-expanded='true'] { border-color: var(--line); background: var(--paper); }
  .head { flex: 0 1 auto; min-width: 2ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tail { flex: none; white-space: pre; }
  .pop { position: absolute; z-index: 30; top: calc(100% + var(--s-8)); inset-inline-start: 0; width: max-content; max-width: min(480px, 90vw); display: grid; gap: var(--s-8); justify-items: start;
    padding: var(--s-12); border: 1px solid var(--line); border-radius: var(--r-12); background: var(--surface); box-shadow: var(--shadow); }
  .pop p { margin: 0; overflow-wrap: anywhere; user-select: text; }
</style>
