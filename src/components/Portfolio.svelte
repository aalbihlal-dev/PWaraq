<script lang="ts">
  // The Portfolio screen: sections in the page grid (each with its title, optional divider page and pages), the
  // table of contents above them (the titles can be edited right there), options on the right. Every change is kept
  // on this device at once; "Export PDF" builds the combined file, "Save .waraq" a portable copy of the portfolio.
  import { onDestroy } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import type { EnginePool } from '../lib/engine/pool';
  import { i18n, t, toggleLanguage } from '../lib/i18n.svelte';
  import ThemeButton from './ThemeButton.svelte';
  import { icon } from '../lib/icons.js';
  import { addFiles, uid, seen, toItems, type Group, type GridItem } from '../lib/pages';
  import { build, plan, manifest, used, fileTitle, sectionsOf, withDefaults, type Portfolio, type Section } from '../lib/portfolio';
  import * as vault from '../lib/vault';
  import { pickFiles, saveFile, writePortfolio, readPortfolio, readPortfolioFile, remember } from '../lib/store';
  import { DESIGNS, PAPERS, COLOURS, type Paper } from '../lib/engine/designs';
  import { turned } from '../lib/pages';
  import { zip } from '../lib/zip';
  import PageGrid from './PageGrid.svelte';
  import PageEditor, { type Saved } from './PageEditor.svelte';

  let { pool, portfolio, onClose }: { pool: EnginePool; portfolio: Portfolio; onClose: () => void } = $props();
  // svelte-ignore state_referenced_locally (one screen per opened portfolio)
  let p = $state(portfolio);
  const selected = new SvelteSet<string>();
  let size = $state(140), busy = $state(''), savedAt = $state(0);
  const layout = $derived(plan(p));
  const groups = $derived<Group[]>(p.sections.map((s) => ({ id: s.id, items: s.items, hidden: s.collapsed, locked: s.locked })));

  // undo / redo: whole-portfolio snapshots (titles typed in place are not undo steps)
  let past: Portfolio[] = [], future: Portfolio[] = [], canUndo = $state(false), canRedo = $state(false);
  function change(f: (p: Portfolio) => void) { past.push($state.snapshot(p) as Portfolio); future = []; f(p); canUndo = true; canRedo = false; }
  function undo() { if (!past.length) return; future.push($state.snapshot(p) as Portfolio); p = past.pop()!; canUndo = !!past.length; canRedo = true; selected.clear(); }
  function redo() { if (!future.length) return; past.push($state.snapshot(p) as Portfolio); p = future.pop()!; canRedo = !!future.length; canUndo = true; }

  // kept on this device after every change (the original files were written when they were added); closing or
  // saving a copy writes a waiting change at once
  let timer: ReturnType<typeof setTimeout>, waiting: (() => Promise<void>) | null = null;
  $effect(() => {
    const json = manifest(p), name = p.name, pages = layout.slots.length, id = p.id;
    waiting = async () => {
      try { await writePortfolio(id, 'manifest.json', json); savedAt = Date.now(); } catch {}
      await keepVersion(id, json);
      await remember({ key: 'portfolio:' + id, kind: 'portfolio', name, pages });
    };
    clearTimeout(timer); timer = setTimeout(flush, 500);
  });
  // the last 5 saved states (at most one every 30 s, and the state the portfolio was opened in): "Restore previous version"
  const VERSIONS = 5, EVERY = 30_000;
  let lastVersion = 0, versions = $state<{ name: string; at: number }[]>([]), showVersions = $state(false);
  async function keepVersion(id: string, json: string) {
    if (Date.now() - lastVersion < EVERY) return;
    lastVersion = Date.now();
    try {
      await vault.put(`portfolio-versions/${id}/${lastVersion}.json`, json);
      for (const old of (await vault.list(`portfolio-versions/${id}`)).slice(VERSIONS)) await vault.remove(`portfolio-versions/${id}/${old.name}`);
    } catch { /* no storage: the portfolio itself is still saved */ }
  }
  async function openVersions() {
    showVersions = !showVersions;
    if (showVersions) versions = (await vault.list(`portfolio-versions/${p.id}`)).map((e) => ({ name: e.name, at: Number(e.name.replace('.json', '')) || e.at }));
  }
  async function restoreVersion(v: { name: string }) {
    showVersions = false;
    const text = await vault.getText(`portfolio-versions/${p.id}/${v.name}`);
    if (!text) return;
    const m = JSON.parse(text);
    change((p) => { p.name = m.name; p.options = withDefaults(m.options ?? {}); p.sections = sectionsOf(m, p.files); }); // an ordinary change: Undo brings the current state back
    selected.clear();
  }
  const versionTime = (at: number) => new Date(at).toLocaleString(i18n.lang === 'ar' ? 'ar' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  function flush() { clearTimeout(timer); const w = waiting; waiting = null; return w?.(); }
  onDestroy(flush);

  // files -> engine sources, written once into the portfolio's folder
  async function load(files: File[]) {
    const added = await addFiles(pool, files);
    for (const a of added) {
      const id = uid();
      await writePortfolio(p.id, 'files/' + id, a.bytes);
      p.files[id] = { name: a.file.name, mime: a.items[0]?.image ? a.file.type : 'application/pdf', doc: a.doc };
      (a as any).fileId = id;
    }
    return added as (typeof added[number] & { fileId: string })[];
  }
  const accept = { 'application/pdf': ['.pdf'], 'image/*': ['.png', '.jpg', '.jpeg'] };
  let picker: HTMLInputElement, onPicked: (files: File[]) => void = () => {};
  async function choose(multiple: boolean, then: (files: File[]) => Promise<void>) {
    onPicked = (f) => run(() => then(f));
    const picked = await pickFiles({ multiple, accept, fallback: () => { picker.multiple = multiple; picker.click(); } });
    if (picked.length) run(() => then(picked.map((x) => x.file)));
  }
  async function run(job: () => Promise<void>) { busy = t('reading'); try { await job(); } catch { alert(t('notPdf')); } busy = ''; }

  // each file becomes a section titled by its file name (marked until renamed)
  const addSections = (files: File[]) => load(files).then((added) => change((p) => {
    for (const a of added) p.sections.push({ id: uid(), title: fileTitle(a.file.name), fromFile: true, file: a.fileId, divider: false, note: '', items: a.items });
  }));
  const addPages = (section: string, index: number) => choose(true, (files) => insertPages(files, section, index));
  const insertPages = (files: File[], section: string, index: number) => load(files).then((added) => change((p) => {
    const s = p.sections.find((x) => x.id === section)!;
    s.items.splice(index, 0, ...added.flatMap((a) => a.items));
  }));
  // a corrected file takes the place of the old one's pages; the title follows the file unless it was renamed
  const replace = (s: Section) => choose(false, (files) => load(files).then(([a]) => change((p) => {
    const sec = p.sections.find((x) => x.id === s.id)!, old = sec.file ? p.files[sec.file]?.doc : undefined;
    const at = Math.max(0, sec.items.findIndex((it) => it.doc === old));
    sec.items = sec.items.filter((it) => it.doc !== old); sec.items.splice(Math.min(at, sec.items.length), 0, ...a.items);
    sec.file = a.fileId; if (sec.fromFile) sec.title = fileTitle(a.file.name);
  })));
  const shift = (i: number, by: number) => change((p) => { const [s] = p.sections.splice(i, 1); p.sections.splice(i + by, 0, s); });
  // drag a whole section by its handle: the green line shows where it goes (above or below another section)
  let dragSection = $state(-1), dropSection = $state<{ at: number; after: boolean } | null>(null);
  function overSection(e: DragEvent, i: number) {
    if (dragSection < 0) return;
    e.preventDefault(); e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    dropSection = { at: i, after: e.clientY > r.top + r.height / 2 };
  }
  function dropOnSection(e: DragEvent) {
    if (dragSection < 0 || !dropSection) return;
    e.preventDefault(); e.stopPropagation();
    const from = dragSection, to = dropSection.at + (dropSection.after ? 1 : 0);
    dragSection = -1; dropSection = null;
    if (to === from || to === from + 1) return;
    change((p) => { const [s] = p.sections.splice(from, 1); p.sections.splice(to > from ? to - 1 : to, 0, s); });
  }
  const removeSection = (i: number) => change((p) => { if (p.options.numbers === p.sections[i].id) p.options.numbers = 'all'; p.sections.splice(i, 1); });
  const gridChange = (next: Group[]) => change((p) => { for (const g of next) p.sections.find((s) => s.id === g.id)!.items = g.items; });

  async function exportPdf() {
    busy = t('applying');
    try { await saveFile(await pool.build(build(p, { contents: t('contents'), section: t('section'), supervisor: t('supervisorLabel'), rtl: i18n.lang === 'ar' })), p.name + '.pdf'); }
    finally { busy = ''; }
  }
  async function saveCopy() {
    busy = t('applying');
    try {
      await flush();
      const stored = (await readPortfolio(p.id)) ?? {}, files: Record<string, Uint8Array> = { 'manifest.json': new TextEncoder().encode(manifest(p)) };
      for (const id of used(p)) if (stored['files/' + id]) files['files/' + id] = stored['files/' + id];
      await saveFile(zip(files), p.name + '.waraq', 'application/zip');
    } finally { busy = ''; }
  }

  // the divider card has the shape of the section's first page, turned like the divider will be
  function paper(s: Section) {
    const first = s.items.find((it) => !it.image && !it.blank), d0 = first ? seen(first) : { w: 595, h: 842 };
    const d = turned({ rotate: s.turn ?? 0 }) % 180 ? { w: d0.h, h: d0.w } : d0, k = Math.min(size / d.w, (size * 1.3) / d.h);
    return { box: `width:${d.w * k}px;height:${d.h * k}px`, inner: `width:${d0.w * k}px;height:${d0.h * k}px;transform:translate(-50%,-50%) rotate(${turned({ rotate: s.turn ?? 0 })}deg)` };
  }
  const turnDivider = (s: Section, by: number) => change(() => (s.turn = turned({ rotate: (s.turn ?? 0) + by })));

  // cover logos: image files of the portfolio, shown in the cover card and the panel
  const accepts = { 'image/*': ['.png', '.jpg', '.jpeg'] };
  let logoUrls = $state<Record<string, string>>({});
  $effect(() => {
    for (const id of [...Object.values(p.options.cover.logos), p.options.cover.photo]) if (id && !logoUrls[id])
      readPortfolioFile(p.id, 'files/' + id).then((b) => { if (b) logoUrls[id] = URL.createObjectURL(new Blob([b as Uint8Array<ArrayBuffer>])); });
  });
  // the cover photo (a background): across the top, or the whole page under a see-through colour
  async function addPhoto() {
    const picked = await pickFiles({ accept: accepts, fallback: () => { onPicked = (f) => run(() => setPhoto(f)); picker.multiple = false; picker.click(); } });
    if (picked.length) run(() => setPhoto(picked.map((x) => x.file)));
  }
  const setPhoto = (files: File[]) => load(files.slice(0, 1)).then(([a]) => change((p) => { p.options.cover.photo = a.fileId; }));
  async function addLogo(place: 'left' | 'center' | 'right') {
    const picked = await pickFiles({ accept: accepts, fallback: () => { onPicked = (f) => run(() => setLogo(place, f)); picker.multiple = false; picker.click(); } });
    if (picked.length) run(() => setLogo(place, picked.map((x) => x.file)));
  }
  const setLogo = (place: 'left' | 'center' | 'right', files: File[]) => load(files.slice(0, 1)).then(([a]) => change((p) => { p.options.cover.logos[place] = a.fileId; }));

  const allItems = () => p.sections.flatMap((s) => s.items);
  // the page panel: the selected page (Edit page is the main action there), and adding a writing-paper page
  const sectionOf = (id: string) => p.sections.find((s) => s.items.some((it) => it.id === id));
  const one = $derived(selected.size === 1 ? allItems().find((it) => selected.has(it.id)) ?? null : null);
  const oneLocked = $derived(!!(one && sectionOf(one.id)?.locked));
  const turnOne = (by: number) => one && change(() => { const it = sectionOf(one.id)!.items.find((x) => x.id === one.id)!; it.rotate = turned({ rotate: it.rotate + by }); });
  const deleteOne = () => one && change(() => { const s = sectionOf(one.id)!; s.items = s.items.filter((x) => x.id !== one.id); selected.clear(); });
  function addPaper(paper: Paper) {
    const last = [...selected].at(-1), s = (last && sectionOf(last)) || p.sections.filter((x) => !x.locked).at(-1);
    if (!s || s.locked) return;
    const at = last ? s.items.findIndex((x) => x.id === last) + 1 : s.items.length, near = s.items[at - 1] ?? s.items[at];
    const d = near && !near.blank ? seen(near) : near ? { w: near.w, h: near.h } : { w: 595, h: 842 };
    const page: GridItem = { id: uid(), doc: -1, page: 0, rotate: 0, w: d.w, h: d.h, blank: true, paper };
    change((p) => { p.sections.find((x) => x.id === s.id)!.items.splice(at, 0, page); });
    selected.clear(); selected.add(page.id);
  }
  const label = (it: GridItem) => String((layout.at.get(it.id) ?? 0) + 1);
  // the page editor on one page: the edited page is kept as a file of the portfolio and takes the old page's place, so
  // sections, contents and numbers carry on as before
  let editing = $state<GridItem | null>(null);
  const editBase = (it: GridItem) => toItems(allItems())[allItems().findIndex((x) => x.id === it.id)];
  async function edited(r: Saved) {
    const id = editing!.id, file = uid();
    await writePortfolio(p.id, 'files/' + file, r.bytes);
    change((p) => {
      p.files[file] = { name: 'edited-page.pdf', mime: 'application/pdf', doc: r.doc };
      for (const s of p.sections) s.items = s.items.map((it) => (it.id === id ? { ...it, doc: r.doc, page: 0, rotate: 0, w: r.w, h: r.h, image: false, blank: false } : it));
    });
    editing = null;
  }

  function keys(e: KeyboardEvent) {
    if (editing || !(e.ctrlKey || e.metaKey) || (e.target as HTMLElement).closest('input,textarea')) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
  }
</script>

<svelte:window onkeydown={keys} />
<input bind:this={picker} type="file" accept="application/pdf,.pdf,image/png,image/jpeg" hidden
  onchange={(e) => { const f = [...(e.currentTarget.files ?? [])]; e.currentTarget.value = ''; if (f.length) onPicked(f); }} />

<div class="pf">
  <header class="bar">
    <img src="/brand-mark.svg" alt="" width="28" height="28" />
    <span class="chip">{@html icon('library')}{t('portfolio')}</span>
    <strong class="name" title={p.name}>{p.name}</strong>
    <button class="btn" onclick={() => choose(true, addSections)} disabled={!!busy}>{@html icon('plus')}{t('addSection')}</button>
    <span class="end">
      <button class="btn icon" onclick={undo} disabled={!canUndo} title={t('undo')} aria-label={t('undo')}>{@html icon('undo')}</button>
      <button class="btn icon" onclick={redo} disabled={!canRedo} title={t('redo')} aria-label={t('redo')}><span class="flip">{@html icon('undo')}</span></button>
      <span class="versions">
        <button class="btn icon" onclick={openVersions} aria-expanded={showVersions} title={t('previousVersions')} aria-label={t('previousVersions')}>{@html icon('repair')}</button>
        {#if showVersions}
          <div class="menu" role="menu" aria-label={t('previousVersions')}>
            <strong>{t('previousVersions')}</strong>
            {#each versions as v (v.name)}<button class="btn" role="menuitem" onclick={() => restoreVersion(v)}>{versionTime(v.at)}</button>{:else}<span class="muted">{t('noVersions')}</span>{/each}
          </div>
        {/if}
      </span>
      <button class="btn" onclick={async () => { await flush(); onClose(); }}>{@html icon('close')}{t('close')}</button>
      <ThemeButton />
      <button class="btn icon" onclick={toggleLanguage} title={t('language')} aria-label={t('language')}>{@html icon('language')}</button>
    </span>
  </header>

  {#if editing}
    <PageEditor {pool} base={editBase(editing)} label="{t('page')} {(layout.at.get(editing.id) ?? 0) + 1}" onSave={edited} onCancel={() => (editing = null)} />
  {:else}
  <div class="body" style="--acc:{p.options.color}">
    {#if p.sections.length}
      <PageGrid {pool} {groups} {selected} {size} number={label} onchange={gridChange} oninsert={addPages}
        onfiles={(files, section, index) => run(() => insertPages(files, section, index))} onopen={(it) => (editing = it)}>
        {#snippet header(g, gi)}
          {@const s = p.sections[gi]}
          {#if gi === 0 && p.options.cover.on}
            {@const c = p.options.cover}
            <div class="covercard">
              <div class="mini d-{p.options.design}" class:photo-top={c.photo && c.photoPlace === 'top'} class:photo-full={c.photo && c.photoPlace === 'full'} aria-label={t('cover')}
                style={c.photo && logoUrls[c.photo] ? `--photo:url(${logoUrls[c.photo]})` : ''}>
                <span class="logos">{#each ['left', 'center', 'right'] as const as place}<i>{#if c.logos[place] && logoUrls[c.logos[place]!]}<img src={logoUrls[c.logos[place]!]} alt="" />{/if}</i>{/each}</span>
                <strong>{c.title || p.name}</strong>
                {#if c.subtitle}<small>{c.subtitle}</small>{/if}
                <span class="names">{#each c.names.split(/\r?\n/).filter((n) => n.trim()) as n}<span>{n}</span>{/each}</span>
                {#if c.supervisor}<small class="sup">{t('supervisorLabel')} {c.supervisor}</small>{/if}
              </div>
              <span class="num">1 · {t('cover')}</span>
            </div>
          {/if}
          {#if gi === 0 && p.options.toc && layout.shown.length}
            <section class="toc" aria-label={t('contents')}>
              <h2>{t('contents')}</h2>
              <p class="help">{t('tocHelp')}</p>
              <ol>
                {#each layout.shown as sec (sec.id)}
                  <li class:auto={sec.fromFile}>
                    <input bind:value={sec.title} oninput={() => (sec.fromFile = false)} aria-label={t('sectionTitle')} />
                    {#if sec.fromFile}<span class="from" title={t('fromFileName')}>{@html icon('info')}<span>{t('fromFileName')}</span></span>{/if}
                    <span class="num pg">{layout.target.get(sec.id)! + 1}</span>
                  </li>
                {/each}
              </ol>
            </section>
          {/if}
          <div class="sec" class:closed={s.collapsed} class:locked={s.locked} class:dropbefore={dropSection?.at === gi && !dropSection.after} class:dropafter={dropSection?.at === gi && dropSection.after}
            role="group" aria-label="{t('section')} {gi + 1}" ondragover={(e) => overSection(e, gi)} ondrop={dropOnSection}>
            <span class="grip" draggable="true" role="button" tabindex="-1" title={t('dragSection')} aria-label={t('dragSection')}
              ondragstart={(e) => { dragSection = gi; e.dataTransfer!.effectAllowed = 'move'; e.dataTransfer!.setData('text/plain', 'waraq-section'); }}
              ondragend={() => { dragSection = -1; dropSection = null; }}>{@html icon('move')}</span>
            <button class="btn icon fold" onclick={() => (s.collapsed = !s.collapsed)} aria-expanded={!s.collapsed} title={s.collapsed ? t('openSection') : t('closeSection')} aria-label={s.collapsed ? t('openSection') : t('closeSection')}>{@html icon(s.collapsed ? 'chevron-down' : 'chevron-up')}</button>
            <span class="badge num">{t('section')} {gi + 1}</span>
            <input class="title" class:auto={s.fromFile} bind:value={s.title} oninput={() => (s.fromFile = false)} readonly={s.locked} aria-label={t('sectionTitle')} />
            {#if s.fromFile}<span class="from" title={t('fromFileName')}>{@html icon('info')}</span>{/if}
            {#if s.collapsed}<span class="hiddenpages num">{s.items.length} {t('pagesCount')} · {t('hiddenPages')}</span>{/if}
            <span class="end">
              {#if !s.locked}
              <button class="btn" class:on={s.divider} aria-pressed={s.divider} onclick={() => change(() => (s.divider = !s.divider))}>{@html icon('bookmarks')}{t('divider')}</button>
              <button class="btn" onclick={() => addPages(s.id, s.items.length)} disabled={!!busy}>{@html icon('images')}{t('addPages')}</button>
              {#if s.file}<button class="btn" onclick={() => replace(s)} disabled={!!busy}>{@html icon('reverse')}{t('replace')}</button>{/if}
              {/if}
              <button class="btn icon" class:on={s.locked} aria-pressed={!!s.locked} onclick={() => (s.locked = !s.locked)} title={s.locked ? t('unlockSection') : t('lockSection')} aria-label={s.locked ? t('unlockSection') : t('lockSection')}>{@html icon(s.locked ? 'lock' : 'unlock')}</button>
              <button class="btn icon" onclick={() => shift(gi, -1)} disabled={gi === 0} title={t('moveUp')} aria-label={t('moveUp')}>{@html icon('chevron-up')}</button>
              <button class="btn icon" onclick={() => shift(gi, 1)} disabled={gi === p.sections.length - 1} title={t('moveDown')} aria-label={t('moveDown')}>{@html icon('chevron-down')}</button>
              {#if !s.locked}<button class="btn icon" onclick={() => removeSection(gi)} title={t('deleteSection')} aria-label={t('deleteSection')}>{@html icon('delete')}</button>{/if}
            </span>
          </div>
        {/snippet}
        {#snippet lead(g, gi)}
          {@const s = p.sections[gi]}
          {#if s.divider}
            {@const pp = paper(s)}
            <div class="dcell">
              <div class="paperbox" style={pp.box}>
                <div class="paper d-{p.options.design}" style={pp.inner}>
                  <span class="lbl">{t('section')} {gi + 1}</span>
                  <textarea rows="3" bind:value={s.title} oninput={() => (s.fromFile = false)} readonly={s.locked} aria-label={t('sectionTitle')}></textarea>
                  <i class="rule"></i>
                  <input bind:value={s.note} placeholder={t('dividerNote')} readonly={s.locked} aria-label={t('dividerNote')} />
                </div>
              </div>
              <span class="dnum num">{(layout.target.get(s.id) ?? 0) + 1}
                {#if !s.locked}
                <button class="btn icon" onclick={() => turnDivider(s, -90)} title={t('rotateLeft')} aria-label="{t('rotateLeft')}: {t('divider')}">{@html icon('turn-left')}</button>
                <button class="btn icon" onclick={() => turnDivider(s, 90)} title={t('rotateRight')} aria-label="{t('rotateRight')}: {t('divider')}">{@html icon('turn-right')}</button>
                {/if}
              </span>
            </div>
          {/if}
        {/snippet}
      </PageGrid>
    {:else}
      <button class="empty" onclick={() => choose(true, addSections)} ondragover={(e) => e.preventDefault()}
        ondrop={(e) => { e.preventDefault(); const f = [...(e.dataTransfer?.files ?? [])]; if (f.length) run(() => addSections(f)); }}>
        {@html icon('library')}<strong>{t('addSection')}</strong><span>{t('emptyPortfolio')}</span>
      </button>
    {/if}

    <aside class="side" aria-label={t('options')}>
      <label class="field"><span>{t('portfolioName')}</span><input bind:value={p.name} /></label>

      <section class="group" aria-label={t('page')}>
        <h3>{t('page')}</h3>
        {#if one}
          <button class="btn primary big" onclick={() => (editing = one)} disabled={oneLocked || !!busy}>{@html icon('edit')}{t('editPage')}</button>
          <div class="trio">
            <button class="btn" onclick={() => turnOne(-90)} disabled={oneLocked}>{@html icon('turn-left')}{t('rotateLeft')}</button>
            <button class="btn" onclick={() => turnOne(90)} disabled={oneLocked}>{@html icon('turn-right')}{t('rotateRight')}</button>
            <button class="btn danger" onclick={deleteOne} disabled={oneLocked} title={t('delete')} aria-label={t('delete')}>{@html icon('delete')}</button>
          </div>
          {#if oneLocked}<p class="help">{@html icon('lock')} {t('sectionLocked')}</p>{/if}
        {:else}<p class="help">{t('pickPage')}</p>{/if}
        <span class="sub">{t('addPaper')}</span>
        <div class="papers">
          {#each PAPERS as paper}
            <button class="tile" onclick={() => addPaper(paper)} disabled={!p.sections.some((s) => !s.locked)} title={t(('paper_' + paper) as any)}>
              <i class="sw paper-{paper}"></i><span>{t(('paper_' + paper) as any)}</span>
            </button>
          {/each}
        </div>
      </section>

      <section class="group" aria-label={t('cover')}>
        <label class="switch"><input type="checkbox" checked={p.options.cover.on} onchange={(e) => change((p) => (p.options.cover.on = e.currentTarget.checked))} /><h3>{t('cover')}</h3></label>
        {#if p.options.cover.on}
          {@const c = p.options.cover}
          <label class="field"><span>{t('coverTitle')}</span><input bind:value={c.title} placeholder={p.name} /></label>
          <label class="field"><span>{t('coverSubtitle')}</span><input bind:value={c.subtitle} /></label>
          <label class="field"><span>{t('coverNames')}</span><textarea rows="3" bind:value={c.names} placeholder={t('coverNamesHint')}></textarea></label>
          <label class="field"><span>{t('coverSupervisor')}</span><input bind:value={c.supervisor} /></label>
          <span class="sub">{t('coverPhoto')}</span>
          <div class="photo">
            {#if c.photo}
              <span class="img">{#if logoUrls[c.photo]}<img src={logoUrls[c.photo]} alt={t('coverPhoto')} />{/if}</span>
              <button class="btn icon" onclick={() => change((p) => { delete p.options.cover.photo; })} title={t('remove')} aria-label="{t('remove')}: {t('coverPhoto')}">{@html icon('close')}</button>
            {:else}
              <button class="btn add" onclick={addPhoto} disabled={!!busy}>{@html icon('images')}{t('addPhoto')}</button>
            {/if}
          </div>
          {#if c.photo}
            <div class="seg two" role="radiogroup" aria-label={t('coverPhoto')}>
              <button role="radio" aria-checked={c.photoPlace === 'top'} class:on={c.photoPlace === 'top'} onclick={() => change(() => (c.photoPlace = 'top'))}>{t('photoTop')}</button>
              <button role="radio" aria-checked={c.photoPlace === 'full'} class:on={c.photoPlace === 'full'} onclick={() => change(() => (c.photoPlace = 'full'))}>{t('photoFull')}</button>
            </div>
          {/if}
          <span class="sub">{t('logos')}</span>
          <div class="logos">
            {#each [['left', 'logoLeft'], ['center', 'logoCenter'], ['right', 'logoRight']] as const as [place, label]}
              <div class="slot">
                {#if c.logos[place]}
                  <span class="img">{#if logoUrls[c.logos[place]!]}<img src={logoUrls[c.logos[place]!]} alt={t(label)} />{/if}</span>
                  <button class="btn icon" onclick={() => change((p) => { delete p.options.cover.logos[place]; })} title={t('remove')} aria-label="{t('remove')}: {t(label)}">{@html icon('close')}</button>
                {:else}
                  <button class="btn add" onclick={() => addLogo(place)} disabled={!!busy}>{@html icon('plus')}{t(label)}</button>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </section>

      <section class="group" aria-label={t('design')}>
        <h3>{t('design')}</h3>
        <div class="designs" role="radiogroup" aria-label={t('design')}>
          {#each DESIGNS as d}
            <button class="tile" role="radio" aria-checked={p.options.design === d} class:on={p.options.design === d} onclick={() => change((p) => (p.options.design = d))}>
              <i class="sw d-{d}"><b></b></i><span>{t(('design_' + d) as any)}</span>
            </button>
          {/each}
        </div>
        <span class="sub">{t('colour')}</span>
        <div class="colours" role="radiogroup" aria-label={t('colour')}>
          {#each COLOURS as c}
            <button class="dot" role="radio" aria-checked={p.options.color === c} class:on={p.options.color === c} style="--c:{c}" onclick={() => change((p) => (p.options.color = c))} aria-label="{t('colour')} {c}" title={c}></button>
          {/each}
          <label class="dot own" title={t('ownColour')}><span class="sr">{t('ownColour')}</span><input type="color" value={p.options.color} onchange={(e) => { const c = e.currentTarget.value; change((p) => (p.options.color = c)); }} /></label>
        </div>
        <button class="btn" onclick={() => change((p) => p.sections.forEach((s) => (s.divider = true)))} disabled={!p.sections.length}>{@html icon('bookmarks')}{t('allDividers')}</button>
        <label class="switch"><input type="checkbox" bind:checked={p.options.logosOnDividers} />{t('logosOnDividers')}</label>
        <label class="field"><span>{t('headerOnDividers')}</span>
          <select bind:value={p.options.header}>
            <option value="none">{t('numbersNone')}</option><option value="small">{t('small')}</option><option value="big">{t('big')}</option>
          </select></label>
      </section>

      <section class="group" aria-label={t('numbers')}>
        <label class="switch"><input type="checkbox" bind:checked={p.options.toc} />{t('tocSwitch')}</label>
        <label class="field"><span>{t('numbers')}</span>
          <select bind:value={p.options.numbers}>
            <option value="none">{t('numbersNone')}</option>
            <option value="all">{t('numbersAll')}</option>
            {#each p.sections as s (s.id)}<option value={s.id}>{t('numbersOnly')}: {s.title}</option>{/each}
          </select>
        </label>
        {#if p.options.numbers !== 'none'}
          <div class="seg" role="radiogroup" aria-label={t('numberPosition')}>
            {#each [['left', 'posLeft'], ['center', 'posCentre'], ['right', 'posRight']] as const as [pos, label]}
              <button role="radio" aria-checked={p.options.numberPos === pos} class:on={p.options.numberPos === pos} onclick={() => (p.options.numberPos = pos)}>{t(label)}</button>
            {/each}
          </div>
        {/if}
        <label class="switch"><input type="checkbox" bind:checked={p.options.bookmarks} />{t('bookmarks')}</label>
      </section>

      <label class="field"><span>{t('thumbSize')}</span><input type="range" min="96" max="240" step="8" bind:value={size} /></label>
      <p class="state num" aria-live="polite">{busy || (savedAt ? `${t('saved')} · ${layout.slots.length} ${t('pagesCount')}` : '')}</p>
      <button class="btn primary" onclick={exportPdf} disabled={!!busy || !layout.slots.length}>{@html icon('download')}{t('exportPdf')}</button>
      <button class="btn" onclick={saveCopy} disabled={!!busy}>{@html icon('library')}{t('saveWaraq')}</button>
    </aside>
  </div>
  {/if}
</div>

<style>
  .pf { height: 100%; display: grid; grid-template-rows: auto 1fr; }
  .bar { display: flex; align-items: center; gap: var(--s-12); padding: var(--s-8) var(--s-16); background: var(--surface); border-bottom: 1px solid var(--line); min-width: 0; }
  .chip { display: inline-flex; align-items: center; gap: var(--s-8); padding: 0 var(--s-12); min-height: 28px; border-radius: 14px; background: var(--green-soft); color: var(--green-deep); font-weight: 600; font-size: var(--fs-12); }
  .name { max-width: 28ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .versions { position: relative; }
  .menu { position: absolute; z-index: 20; inset-inline-end: 0; top: calc(100% + var(--s-8)); display: grid; gap: var(--s-8); min-width: 220px; padding: var(--s-12); border: 1px solid var(--line); border-radius: var(--r-12); background: var(--surface); box-shadow: var(--shadow); }
  .menu .muted { color: var(--muted); }
  .end { display: flex; gap: var(--s-8); margin-inline-start: auto; align-items: center; }
  .flip { display: grid; transform: scaleX(-1); }
  .body { display: grid; grid-template-columns: 1fr 300px; min-height: 0; }
  .side { display: flex; flex-direction: column; gap: var(--s-16); padding: var(--s-16); background: var(--surface); border-inline-start: 1px solid var(--line); overflow-y: auto; }
  .field { display: grid; gap: var(--s-8); font-weight: 600; }
  .field input:not([type]), .field select { min-height: var(--control); padding: 0 var(--s-12); border: 1px solid var(--line); border-radius: var(--r-8); background: var(--paper); font-weight: 400; }
  .field input[type='range'] { accent-color: var(--green); min-height: var(--control); }
  .switch { display: flex; align-items: center; gap: var(--s-8); min-height: var(--control); font-weight: 600; }
  .switch input { width: 20px; height: 20px; accent-color: var(--green); }
  .grow { flex: 1; }
  .state { margin: 0; color: var(--muted); font-size: var(--fs-12); min-height: 18px; }
  .empty { display: grid; place-content: center; justify-items: center; gap: var(--s-12); margin: var(--s-24); border: 2px dashed var(--line); border-radius: var(--r-16); background: var(--paper); color: var(--muted); font-size: var(--fs-16); }
  .empty :global(svg) { width: 48px; height: 48px; color: var(--green); }
  .empty strong { color: var(--ink); font-size: var(--fs-20); }
  .empty:hover { border-color: var(--green); }
  /* section header row in the grid */
  .sec { display: flex; align-items: center; gap: var(--s-8); flex-wrap: wrap; padding: var(--s-12) var(--s-8) var(--s-8); border-top: 1px solid var(--line); margin-top: var(--s-8); }
  .badge { padding: 0 var(--s-8); min-height: 28px; display: inline-flex; align-items: center; border-radius: var(--r-8); background: var(--green); color: var(--on-green); font-weight: 600; font-size: var(--fs-12); }
  .title { min-height: var(--control); min-width: 240px; padding: 0 var(--s-12); border: 1px solid transparent; border-radius: var(--r-8); background: transparent; font-size: var(--fs-18); font-weight: 600; }
  .title:hover, .title:focus { border-color: var(--line); background: var(--surface); }
  .title.auto, li.auto input { background: var(--green-soft); border-color: var(--green); }
  .from { display: inline-flex; align-items: center; gap: var(--s-4); color: var(--green-deep); font-size: var(--fs-12); }
  .btn.on { background: var(--green-soft); border-color: var(--green); color: var(--green-deep); }
  /* contents block: the table of contents as it will read, titles editable */
  /* these are drawings of printed pages: they keep the light Waraq colours in every theme */
  .toc, .paper, .mini, .sw { --ink: #233c36; --muted: #56695f; --line: #e0e7de; --paper: #fafbf8; --green: #15775d; --green-deep: #0f5a46; --green-soft: #eaf3eb; --focus: #15775d; color: var(--ink); }
  .toc { max-width: 640px; margin: 0 0 var(--s-16); padding: var(--s-24); background: #fff; box-shadow: var(--shadow); border-radius: var(--r-8); }
  .toc h2 { margin: 0; font-size: var(--fs-24); }
  .help { margin: var(--s-4) 0 var(--s-16); color: var(--muted); }
  .toc ol { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--s-8); }
  .toc li { display: flex; align-items: center; gap: var(--s-8); }
  .toc li input { flex: 1; min-height: var(--control); padding: 0 var(--s-12); border: 1px solid var(--line); border-radius: var(--r-8); background: var(--paper); }
  .toc li .from span { max-width: 22ch; }
  .pg { min-width: 32px; text-align: end; font-weight: 600; color: var(--green); }
  /* divider page card: what the divider will show, written on directly */
  .dcell { display: grid; justify-items: center; gap: var(--s-8); padding: var(--s-8); }
  .paperbox { position: relative; }
  .paper { position: absolute; left: 50%; top: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--s-4); padding: var(--s-8); background: #fff; box-shadow: var(--shadow); border-top: 4px solid var(--acc); }
  .paper.d-band { border-top: 0; background: linear-gradient(var(--acc) 0 42%, #fff 42%); } .paper.d-band .lbl, .paper.d-band textarea { color: #fff; }
  .paper.d-frame { border-top: 0; box-shadow: var(--shadow), inset 0 0 0 6px #fff, inset 0 0 0 7px var(--acc); }
  .paper.d-side { border-top: 0; border-inline-end: 8px solid var(--acc); }
  .dnum { display: flex; align-items: center; gap: var(--s-8); font-size: var(--fs-14); color: var(--muted); }
  .paper .lbl { font-size: var(--fs-12); color: var(--muted); }
  .paper textarea { width: 100%; resize: none; border: 1px dashed var(--line); border-radius: var(--r-8); text-align: center; font: 700 var(--fs-14)/1.3 var(--font); color: var(--ink); background: transparent; }
  .paper input { width: 100%; min-height: var(--control); border: 1px dashed var(--line); border-radius: var(--r-8); text-align: center; font-size: var(--fs-12); color: var(--muted); background: transparent; }
  .paper .rule { width: 32px; height: 3px; background: var(--green); }
  /* side panel groups */
  .group { display: flex; flex-direction: column; gap: var(--s-12); padding-top: var(--s-16); border-top: 1px solid var(--line); }
  .group h3 { margin: 0; font-size: var(--fs-16); }
  .sub { font-weight: 600; color: var(--muted); font-size: var(--fs-14); }
  .side .help { margin: 0; display: flex; align-items: center; gap: var(--s-8); }
  .btn.big { min-height: 44px; font-size: var(--fs-16); }
  .btn.danger:hover { background: var(--danger); border-color: var(--danger); color: var(--on-green); }
  .trio { display: grid; grid-template-columns: 1fr 1fr auto; gap: var(--s-8); }
  .trio .btn { padding: 0 var(--s-8); }
  .field textarea { padding: var(--s-8) var(--s-12); border: 1px solid var(--line); border-radius: var(--r-8); background: var(--paper); font: inherit; font-weight: 400; resize: vertical; }
  .papers, .designs { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--s-8); }
  .tile { display: grid; justify-items: center; gap: var(--s-4); padding: var(--s-8) var(--s-4); border: 1px solid var(--line); border-radius: var(--r-8); background: var(--surface); font-size: var(--fs-12); font-weight: 600; color: var(--ink); }
  .tile:hover, .tile.on { border-color: var(--green); background: var(--green-soft); }
  .sw { position: relative; width: 34px; height: 46px; background: #fff; border: 1px solid var(--line); overflow: hidden; }
  .sw.paper-lined { background: repeating-linear-gradient(#fff 0 5px, #c9d2c7 5px 6px); }
  .sw.paper-grid { background: linear-gradient(90deg, #d5ddd3 1px, transparent 1px) 0 0 / 5px 5px, linear-gradient(#d5ddd3 1px, #fff 1px) 0 0 / 5px 5px; }
  .sw.paper-dotted { background: radial-gradient(circle, #b8c3b6 0.8px, #fff 1px) 0 0 / 5px 5px; }
  .sw b { position: absolute; left: 25%; right: 25%; top: 45%; height: 3px; background: var(--ink); }
  .sw.d-band { background: linear-gradient(var(--acc) 0 42%, #fff 42%); } .sw.d-band b { background: #fff; top: 28%; }
  .sw.d-frame { box-shadow: inset 0 0 0 3px #fff, inset 0 0 0 4px var(--acc); }
  .sw.d-side { border-inline-end: 6px solid var(--acc); } .sw.d-side b { left: 12%; right: 38%; }
  .logos { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--s-8); }
  .slot { display: flex; align-items: center; gap: var(--s-4); min-height: 44px; }
  .slot .img { flex: 1; height: 40px; display: grid; place-items: center; border: 1px solid var(--line); border-radius: var(--r-8); background: #fff; overflow: hidden; }
  .slot img { max-width: 100%; max-height: 100%; }
  .slot .add { width: 100%; padding: 0 var(--s-4); font-size: var(--fs-12); }
  .seg { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--s-8); }
  .seg button { min-height: var(--control); border: 1px solid var(--line); border-radius: var(--r-8); background: var(--surface); font-weight: 600; color: var(--muted); }
  .seg button.on { background: var(--green-soft); border-color: var(--green); color: var(--ink); }
  /* section header: closed / locked */
  .fold { flex: none; }
  .sec.closed .title { color: var(--muted); }
  .sec.locked .title { background: transparent; }
  .hiddenpages { color: var(--muted); font-size: var(--fs-14); }
  /* cover card */
  .covercard { display: inline-grid; justify-items: center; gap: var(--s-8); margin: 0 0 var(--s-16); }
  .mini { position: relative; width: 210px; height: 297px; display: flex; flex-direction: column; align-items: center; gap: var(--s-4); padding: var(--s-12); background: #fff; box-shadow: var(--shadow); text-align: center; overflow: hidden; }
  .mini .logos { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--s-8); width: 100%; height: 28px; }
  .mini .logos i { display: grid; place-items: center; } .mini .logos img { max-width: 100%; max-height: 28px; }
  .mini strong { margin-top: 64px; font-size: var(--fs-16); line-height: 1.3; }
  .mini small { font-size: var(--fs-12); color: var(--muted); }
  .mini .names { display: grid; margin-top: var(--s-12); font-size: var(--fs-12); }
  .mini .sup { position: absolute; bottom: var(--s-16); left: 0; right: 0; }
  .mini.d-band::before { content: ''; position: absolute; left: 0; right: 0; top: 52px; height: 110px; background: var(--acc); }
  .mini.d-band strong, .mini.d-band small:not(.sup) { position: relative; color: #fff; }
  .mini.d-band .names { position: relative; margin-top: 44px; }
  .mini.d-frame { box-shadow: var(--shadow), inset 0 0 0 10px #fff, inset 0 0 0 12px var(--acc); }
  .mini.d-side { border-inline-end: 10px solid var(--acc); align-items: flex-start; text-align: start; }
  .covercard .num { font-size: var(--fs-14); color: var(--muted); }
  /* the newer designs and the colour choice */
  .sw.d-minimal b { left: 14%; right: 14%; height: 1px; background: var(--acc); top: 40%; }
  .sw.d-split { background: linear-gradient(90deg, #fff 0 58%, var(--acc) 58%); } .sw.d-split b { left: 64%; right: 8%; background: #fff; }
  .sw.d-geometric { background: linear-gradient(225deg, transparent 72%, var(--acc) 72%) no-repeat; } .sw.d-geometric b { background: var(--ink); }
  .sw.d-editorial b { left: 14%; right: 30%; top: 58%; height: 4px; } .sw.d-editorial::before { content: ''; position: absolute; left: 14%; top: 46%; width: 30%; height: 3px; background: var(--acc); }
  .paper.d-minimal { border-top: 0; } .paper.d-minimal .rule { width: 80%; height: 1px; }
  .paper.d-split { border-top: 0; background: linear-gradient(90deg, #fff 0 58%, var(--acc) 58%); }
  .paper.d-geometric { border-top: 0; background: linear-gradient(225deg, #fff 80%, var(--acc) 80%); }
  .paper.d-editorial { border-top: 0; justify-content: flex-end; }
  .mini.d-minimal { align-items: flex-end; text-align: end; } .mini.d-minimal strong { border-bottom: 1px solid var(--acc); padding-bottom: 8px; }
  .mini.d-split { background: linear-gradient(90deg, #fff 0 58%, var(--acc) 58%); align-items: flex-end; text-align: end; } .mini.d-split strong, .mini.d-split small, .mini.d-split .names { position: relative; color: #fff; }
  .mini.d-geometric { background: linear-gradient(225deg, #fff 82%, var(--acc) 82%); }
  .mini.d-editorial { align-items: flex-end; text-align: end; } .mini.d-editorial strong { margin-top: 110px; font-size: var(--fs-20); border-top: 4px solid var(--acc); padding-top: 8px; }
  .colours { display: flex; flex-wrap: wrap; gap: var(--s-8); }
  .dot { position: relative; width: var(--touch); height: var(--touch); border-radius: 50%; border: 2px solid #fff; background: var(--c); box-shadow: 0 0 0 1px var(--line); }
  .dot.on { box-shadow: 0 0 0 2px var(--ink); }
  .dot.own { display: grid; place-items: center; background: conic-gradient(#c33, #cc3, #3c3, #3cc, #33c, #c3c, #c33); cursor: pointer; overflow: hidden; }
  .dot.own input { position: absolute; inset: 0; width: 100%; height: 100%; padding: 0; border: 0; opacity: 0; cursor: pointer; }
  /* drag a section; cover photo */
  .grip { flex: none; display: grid; place-items: center; width: var(--control); height: var(--control); border-radius: var(--r-8); color: var(--muted); cursor: grab; }
  .grip:hover { background: var(--green-soft); color: var(--ink); }
  .sec { position: relative; }
  .sec.dropbefore::before, .sec.dropafter::after { content: ''; position: absolute; left: 0; right: 0; height: 4px; border-radius: 2px; background: var(--green); }
  .sec.dropbefore::before { top: -3px; } .sec.dropafter::after { bottom: -3px; }
  .photo { display: flex; align-items: center; gap: var(--s-8); }
  .photo .img { flex: 1; height: 64px; border: 1px solid var(--line); border-radius: var(--r-8); overflow: hidden; background: #fff; }
  .photo img { width: 100%; height: 100%; object-fit: cover; }
  .photo .add { width: 100%; }
  .seg.two { grid-template-columns: 1fr 1fr; }
  .mini.photo-top { background: linear-gradient(transparent 0 48%, var(--acc) 48% 49.5%, #fff 49.5%), var(--photo) top / 100% 48% no-repeat; border: 0; }
  .mini.photo-top strong { margin-top: 150px; } .mini.photo-top::before { display: none; }
  .mini.photo-full { background: linear-gradient(color-mix(in srgb, var(--acc) 62%, transparent), color-mix(in srgb, var(--acc) 62%, transparent)), var(--photo) center / cover; border: 0; }
  .mini.photo-full strong, .mini.photo-full small, .mini.photo-full .names { position: relative; color: #fff; } .mini.photo-full::before { display: none; }
  @media (max-width: 900px) { .body { grid-template-columns: 1fr; grid-template-rows: 1fr auto; } .side { max-height: 45vh; border-inline-start: 0; border-top: 1px solid var(--line); } }
</style>
