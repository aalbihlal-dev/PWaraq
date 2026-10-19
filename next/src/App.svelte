<script lang="ts">
  // Start screen (open, new portfolio, recent files) until a PDF or a portfolio is open.
  import { onMount, tick } from 'svelte';
  import { EnginePool } from './lib/engine/pool';
  import { setDocument } from './lib/engine/page-cache';
  import { i18n, t, toggleLanguage } from './lib/i18n.svelte';
  import { icon } from './lib/icons.js';
  import { recentList, remember, forget, reopen, pickFiles, saveFile, readPortfolio, writePortfolio, type Recent } from './lib/store';
  import { newPortfolio, load, type Portfolio as PortfolioData } from './lib/portfolio';
  import { unzip } from './lib/zip';
  import Workspace from './components/Workspace.svelte';
  import Portfolio from './components/Portfolio.svelte';

  const pool = new EnginePool();
  let doc = $state<{ name: string; sizes: { w: number; h: number }[]; bytes: Uint8Array; modified: boolean } | null>(null);
  let portfolio = $state<PortfolioData | null>(null);
  let busy = $state(false), error = $state(''), over = $state(false), recent = $state<Recent[]>([]);
  let picker: HTMLInputElement;

  $effect(() => { document.documentElement.lang = i18n.lang; document.documentElement.dir = i18n.lang === 'ar' ? 'rtl' : 'ltr'; });
  const refresh = async () => (recent = await recentList());
  onMount(refresh);

  async function show(bytes: Uint8Array, name: string, modified = false) {
    await setDocument(bytes);
    const sizes = await pool.open(bytes);
    doc = null; portfolio = null; await tick(); // a new document gets a fresh workspace
    doc = { name, sizes, bytes, modified };
  }

  async function openFile(file?: File | null, handle?: FileSystemFileHandle) {
    if (!file) return;
    busy = true; error = '';
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (/\.waraq$/i.test(file.name)) await openPortfolioFile(bytes);
      else {
        await show(bytes, file.name);
        remember({ key: `pdf:${file.name}:${file.size}`, kind: 'pdf', name: file.name, pages: doc!.sizes.length, handle, thumb: await cover() });
      }
    } catch { error = t('notPdf'); }
    busy = false;
  }
  // first page, small, for the recent list
  async function cover(): Promise<Blob | undefined> {
    try {
      const bmp = await pool.run<ImageBitmap>({ op: 'render', page: 0, priority: 6, args: { scale: 144 / Math.max(doc!.sizes[0].w, doc!.sizes[0].h) } });
      const c = new OffscreenCanvas(bmp.width, bmp.height); c.getContext('2d')!.drawImage(bmp, 0, 0); bmp.close();
      return await c.convertToBlob({ type: 'image/png' });
    } catch { return undefined; }
  }

  async function openPortfolioFile(bytes: Uint8Array) {
    const entries = unzip(bytes), m = JSON.parse(new TextDecoder().decode(entries['manifest.json']));
    for (const [name, data] of Object.entries(entries)) await writePortfolio(m.id, name, data); // kept on this device from now on
    await showPortfolio(await load(pool, entries));
  }
  async function showPortfolio(p: PortfolioData) { doc = null; portfolio = null; await tick(); portfolio = p; }
  async function startPortfolio() {
    await pool.reset();
    showPortfolio(newPortfolio(`${t('untitled')} ${new Date().toLocaleDateString(i18n.lang === 'ar' ? 'ar' : 'en-GB')}`));
  }

  async function openRecent(r: Recent) {
    busy = true; error = '';
    try {
      if (r.kind === 'portfolio') {
        const entries = await readPortfolio(r.key.slice(10));
        if (!entries) throw new Error('gone');
        await showPortfolio(await load(pool, entries));
      } else {
        const file = await reopen(r);
        if (!file) throw new Error('gone');
        busy = false; return openFile(file, r.handle);
      }
    } catch { error = t('missing'); }
    busy = false;
  }

  async function pick() {
    const [first] = await pickFiles({ accept: { 'application/pdf': ['.pdf'], 'application/zip': ['.waraq'] }, fallback: () => picker.click() });
    if (first) openFile(first.file, first.handle);
  }
  async function drop(e: DragEvent) {
    e.preventDefault(); over = false;
    const file = e.dataTransfer?.files[0], item = e.dataTransfer?.items[0];
    const handle = await (item as any)?.getAsFileSystemHandle?.().catch(() => null);
    openFile(file, handle?.kind === 'file' ? handle : undefined);
  }
  async function close() { doc = null; portfolio = null; refresh(); }
  async function save() {
    if (!doc) return;
    if (await saveFile(doc.bytes, doc.name)) doc.modified = false;
  }
  const thumbs = new Map<Blob, string>();
  const thumbUrl = (b: Blob) => thumbs.get(b) ?? (thumbs.set(b, URL.createObjectURL(b)), thumbs.get(b)!);
  const when = (at: number) => new Intl.RelativeTimeFormat(i18n.lang, { numeric: 'auto' }).format(Math.round((at - Date.now()) / 86_400_000), 'day');
