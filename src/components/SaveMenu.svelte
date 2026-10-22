<script lang="ts">
  // Save ▾ : Save, Save as…, Save a smaller copy (compress: Recommended / Smallest, in a small dialog).
  import type { EnginePool } from '../lib/engine/pool';
  import { i18n, t } from '../lib/i18n.svelte';
  import { icon } from '../lib/icons.js';
  import { saveFile } from '../lib/store';
  let { pool, bytes, name, password, disabled, primary, saveOff, canShrink, onSave, onSaveAs }: { pool: EnginePool; bytes: Uint8Array; name: string; password?: string; disabled: boolean; primary: boolean; saveOff: boolean; canShrink: boolean;
    onSave: () => void; onSaveAs: () => void } = $props();
  let open = $state(false), dialog = $state(false), level = $state<'recommended' | 'small'>('recommended'), busy = $state(false), note = $state('');
  const mb = (n: number) => (n / 1048576).toLocaleString(i18n.lang, { maximumFractionDigits: 1 }) + ' MB';
  async function shrink() {
    busy = true; note = '';
    try {
      const out = await pool.tool<Uint8Array>('compress', { bytes: bytes.slice(), level, current: password ?? '' });
      if (out.length >= bytes.length) { note = t('alreadySmall'); return; }
      await saveFile(out, `${name.replace(/\.pdf$/i, '')} (${t('smaller')}).pdf`);
      note = `${mb(bytes.length)} → ${mb(out.length)}`;
    } catch { note = t('toolFailed'); } finally { busy = false; }
  }
</script>

<span class="wrap" onfocusout={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) open = false; }} onkeydown={(e) => { if (e.key === 'Escape') { open = false; dialog = false; } }} role="presentation">
  <span class="split">
    <button class="btn" class:primary onclick={onSave} disabled={disabled || saveOff}>{@html icon('download')}{t('save')}</button>
    <button class="btn icon caret" class:primary aria-expanded={open} aria-haspopup="menu" title={t('saveOptions')} aria-label={t('saveOptions')} onclick={() => (open = !open)} disabled={disabled}>▾</button>
  </span>
  {#if open}
    <div class="menu" role="menu">
      <button class="btn" role="menuitem" onclick={() => { open = false; onSaveAs(); }} {disabled}>{@html icon('download')}{t('saveAsItem')}</button>
      <button class="btn" role="menuitem" onclick={() => { open = false; note = ''; dialog = true; }} disabled={disabled || !canShrink}>{@html icon('compress')}{t('compressSave')}</button>
    </div>
  {/if}
  {#if dialog}
    <div class="menu dlg" role="dialog" aria-label={t('compressSave')}>
      <strong>{t('compressSave')}</strong>
      <p class="help">{t('compressHelp')}</p>
      <label class="choice"><input type="radio" bind:group={level} value="recommended" />{t('compressRecommended')}</label>
      <label class="choice"><input type="radio" bind:group={level} value="small" />{t('compressSmall')}</label>
      <p class="num" aria-live="polite">{busy ? t('compressing') : note}</p>
      <span class="row"><button class="btn primary" onclick={shrink} disabled={busy}>{@html icon('compress')}{t('save')}</button><button class="btn" onclick={() => (dialog = false)}>{t('cancel')}</button></span>
    </div>
  {/if}
</span>

<style>
  .wrap { position: relative; display: flex; }
  .split { display: flex; gap: 0; }
  .split .btn:first-child { border-start-end-radius: 0; border-end-end-radius: 0; }
  .caret { width: var(--control); border-start-start-radius: 0; border-end-start-radius: 0; margin-inline-start: -1px; }
  .menu { position: absolute; z-index: 30; top: calc(100% + var(--s-8)); inset-inline-end: 0; display: grid; gap: var(--s-8); justify-items: stretch; width: max-content; max-width: min(360px, 90vw);
    padding: var(--s-12); border: 1px solid var(--line); border-radius: var(--r-12); background: var(--surface); box-shadow: var(--shadow); }
  .menu .btn { justify-content: flex-start; }
  .dlg p { margin: 0; }
  .row { display: flex; gap: var(--s-8); }
  .choice { display: flex; gap: var(--s-8); align-items: center; min-height: var(--control); }
  .choice input { flex: none; width: 20px; height: 20px; accent-color: var(--green); }
</style>
