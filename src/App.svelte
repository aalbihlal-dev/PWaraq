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
  import { saveDraft, listDrafts, readDraft, dropDraft, EVERY, type Draft } from './lib/drafts';
  import { startSession } from './lib/session';
  import { uid } from './lib/pages';
  import Notice from './components/Notice.svelte';
  import CrashReport from './components/CrashReport.svelte';
  import * as crash from './lib/crashlog';
  import type { Entry } from './lib/crashreport';
  import type { Health } from './lib/engine/pool';
  import { CONVERTIBLE_ACCEPT, isConvertible, toPdf } from './lib/convert';
  import { isDesktop, onOpenPaths, readPath, writePath, saveAs, baseName } from './lib/desktop';
  import TitleBar from './components/TitleBar.svelte';
  import PackPrompt from './components/PackPrompt.svelte';
  import { update, version, started, check as checkUpdate, restart } from './lib/update.svelte';
  import Workspace from './components/Workspace.svelte';
  import Portfolio from './components/Portfolio.svelte';

  const previous = crash.previousRun(); // what the run before this one was doing, read before this run starts overwriting it
  crash.install();
  const pool = new EnginePool();
  let doc = $state<{ name: string; sizes: { w: number; h: number }[]; bytes: Uint8Array; modified: boolean; password?: string; path?: string } | null>(null);
  let openedPath: string | undefined; // desktop: the file on disk behind `doc`, so Save writes straight back
  let portfolio = $state<PortfolioData | null>(null);
  let busy = $state(false), error = $state(''), over = $state(false), recent = $state<Recent[]>([]);
  let picker: HTMLInputElement;

  $effect(() => { document.documentElement.lang = i18n.lang; document.documentElement.dir = i18n.lang === 'ar' ? 'rtl' : 'ltr'; });
  const refresh = async () => (recent = await recentList());
  // recovery: engine health, drafts of unsaved work, the last closed document
  let health = $state<Health | null>(null), notice = $state(''), drafts = $state<Draft[]>([]), closed = $state<{ name: string; bytes: Uint8Array; modified: boolean; path?: string } | null>(null);
  let restoredWork = $state(false); // the person chose Restore: only then "your work was restored" is true
  let report = $state<Entry[]>([]), crashes = $state(0), copied = $state(false);
  async function copyReport() { if (await crash.copyReport()) { copied = true; setTimeout(() => (copied = false), 3000); } }
  let draftId = uid(), kept: Uint8Array | null = null, closeTimer: ReturnType<typeof setTimeout>;
  pool.onHealth = (h) => {
    if (h.kind === 'recovered') { crash.record('worker', h.why, h.op); notice = t('recovered'); setTimeout(() => (notice = ''), 8000); health = null; } else health = h.kind === 'slow' ? h : null;
  };
  if (navigator.webdriver) (globalThis as { waraqPool?: EnginePool }).waraqPool = pool; // lets the tests crash the engine on purpose
  async function keepDraft() {
    const d = doc;
    if (!d?.modified || d.bytes === kept) return;
    kept = d.bytes;
    try { await saveDraft(draftId, d.name, d.bytes, d.sizes.length); } catch { kept = null; } // storage full or private mode: the next change tries again
  }
  async function restoreDraft(d: Draft) {
    const bytes = await readDraft(d.id);
    drafts = [];
    if (!bytes) return;
    openedPath = undefined;
    await openFile(new File([bytes as Uint8Array<ArrayBuffer>], d.name));
    if (doc) { doc.modified = true; draftId = d.id; kept = doc.bytes; restoredWork = true; } // it carries on as the same draft; Save removes it
  }
  onMount(() => {
    refresh();
    startSession().then(async (unclean) => {
      if (unclean) { drafts = (await listDrafts()).slice(0, 1); await crash.record('unclean', 'The previous run ended without a clean exit', undefined, previous); }
      const unseen = (await crash.entries()).filter((e) => !e.seen && (e.kind === 'panic' || e.kind === 'unclean'));
      if (unseen.length && crash.askFirst()) report = unseen; else crash.markSeen(unseen);
      crashes = (await crash.entries()).length;
    });
    const every = setInterval(keepDraft, EVERY);
    if (isDesktop) onOpenPaths(async ([p]) => openFile(await readPath(p), undefined, p));
    started();
    return () => clearInterval(every);
  });

  class Damaged { pages: number; constructor(pages: number) { this.pages = pages; } }
  async function show(bytes: Uint8Array, name: string, modified = false, password?: string, repairedOk = false) {
    await setDocument(bytes);
    const sizes = await pool.open(bytes, password);
    if (pool.repaired && !repairedOk) throw new Damaged(sizes.length); // asked first: "Open what could be read"
    if (!(doc?.name === name && modified)) { draftId = uid(); kept = null; } // a change to the open document keeps its draft; anything else starts a new one
    doc = null; portfolio = null; await tick(); // a new document gets a fresh workspace
    doc = { name, sizes, bytes, modified, password, path: openedPath };
    keepDraft();
  }
  // a damaged PDF MuPDF could still read: shown on the start screen until the person chooses
  let damaged = $state<{ bytes: Uint8Array; name: string; pages: number } | null>(null);
  async function openReadable() {
    const d = damaged;
    if (!d) return;
    busy = true; error = ''; damaged = null;
    try {
      openedPath = undefined; // the repaired copy is a new file: "Save" asks where
      await show(await pool.tool<Uint8Array>('repair', { bytes: d.bytes }), d.name.replace(/(\.pdf)?$/i, '') + ' (repaired).pdf', true, undefined, true);
    } catch { error = t('notReadable'); }
    busy = false;
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
    let bytes0 = new Uint8Array(0);
    try {
      if (isConvertible(file.name)) { // Word, Excel, PowerPoint, DWG, DXF: converted first (desktop app only)
        try { await show(await toPdf(file), file.name.replace(/\.[^.]+$/, '') + '.pdf', true); }
        catch (e) { const m = (e as Error)?.message; if (m !== 'NO_PACKS') error = m === 'DESKTOP_ONLY' ? t('officeDesktopOnly') : t('officeFailed'); }
        busy = false; return;
      }
      const bytes = bytes0 = new Uint8Array(await file.arrayBuffer());
      if (/\.waraq$/i.test(file.name)) {
        try { await openPortfolioFile(bytes); }
        catch (e) { error = t((e as PortfolioError).kind === 'newer' ? 'portfolioNewer' : 'portfolioInvalid'); } // damaged, foreign or unsafe: never "not a PDF"
      } else {
        try { await show(bytes, file.name); }
        catch (e) {
          if ((e as Error)?.message === 'PASSWORD') { locked = { bytes, name: file.name, size: file.size, handle, path }; busy = false; return; }
          if (e instanceof Damaged) { damaged = { bytes, name: file.name, pages: e.pages }; busy = false; return; }
          throw e;
        }
        remember({ key: `pdf:${file.name}:${file.size}`, kind: 'pdf', name: file.name, pages: doc!.sizes.length, handle, path, thumb: await cover() });
      }
    } catch (e) { error = t(!/%PDF-/.test(new TextDecoder('latin1').decode(bytes0.subarray(0, 1024))) ? 'notPdf' : 'notReadable'); }
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
  async function close() {
    if (doc) { // kept for 10 minutes: "Undo close" on the start screen
      closed = { name: doc.name, bytes: doc.bytes, modified: doc.modified, path: doc.path };
      clearTimeout(closeTimer); closeTimer = setTimeout(() => (closed = null), 10 * 60_000);
      await keepDraft();
    }
    doc = null; portfolio = null; crash.setTask(''); refresh();
  }
  async function undoClose() {
    const c = closed;
    if (!c) return;
    closed = null; openedPath = c.path;
    await show(c.bytes, c.name, c.modified);
  }
  // the file about to be saved must open again, with as many pages as the document has
  async function save() {
    if (!doc) return;
    const d = doc, check = async (back: Uint8Array) => { if (await pool.tool<number>('verify', { bytes: back, password: d.password }) !== d.sizes.length) throw new Error('VERIFY'); };
    try {
      if (isDesktop) { // straight to the file; "Save as" when there is none or it cannot be written
        let path: string | null = null;
        if (d.path) path = await writePath(d.path, d.bytes, check).then(() => d.path!, (e) => { if ((e as Error)?.message === 'VERIFY') throw e; return null; });
        path ??= await saveAs(d.name, d.bytes, check);
        if (path) { openedPath = d.path = path; d.name = baseName(path); d.modified = false; }
      } else { await check(d.bytes); if (await saveFile(d.bytes, d.name)) d.modified = false; }
      if (!d.modified) { await dropDraft(draftId); draftId = uid(); kept = null; }
    } catch { alert(t('saveStopped')); }
  }
  const thumbs = new Map<Blob, string>();
  const thumbUrl = (b: Blob) => thumbs.get(b) ?? (thumbs.set(b, URL.createObjectURL(b)), thumbs.get(b)!);
  const ago = (at: number) => new Date(at).toLocaleString(i18n.lang === 'ar' ? 'ar' : 'en-GB', { hour: '2-digit', minute: '2-digit', ...(Date.now() - at > 43_200_000 ? { day: 'numeric', month: 'short' } : {}) });
  const when = (at: number) => new Intl.RelativeTimeFormat(i18n.lang, { numeric: 'auto' }).format(Math.round((at - Date.now()) / 86_400_000), 'day');
</script>

{#if report.length && !drafts.length}
  <CrashReport entry={report[0]} restored={restoredWork} onclose={() => { crash.markSeen(report); report = []; }} />
{/if}
<Notice message={notice} slow={health?.kind === 'slow'} oncancel={() => pool.cancelAll()} />
{#if isDesktop}<TitleBar flush={!!(doc || portfolio)} /><PackPrompt />{/if}
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
      {#if damaged}
        <div class="banner" role="alert">
          <p>{t('damagedPdf').replace('{name}', damaged.name).replace('{n}', String(damaged.pages))}</p>
          <span><button class="btn primary" onclick={openReadable}>{t('openReadable')}</button> <button class="btn" onclick={() => (damaged = null)}>{t('cancel')}</button></span>
        </div>
      {/if}
      {#if drafts.length}
        <div class="banner" role="status">
          <p><strong>{t('restoreFrom').replace('{time}', ago(drafts[0].at))}</strong><br />{t('restoreHelp').replace('{name}', drafts[0].name)}</p>
          <span><button class="btn primary" onclick={() => restoreDraft(drafts[0])}>{t('restore')}</button> <button class="btn" onclick={async () => { await dropDraft(drafts[0].id); drafts = []; }}>{t('discardDraft')}</button></span>
        </div>
      {/if}
      {#if closed}
        <button class="btn" onclick={undoClose}>{@html icon('undo')}{t('undoClose').replace('{name}', closed.name)}</button>
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
    {#if isDesktop}
      <div class="updaterow">
        {#if update.rolledBack}<p class="muted small" role="status">{t('updateRolledBack').replace('{failed}', update.rolledBack.failed).replace('{back}', update.rolledBack.back)}</p>{/if}
        <p class="crashrow">
          <span class="muted small">{t('appName')} <bdi dir="ltr">{version}</bdi></span>
          {#if update.status === 'ready'}<button class="btn primary" onclick={restart}>{t('updateRestart')} · {update.version}</button>
          {:else if update.status === 'downloading'}<span class="muted small" role="status">{t('updateDownloading')} {update.version}{update.total ? ` · ${Math.round((update.done / update.total) * 100)}%` : '…'}</span>
          {:else if update.status === 'checking'}<span class="muted small" role="status">{t('updateChecking')}</span>
          {:else}
            {#if update.status !== 'idle'}<span class="muted small" role="status">{t(update.status === 'latest' ? 'updateLatest' : 'updateFailed')}</span>{/if}
            <button class="btn" onclick={checkUpdate}>{t('updateCheck')}</button>
          {/if}
        </p>
      </div>
    {/if}
    {#if crashes}
      <p class="crashrow">
        <button class="btn" onclick={copyReport}>{copied ? t('crashCopied') : t('copyCrash')}</button>
        {#if isDesktop}<button class="btn" onclick={() => crash.openFolder()}>{t('openCrashFolder')}</button>{/if}
      </p>
    {/if}
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
  .meta strong { display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; line-height: 1.3; } /* two lines, the full name is the tooltip */
  .x { position: absolute; top: 50%; inset-inline-end: var(--s-8); transform: translateY(-50%); }
  .lock { display: grid; gap: var(--s-8); justify-items: center; padding: var(--s-16); border: 1px solid var(--line); border-radius: var(--r-12); background: var(--surface); }
  .lock label { display: inline-flex; align-items: center; gap: var(--s-8); }
  .lock span { display: flex; gap: var(--s-8); }
  .lock input { min-height: var(--control); padding: 0 var(--s-12); border: 1px solid var(--line); border-radius: var(--r-8); background: var(--paper); }
  .crashrow { display: flex; gap: var(--s-8); margin: 0; align-items: center; flex-wrap: wrap; }
  .updaterow { display: grid; gap: var(--s-8); justify-items: center; }
  .banner { display: grid; gap: var(--s-8); justify-items: center; padding: var(--s-16); border: 1px solid var(--green); border-radius: var(--r-12); background: var(--green-soft); text-align: center; max-width: 520px; }
  .banner p { margin: 0; }
  .banner span { display: flex; gap: var(--s-8); }
  .privacy { display: inline-flex; align-items: center; gap: var(--s-8); }
</style>
