<script lang="ts">
  // Start screen (open, new portfolio, recent files) until a PDF or a portfolio is open.
  import { onMount, tick } from 'svelte';
  import { EnginePool } from './lib/engine/pool';
  import { setDocument } from './lib/engine/page-cache';
  import { i18n, t, toggleLanguage } from './lib/i18n.svelte';
  import ThemeButton from './components/ThemeButton.svelte';
  import { icon } from './lib/icons.js';
  import { recentList, remember, forget, reopen, pickFiles, saveFile, readPortfolio, writePortfolio, type Recent } from './lib/store';
  import { newPortfolio, load, parse, PortfolioError, type Portfolio as PortfolioData } from './lib/portfolio';
  import { unzip } from './lib/zip';
  import { CONVERTIBLE_ACCEPT, isConvertible, toPdf } from './lib/convert';
  import { isDesktop, onOpenPaths, readPath, writePath, saveAs, baseName } from './lib/desktop';
  import TitleBar from './components/TitleBar.svelte';
  import Workspace from './components/Workspace.svelte';
  import Portfolio from './components/Portfolio.svelte';

  const pool = new EnginePool();
  let doc = $state<{ name: string; sizes: { w: number; h: number }[]; bytes: Uint8Array; modified: boolean; password?: string; path?: string } | null>(null);
  let openedPath: string | undefined; // desktop: the file on disk behind `doc`, so Save writes straight back
  let portfolio = $state<PortfolioData | null>(null);
  let busy = $state(false), error = $state(''), over = $state(false), recent = $state<Recent[]>([]);
  let picker: HTMLInputElement;

  $effect(() => { document.documentElement.lang = i18n.lang; document.documentElement.dir = i18n.lang === 'ar' ? 'rtl' : 'ltr'; });
  const refresh = async () => (recent = await recentList());
  onMount(() => { refresh(); if (isDesktop) onOpenPaths(async ([p]) => openFile(await readPath(p), undefined, p)); });

  async function show(bytes: Uint8Array, name: string, modified = false, password?: string) {
    await setDocument(bytes);
    const sizes = await pool.open(bytes, password);
    doc = null; portfolio = null; await tick(); // a new document gets a fresh workspace
    doc = { name, sizes, bytes, modified, password, path: openedPath };
  }
  // a password-protected PDF: asked for on the start screen, then opened with it
  let locked = $state<{ bytes: Uint8Array; name: string; size: number; handle?: FileSystemFileHandle; path?: string } | null>(null), typed = $state('');
  async function unlockOpen(e: SubmitEvent) {
    e.preventDefault();
    if (!locked) return;
    busy = true; error = '';
    try {
      const l = locked;
      await show(l.bytes, l.name, false, typed);
      locked = null; typed = '';
      remember({ key: `pdf:${l.name}:${l.size}`, kind: 'pdf', name: l.name, pages: doc!.sizes.length, handle: l.handle, path: l.path, thumb: await cover() });
    } catch { error = t('wrongPassword'); }
    busy = false;
  }

  async function openFile(file?: File | null, handle?: FileSystemFileHandle, path?: string) {
    if (!file) return;
    busy = true; error = ''; openedPath = path;
    try {
      if (isConvertible(file.name)) { // Word, Excel, PowerPoint, DWG, DXF: converted first (desktop app only)
        try { await show(await toPdf(file), file.name.replace(/\.[^.]+$/, '') + '.pdf', true); }
        catch (e) { error = (e as Error)?.message === 'DESKTOP_ONLY' ? t('officeDesktopOnly') : t('officeFailed'); }
        busy = false; return;
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (/\.waraq$/i.test(file.name)) {
        try { await openPortfolioFile(bytes); }
        catch (e) { error = t((e as PortfolioError).kind === 'newer' ? 'portfolioNewer' : 'portfolioInvalid'); } // damaged, foreign or unsafe: never "not a PDF"
      } else {
        try { await show(bytes, file.name); }
        catch (e) { if ((e as Error)?.message === 'PASSWORD') { locked = { bytes, name: file.name, size: file.size, handle, path }; busy = false; return; } throw e; }
        remember({ key: `pdf:${file.name}:${file.size}`, kind: 'pdf', name: file.name, pages: doc!.sizes.length, handle, path, thumb: await cover() });
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
    let entries, m;
    try { entries = unzip(bytes); m = parse(entries); } catch (e) { throw e instanceof PortfolioError ? e : new PortfolioError('invalid'); }
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
        busy = false; return openFile(file, r.handle, r.path);
      }
    } catch { error = t('missing'); }
    busy = false;
  }

  async function pick() {
    const [first] = await pickFiles({ accept: { 'application/pdf': ['.pdf'], 'application/zip': ['.waraq'], 'application/octet-stream': CONVERTIBLE_ACCEPT.split(',') }, fallback: () => picker.click() });
    if (first) openFile(first.file, first.handle, first.path);
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
    if (isDesktop) { // straight to the file; "Save as" when there is none or it cannot be written
      const path = (doc.path && await writePath(doc.path, doc.bytes).then(() => doc!.path, () => null)) || await saveAs(doc.name, doc.bytes);
      if (path) { openedPath = doc.path = path; doc.name = baseName(path); doc.modified = false; }
    } else if (await saveFile(doc.bytes, doc.name)) doc.modified = false;
  }
  const thumbs = new Map<Blob, string>();
  const thumbUrl = (b: Blob) => thumbs.get(b) ?? (thumbs.set(b, URL.createObjectURL(b)), thumbs.get(b)!);
  const when = (at: number) => new Intl.RelativeTimeFormat(i18n.lang, { numeric: 'auto' }).format(Math.round((at - Date.now()) / 86_400_000), 'day');
</script>

{#if isDesktop}<TitleBar flush={!!(doc || portfolio)} />{/if}
<input bind:this={picker} type="file" accept="application/pdf,.pdf,.waraq,{CONVERTIBLE_ACCEPT}" hidden onchange={(e) => { openFile(e.currentTarget.files?.[0]); e.currentTarget.value = ''; }} />

{#if doc}
  <Workspace {pool} sizes={doc.sizes} name={doc.name} bytes={doc.bytes} modified={doc.modified} password={doc.password} onOpen={pick} onClose={close} onSave={save}
    onReplace={(bytes) => show(bytes, doc!.name, true)} />
{:else if portfolio}
  <Portfolio {pool} {portfolio} onClose={close} />
{:else}
  <div class="start" class:over role="region" aria-label={t('appName')}
    ondragover={(e) => { e.preventDefault(); over = true; }} ondragleave={() => (over = false)} ondrop={drop}>
    <span class="lang"><ThemeButton /><button class="btn icon" onclick={toggleLanguage} aria-label={t('language')} title={t('language')}>{@html icon('language')}</button></span>
    <div class="hero">
      <img src="/brand-mark.svg" alt="" width="72" height="72" />
      <h1>{t('appName')}</h1>
      <p class="tag">{t('tagline')}</p>
      <div class="actions">
        <button class="btn primary big" onclick={pick} disabled={busy}>{@html icon('upload')}{busy ? t('reading') : t('open')}</button>
        <button class="btn big" onclick={startPortfolio} disabled={busy}>{@html icon('library')}{t('newPortfolio')}</button>
      </div>
      <p class="muted">{t('dropHere')} · {t('portfolioHint')}</p>
      {#if locked}
        <form class="lock" onsubmit={unlockOpen}>
          <label for="pdfpw">{@html icon('protect')}{t('needsPassword')} <strong>{locked.name}</strong></label>
          <span><input id="pdfpw" type="password" bind:value={typed} autocomplete="off" />
          <button class="btn primary" disabled={busy || !typed}>{t('openShort')}</button>
          <button type="button" class="btn" onclick={() => { locked = null; typed = ''; error = ''; }}>{t('cancel')}</button></span>
        </form>
      {/if}
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
  .lang { display: flex; gap: var(--s-8); position: absolute; top: var(--s-16); inset-inline-end: var(--s-16); }
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
  .lock { display: grid; gap: var(--s-8); justify-items: center; padding: var(--s-16); border: 1px solid var(--line); border-radius: var(--r-12); background: var(--surface); }
  .lock label { display: inline-flex; align-items: center; gap: var(--s-8); }
  .lock span { display: flex; gap: var(--s-8); }
  .lock input { min-height: var(--control); padding: 0 var(--s-12); border: 1px solid var(--line); border-radius: var(--r-8); background: var(--paper); }
  .privacy { display: inline-flex; align-items: center; gap: var(--s-8); }
</style>
