<script lang="ts">
  // The Portfolio screen: sections in the page grid (each with its title, optional divider page and pages), the
  // table of contents above them (the titles can be edited right there), options on the right. Every change is kept
  // on this device at once; "Export PDF" builds the combined file, "Save .waraq" a portable copy of the portfolio.
  import { onDestroy } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import type { EnginePool } from '../lib/engine/pool';
  import { i18n, t, toggleLanguage } from '../lib/i18n.svelte';
  import { icon } from '../lib/icons.js';
  import { addFiles, uid, seen, type Group, type GridItem } from '../lib/pages';
  import { build, plan, manifest, used, fileTitle, type Portfolio, type Section } from '../lib/portfolio';
  import { pickFiles, saveFile, writePortfolio, readPortfolio, remember } from '../lib/store';
  import { zip } from '../lib/zip';
  import PageGrid from './PageGrid.svelte';

  let { pool, portfolio, onClose }: { pool: EnginePool; portfolio: Portfolio; onClose: () => void } = $props();
  // svelte-ignore state_referenced_locally (one screen per opened portfolio)
  let p = $state(portfolio);
  const selected = new SvelteSet<string>();
  let size = $state(140), busy = $state(''), savedAt = $state(0);
  const layout = $derived(plan(p));
  const groups = $derived<Group[]>(p.sections.map((s) => ({ id: s.id, items: s.items })));

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
      await remember({ key: 'portfolio:' + id, kind: 'portfolio', name, pages });
    };
    clearTimeout(timer); timer = setTimeout(flush, 500);
  });
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
  const removeSection = (i: number) => change((p) => { if (p.options.numbers === p.sections[i].id) p.options.numbers = 'all'; p.sections.splice(i, 1); });
  const gridChange = (next: Group[]) => change((p) => { for (const g of next) p.sections.find((s) => s.id === g.id)!.items = g.items; });

  async function exportPdf() {
    busy = t('applying');
    try { await saveFile(await pool.build(build(p, { contents: t('contents'), section: t('section'), rtl: i18n.lang === 'ar' })), p.name + '.pdf'); }
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

  // the divider card has the shape of the section's first page
  function paper(s: Section) {
    const first = s.items.find((it) => !it.image && !it.blank), d = first ? seen(first) : { w: 595, h: 842 }, k = Math.min(size / d.w, (size * 1.3) / d.h);
    return `width:${d.w * k}px;height:${d.h * k}px`;
  }
  const label = (it: GridItem) => String((layout.at.get(it.id) ?? 0) + 1);
  function keys(e: KeyboardEvent) {
    if (!(e.ctrlKey || e.metaKey) || (e.target as HTMLElement).closest('input,textarea')) return;
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
      <button class="btn" onclick={async () => { await flush(); onClose(); }}>{@html icon('close')}{t('close')}</button>
      <button class="btn icon" onclick={toggleLanguage} title={t('language')} aria-label={t('language')}>{@html icon('language')}</button>
    </span>
  </header>

  <div class="body">
    {#if p.sections.length}
      <PageGrid {pool} {groups} {selected} {size} number={label} onchange={gridChange} oninsert={addPages}
        onfiles={(files, section, index) => run(() => insertPages(files, section, index))}>
        {#snippet header(g, gi)}
          {@const s = p.sections[gi]}
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
          <div class="sec">
            <span class="badge num">{t('section')} {gi + 1}</span>
            <input class="title" class:auto={s.fromFile} bind:value={s.title} oninput={() => (s.fromFile = false)} aria-label={t('sectionTitle')} />
            {#if s.fromFile}<span class="from" title={t('fromFileName')}>{@html icon('info')}</span>{/if}
            <span class="end">
              <button class="btn" class:on={s.divider} aria-pressed={s.divider} onclick={() => change(() => (s.divider = !s.divider))}>{@html icon('bookmarks')}{t('divider')}</button>
              <button class="btn" onclick={() => addPages(s.id, s.items.length)} disabled={!!busy}>{@html icon('images')}{t('addPages')}</button>
              {#if s.file}<button class="btn" onclick={() => replace(s)} disabled={!!busy}>{@html icon('reverse')}{t('replace')}</button>{/if}
              <button class="btn icon" onclick={() => shift(gi, -1)} disabled={gi === 0} title={t('moveUp')} aria-label={t('moveUp')}>{@html icon('chevron-up')}</button>
              <button class="btn icon" onclick={() => shift(gi, 1)} disabled={gi === p.sections.length - 1} title={t('moveDown')} aria-label={t('moveDown')}>{@html icon('chevron-down')}</button>
              <button class="btn icon" onclick={() => removeSection(gi)} title={t('deleteSection')} aria-label={t('deleteSection')}>{@html icon('delete')}</button>
            </span>
          </div>
        {/snippet}
        {#snippet lead(g, gi)}
          {@const s = p.sections[gi]}
          {#if s.divider}
            <div class="dcell">
              <div class="paper" style={paper(s)}>
                <span class="lbl">{t('section')} {gi + 1}</span>
                <textarea rows="3" bind:value={s.title} oninput={() => (s.fromFile = false)} aria-label={t('sectionTitle')}></textarea>
                <i class="rule"></i>
                <input bind:value={s.note} placeholder={t('dividerNote')} aria-label={t('dividerNote')} />
              </div>
              <span class="num">{(layout.target.get(s.id) ?? 0) + 1}</span>
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
      <label class="switch"><input type="checkbox" bind:checked={p.options.toc} />{t('tocSwitch')}</label>
      <button class="btn" onclick={() => change((p) => p.sections.forEach((s) => (s.divider = true)))} disabled={!p.sections.length}>{@html icon('bookmarks')}{t('allDividers')}</button>
      <label class="field"><span>{t('numbers')}</span>
        <select bind:value={p.options.numbers}>
          <option value="none">{t('numbersNone')}</option>
          <option value="all">{t('numbersAll')}</option>
          {#each p.sections as s (s.id)}<option value={s.id}>{t('numbersOnly')}: {s.title}</option>{/each}
        </select>
      </label>
      <label class="switch"><input type="checkbox" bind:checked={p.options.bookmarks} />{t('bookmarks')}</label>
      <label class="field"><span>{t('thumbSize')}</span><input type="range" min="96" max="240" step="8" bind:value={size} /></label>
      <span class="grow"></span>
      <p class="state num" aria-live="polite">{busy || (savedAt ? `${t('saved')} Â· ${layout.slots.length} ${t('pagesCount')}` : '')}</p>
      <button class="btn primary" onclick={exportPdf} disabled={!!busy || !layout.slots.length}>{@html icon('download')}{t('exportPdf')}</button>
      <button class="btn" onclick={saveCopy} disabled={!!busy}>{@html icon('library')}{t('saveWaraq')}</button>
    </aside>
  </div>
</div>

<style>
  .pf { height: 100%; display: grid; grid-template-rows: auto 1fr; }
  .bar { display: flex; align-items: center; gap: var(--s-12); padding: var(--s-8) var(--s-16); background: var(--surface); border-bottom: 1px solid var(--line); min-width: 0; }
  .chip { display: inline-flex; align-items: center; gap: var(--s-8); padding: 0 var(--s-12); min-height: 28px; border-radius: 14px; background: var(--green-soft); color: var(--green-deep); font-weight: 600; font-size: var(--fs-12); }
  .name { max-width: 28ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .end { display: flex; gap: var(--s-8); margin-inline-start: auto; align-items: center; }
  .flip { display: grid; transform: scaleX(-1); }
  .body { display: grid; grid-template-columns: 1fr 300px; min-height: 0; }
  .side { display: flex; flex-direction: column; gap: var(--s-16); padding: var(--s-16); background: var(--surface); border-inline-start: 1px solid var(--line); overflow-y: auto; }
  .field { display: grid; gap: var(--s-8); font-weight: 600; }
  .field input:not([type]), .field select { min-height: var(--control); padding: 0 var(--s-12); border: 1px solid var(--line); border-radius: var(--r-8); background: var(--paper); font-weight: 400; }
  .field input[type='range'] { accent-color: var(--green); }
  .switch { display: flex; align-items: center; gap: var(--s-8); min-height: var(--control); font-weight: 600; }
  .switch input { width: 20px; height: 20px; accent-color: var(--green); }
  .grow { flex: 1; }
  .state { margin: 0; color: var(--muted); font-size: var(--fs-12); min-height: 18px; }
  .empty { display: grid; place-content: center; justify-items: center; gap: var(--s-12); margin: var(--s-24); border: 2px dashed var(--line); border-radius: var(--r-16); background: var(--paper); color: var(--muted); font-size: var(--fs-16); }
  .empty :global(svg) { width: 48px; height: 48px; color: var(--green); }
  .empty strong { color: var(--ink); font-size: var(--fs-20); }
  .empty:hover { border-color: var(--green); }
  /* section header row in the grid */
  .sec { display: flex; align-items: center; gap: var(--s-8); flex-wrap: wrap; padding: var(--s-12) 0 var(--s-8); border-top: 1px solid var(--line); margin-top: var(--s-8); }
  .badge { padding: 0 var(--s-8); min-height: 28px; display: inline-flex; align-items: center; border-radius: var(--r-8); background: var(--green); color: #fff; font-weight: 600; font-size: var(--fs-12); }
  .title { min-height: var(--control); min-width: 240px; padding: 0 var(--s-12); border: 1px solid transparent; border-radius: var(--r-8); background: transparent; font-size: var(--fs-18); font-weight: 600; }
  .title:hover, .title:focus { border-color: var(--line); background: var(--surface); }
  .title.auto, li.auto input { background: var(--green-soft); border-color: var(--green); }
  .from { display: inline-flex; align-items: center; gap: var(--s-4); color: var(--green-deep); font-size: var(--fs-12); }
  .btn.on { background: var(--green-soft); border-color: var(--green); color: var(--green-deep); }
  /* contents block: the table of contents as it will read, titles editable */
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
  .paper { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--s-4); padding: var(--s-8); background: #fff; box-shadow: var(--shadow); border-top: 4px solid var(--green); }
  .paper .lbl { font-size: var(--fs-12); color: var(--muted); }
  .paper textarea { width: 100%; resize: none; border: 1px dashed var(--line); border-radius: var(--r-8); text-align: center; font: 700 var(--fs-14)/1.3 var(--font); color: var(--ink); background: transparent; }
  .paper input { width: 100%; min-height: var(--control); border: 1px dashed var(--line); border-radius: var(--r-8); text-align: center; font-size: var(--fs-12); color: var(--muted); background: transparent; }
  .paper .rule { width: 32px; height: 3px; background: var(--green); }
  .dcell .num { font-size: var(--fs-14); color: var(--muted); }
  @media (max-width: 900px) { .body { grid-template-columns: 1fr; grid-template-rows: 1fr auto; } .side { max-height: 45vh; border-inline-start: 0; border-top: 1px solid var(--line); } }
</style>
