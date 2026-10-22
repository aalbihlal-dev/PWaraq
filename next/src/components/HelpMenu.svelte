<script lang="ts">
  // ⋯ in the top row: Report a problem (opens the support page); in the desktop app also the crash report and its folder.
  import { t } from '../lib/i18n.svelte';
  import { icon } from '../lib/icons.js';
  import { isDesktop } from '../lib/desktop';
  import { reportProblem } from '../lib/support';
  import * as crash from '../lib/crashlog';
  let open = $state(false), crashes = $state(0), copied = $state(false);
  async function toggle() { open = !open; if (open && isDesktop) crashes = (await crash.entries()).length; }
  async function copy() { if (await crash.copyReport()) { copied = true; setTimeout(() => (copied = false), 3000); } }
</script>

<span class="wrap" onfocusout={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) open = false; }} onkeydown={(e) => { if (e.key === 'Escape') open = false; }} role="presentation">
  <button class="btn icon" aria-expanded={open} aria-haspopup="menu" title={t('helpMenu')} aria-label={t('helpMenu')} onclick={toggle}>{@html icon('more')}</button>
  {#if open}
    <div class="menu" role="menu">
      <button class="btn" role="menuitem" onclick={() => { open = false; reportProblem(); }}>{@html icon('info')}{t('reportProblem')}</button>
      {#if crashes}
        <button class="btn" role="menuitem" onclick={copy}>{copied ? t('crashCopied') : t('copyCrash')}</button>
        <button class="btn" role="menuitem" onclick={() => { open = false; crash.openFolder(); }}>{t('openCrashFolder')}</button>
      {/if}
    </div>
  {/if}
</span>

<style>
  .wrap { position: relative; display: flex; }
  .menu { position: absolute; z-index: 30; top: calc(100% + var(--s-8)); inset-inline-end: 0; display: grid; gap: var(--s-8); justify-items: stretch; width: max-content; max-width: min(360px, 90vw);
    padding: var(--s-12); border: 1px solid var(--line); border-radius: var(--r-12); background: var(--surface); box-shadow: var(--shadow); }
  .menu .btn { justify-content: flex-start; }
</style>