</script>

<input bind:this={picker} type="file" accept="application/pdf,.pdf,.waraq" hidden onchange={(e) => { openFile(e.currentTarget.files?.[0]); e.currentTarget.value = ''; }} />

{#if doc}
  <Workspace {pool} sizes={doc.sizes} name={doc.name} modified={doc.modified} onOpen={pick} onClose={close} onSave={save}
    onReplace={(bytes) => show(bytes, doc!.name, true)} />
{:else if portfolio}
  <Portfolio {pool} {portfolio} onClose={close} />
{:else}
  <div class="start" class:over role="region" aria-label={t('appName')}
    ondragover={(e) => { e.preventDefault(); over = true; }} ondragleave={() => (over = false)} ondrop={drop}>
    <button class="btn icon lang" onclick={toggleLanguage} aria-label={t('language')} title={t('language')}>{@html icon('language')}</button>
    <div class="hero">
      <img src="/brand-mark.svg" alt="" width="72" height="72" />
      <h1>{t('appName')}</h1>
      <p class="tag">{t('tagline')}</p>
      <div class="actions">
        <button class="btn primary big" onclick={pick} disabled={busy}>{@html icon('upload')}{busy ? t('reading') : t('open')}</button>
        <button class="btn big" onclick={startPortfolio} disabled={busy}>{@html icon('library')}{t('newPortfolio')}</button>
      </div>
      <p class="muted">{t('dropHere')} · {t('portfolioHint')}</p>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
    </div>
    <section class="recent" aria-labelledby="recent-h">
      <h2 id="recent-h">{t('recent')}</h2>
      {#if recent.length}
        <ul>
          {#each recent as r (r.key)}
            <li>
              <button class="card" onclick={() => openRecent(r)} disabled={busy}>
                <span class="thumb">{#if r.thumb}<img src={thumbUrl(r.thumb)} alt="" />{:else}{@html icon(r.kind === 'portfolio' ? 'library' : 'document')}{/if}</span>
                <span class="meta">
                  <strong title={r.name}>{r.name}</strong>
                  <span class="muted small num">{r.kind === 'portfolio' ? t('portfolio') + ' · ' : ''}{r.pages ? `${r.pages} ${t('pagesCount')} · ` : ''}{when(r.at)}</span>
                </span>
              </button>
              <button class="btn icon x" onclick={async () => { await forget(r.key); refresh(); }} title={t('remove')} aria-label="{t('remove')}: {r.name}">{@html icon('close')}</button>
            </li>
          {/each}
        </ul>
      {:else}<p class="muted">{t('noRecent')}</p>{/if}
    </section>
    <p class="muted small privacy">{@html icon('shield')}{t('privacy')}</p>
  </div>
{/if}

<style>
  .start { position: relative; height: 100%; overflow-y: auto; display: grid; align-content: start; justify-items: center; gap: var(--s-32); padding: var(--s-48) var(--s-24) var(--s-24); }
  .start.over { background: var(--green-soft); outline: 2px dashed var(--green); outline-offset: -16px; }
  .lang { position: absolute; top: var(--s-16); inset-inline-end: var(--s-16); }
  .hero { display: grid; justify-items: center; gap: var(--s-12); text-align: center; }
  h1 { margin: 0; font-size: var(--fs-40); line-height: 1.2; }
  .tag { margin: 0 0 var(--s-8); color: var(--muted); font-size: var(--fs-18); max-width: 36ch; }
  .actions { display: flex; flex-wrap: wrap; justify-content: center; gap: var(--s-12); }
  .big { min-height: 48px; padding: 0 var(--s-24); font-size: var(--fs-16); }
  .muted { margin: 0; color: var(--muted); }
  .small { font-size: var(--fs-12); }
  .error { color: var(--danger); margin: 0; }
  .recent { width: min(960px, 100%); }
  h2 { margin: 0 0 var(--s-12); font-size: var(--fs-18); }
  .recent ul { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: var(--s-12); }
  .recent li { position: relative; }
  .card { width: 100%; display: flex; align-items: center; gap: var(--s-12); padding: var(--s-12); padding-inline-end: var(--s-48); border: 1px solid var(--line); border-radius: var(--r-12); background: var(--surface); text-align: start; }
  .card:hover { border-color: var(--green); background: var(--green-soft); }
  .thumb { flex: none; width: 56px; height: 72px; display: grid; place-items: center; background: var(--paper); border: 1px solid var(--line); border-radius: 4px; color: var(--green); overflow: hidden; }
  .thumb img { max-width: 100%; max-height: 100%; }
  .thumb :global(svg) { width: 28px; height: 28px; }
  .meta { display: grid; gap: var(--s-4); min-width: 0; }
  .meta strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .x { position: absolute; top: 50%; inset-inline-end: var(--s-8); transform: translateY(-50%); }
  .privacy { display: inline-flex; align-items: center; gap: var(--s-8); }
</style>
