<script lang="ts">
  // Start screen until a PDF is open, then the workspace.
  import { EnginePool } from './lib/engine/pool';
  import { setDocument } from './lib/engine/page-cache';
  import { i18n, t, toggleLanguage } from './lib/i18n.svelte';
  import { icon } from './lib/icons.js';
  import Workspace from './components/Workspace.svelte';

  const pool = new EnginePool();
  let doc = $state<{ name: string; sizes: { w: number; h: number }[] } | null>(null);
  let busy = $state(false), error = $state(''), over = $state(false);
  let picker: HTMLInputElement;

  $effect(() => { document.documentElement.lang = i18n.lang; document.documentElement.dir = i18n.lang === 'ar' ? 'rtl' : 'ltr'; });

  async function openFile(file?: File | null) {
    if (!file) return;
    busy = true; error = '';
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      await setDocument(bytes);
      const sizes = await pool.open(bytes);
      doc = null; await Promise.resolve(); // a new document gets a fresh workspace
      doc = { name: file.name, sizes };
    } catch { error = t('notPdf'); }
    busy = false;
  }
  const pick = () => picker.click();
  function drop(e: DragEvent) { e.preventDefault(); over = false; openFile(e.dataTransfer?.files[0]); }
</script>

<input bind:this={picker} type="file" accept="application/pdf,.pdf" hidden onchange={(e) => { openFile(e.currentTarget.files?.[0]); e.currentTarget.value = ''; }} />

{#if doc}
  <Workspace {pool} sizes={doc.sizes} name={doc.name} onOpen={pick} onClose={() => (doc = null)} />
{:else}
  <div class="start" class:over role="region" aria-label={t('appName')}
    ondragover={(e) => { e.preventDefault(); over = true; }} ondragleave={() => (over = false)} ondrop={drop}>
    <button class="btn icon lang" onclick={toggleLanguage} aria-label={t('language')} title={t('language')}>{@html icon('language')}</button>
    <img src="/brand-mark.svg" alt="" width="88" height="88" />
    <h1>{t('appName')}</h1>
    <p class="tag">{t('tagline')}</p>
    <button class="btn primary big" onclick={pick} disabled={busy}>{@html icon('upload')}{busy ? t('reading') : t('open')}</button>
    <p class="muted">{t('dropHere')}</p>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <p class="muted small">{@html icon('shield')}{t('privacy')}</p>
  </div>
{/if}

<style>
  .start { position: relative; height: 100%; display: grid; place-content: center; justify-items: center; gap: var(--s-12); padding: var(--s-24); text-align: center; }
  .start.over { background: var(--green-soft); outline: 2px dashed var(--green); outline-offset: -16px; }
  .lang { position: absolute; top: var(--s-16); inset-inline-end: var(--s-16); }
  h1 { margin: var(--s-8) 0 0; font-size: var(--fs-40); line-height: 1.2; }
  .tag { margin: 0 0 var(--s-16); color: var(--muted); font-size: var(--fs-18); max-width: 32ch; }
  .big { min-height: 48px; padding: 0 var(--s-24); font-size: var(--fs-16); }
  .muted { margin: 0; color: var(--muted); }
  .small { display: inline-flex; align-items: center; gap: var(--s-8); font-size: var(--fs-12); margin-top: var(--s-24); }
  .error { color: #b3261e; margin: 0; }
</style>
