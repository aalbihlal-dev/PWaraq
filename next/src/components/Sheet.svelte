<script lang="ts">
  // The side panel of a task. Wide screens: the normal panel on the side. Narrow screens (phones, tablets in portrait): a bottom sheet,
  // collapsed to a slim dock with only the important actions (`bar`); the handle (tap, or swipe up / down) opens the whole panel over the pages.
  import type { Snippet } from 'svelte';
  import { t } from '../lib/i18n.svelte';
  import { icon } from '../lib/icons.js';
  import { view } from '../lib/device.svelte';
  let { bar, children, label, open = $bindable(false) }: { bar: Snippet; children: Snippet; label: string; open?: boolean } = $props();
  let y0 = 0, moved = 0;
  const down = (e: PointerEvent) => { y0 = e.clientY; moved = 0; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); };
  const move = (e: PointerEvent) => { moved = e.clientY - y0; };
  const up = () => { if (moved < -30) open = true; else if (moved > 30) open = false; else if (Math.abs(moved) < 8) open = !open; moved = 0; };
</script>

<aside class="sheet side" class:open aria-label={label}>
  <div class="dock">
    <button class="grip" aria-expanded={open} aria-label={open ? t('hideOptions') : t('showOptions')} title={open ? t('hideOptions') : t('showOptions')}
      onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={() => (moved = 0)} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open = !open; } }}><i></i></button>
    <div class="bar">{#if view.narrow}{@render bar()}{/if}</div>
    {#if open}<button class="btn icon" onclick={() => (open = false)} title={t('hideOptions')} aria-label={t('hideOptions')}>{@html icon('close')}</button>{/if}
  </div>
  <div class="panel">{@render children()}</div>
</aside>

<style>
  .sheet { display: flex; flex-direction: column; background: var(--surface); border-inline-start: 1px solid var(--line); overflow-y: auto; min-height: 0; }
  .dock { display: none; }
  .panel { display: flex; flex-direction: column; gap: var(--s-16); padding: var(--s-16); }
  @media (max-width: 820px) {
    .sheet { position: fixed; z-index: 30; inset-inline: 0; bottom: 0; max-height: 80dvh; overflow: hidden; border-inline-start: 0; border-top: 1px solid var(--line); border-radius: var(--r-12) var(--r-12) 0 0;
      box-shadow: 0 -8px 24px rgb(0 0 0 / .16); transform: translateY(calc(100% - var(--dock))); transition: transform .2s ease; --dock: calc(64px + env(safe-area-inset-bottom, 0px)); }
    .sheet.open { transform: none; }
    .dock { display: flex; align-items: center; gap: var(--s-8); flex: none; height: var(--dock); padding: 0 var(--s-12) env(safe-area-inset-bottom, 0px); touch-action: none; }
    .grip { flex: none; width: 44px; height: 44px; display: grid; place-items: center; border: 0; background: none; touch-action: none; }
    .grip i { width: 28px; height: 4px; border-radius: 2px; background: var(--muted); }
    .bar :global(.btn) { flex: none; }
    .bar { flex: 1; min-width: 0; overflow: hidden; display: flex; gap: var(--s-8); align-items: center; justify-content: flex-end; flex-wrap: nowrap; touch-action: manipulation; }
    .panel { overflow-y: auto; overscroll-behavior: contain; flex: 1; min-height: 0; padding-bottom: calc(var(--s-16) + env(safe-area-inset-bottom, 0px)); }
    .sheet:not(.open) .panel { visibility: hidden; }
  }
</style>
