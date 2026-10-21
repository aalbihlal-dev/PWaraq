<script lang="ts">
  // Organize (like Acrobat's Organize Pages): the whole window is the page grid; the bar above inserts files or a
  // blank page, extracts, turns, deletes, undoes. Changes are applied to the document when leaving Organize or saving
  // (the Save button in the top bar).
  import { SvelteSet } from 'svelte/reactivity';
  import type { EnginePool } from '../lib/engine/pool';
  import { t } from '../lib/i18n.svelte';
  import { icon } from '../lib/icons.js';
  import { uid, edit, turned, toItems, addFiles, seen, type Group, type GridItem } from '../lib/pages';
  import { pickFiles, saveFile } from '../lib/store';
  import PageGrid from './PageGrid.svelte';
  import PageEditor, { type Saved } from './PageEditor.svelte';
  import CropPanel from './CropPanel.svelte';
  import { zip } from '../lib/zip';
  import { addUnique } from '../lib/names';

  let { pool, sizes, name, changed = $bindable(false) }: { pool: EnginePool; sizes: { w: number; h: number }[]; name: string; changed?: boolean } = $props();

  // svelte-ignore state_referenced_locally (one Organize per opened document)
  let groups = $state<Group[]>([{ id: 'doc', items: sizes.map((s, page) => ({ id: uid(), doc: 0, page, rotate: 0, w: s.w, h: s.h })) }]);
  const selected = new SvelteSet<string>();
  let size = $state(160), busy = $state(false);
  let past: Group[][] = [], future: Group[][] = [];
  let canUndo = $state(false), canRedo = $state(false);
  function change(next: Group[]) {
    past.push($state.snapshot(groups)); future = []; groups = next; changed = true;
    canUndo = true; canRedo = false;
  }
  function undo() { if (!past.length) return; future.push($state.snapshot(groups)); groups = past.pop()!; canUndo = !!past.length; canRedo = true; changed = true; }
  function redo() { if (!future.length) return; past.push($state.snapshot(groups)); groups = future.pop()!; canRedo = !!future.length; canUndo = true; }

  const items = () => groups[0].items;
  const sel = () => new Set(selected);
  // new pages go after the last selected page, or at the end
  const insertIndex = () => { const i = items().findLastIndex((it) => selected.has(it.id)); return i < 0 ? items().length : i + 1; };

  let picker: HTMLInputElement, insertAt = 0;
  async function insert(at = insertIndex()) {
    insertAt = at;
    const picked = await pickFiles({ multiple: true, accept: { 'application/pdf': ['.pdf'], 'image/*': ['.png', '.jpg', '.jpeg'] }, fallback: () => picker.click() });
    if (picked.length) await insertFiles(picked.map((p) => p.file), at);
  }
  async function insertFiles(files: File[], at: number) {
    busy = true;
    try {
      const added = (await addFiles(pool, files)).flatMap((a) => a.items);
      const list = items();
      change([{ ...groups[0], items: [...list.slice(0, at), ...added, ...list.slice(at)] }]);
      selected.clear(); added.forEach((it) => selected.add(it.id));
    } catch { alert(t('notPdf')); }
    busy = false;
  }
  function blank() {
    const at = insertIndex(), list = items(), near = list[at - 1] ?? list[at];
    const s = near ? seen(near) : { w: 595, h: 842 }; // A4 when there is nothing to match
    const page: GridItem = { id: uid(), doc: -1, page: 0, rotate: 0, w: s.w, h: s.h, blank: true };
    change([{ ...groups[0], items: [...list.slice(0, at), page, ...list.slice(at)] }]);
    selected.clear(); selected.add(page.id);
  }
  const turn = (by: number) => change(edit(groups, sel(), (x) => ({ ...x, rotate: turned({ rotate: x.rotate + by }) })));
  function remove() { change(edit(groups, sel(), () => null)); selected.clear(); }

  /** The document as arranged now (bytes), for View and Save. */
  export const build = () => pool.build({ items: toItems(items()) });
  async function extract() {
    busy = true;
    try {
      const chosen = items().filter((it) => selected.has(it.id)), first = items().indexOf(chosen[0]) + 1;
      const bytes = await pool.keep(await pool.build({ items: toItems(chosen) }));
      await saveFile(bytes, name.replace(/\.pdf$/i, '') + ` (${t('pages')} ${first}-${first + chosen.length - 1}).pdf`);
    } finally { busy = false; }
  }

  // side panels: Split (into several files, saved together as one ZIP) and Crop
  let panel = $state<'split' | 'crop' | null>(null), splitBy = $state<'every' | 'selected' | 'each'>('every'), every = $state(1);
  const parts = $derived.by(() => {
    const list = groups[0].items;
    if (splitBy === 'each') return list.map((x) => [x]);
    if (splitBy === 'every') { const n = Math.max(1, Math.floor(every) || 1), out: GridItem[][] = []; for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n)); return out; }
    const out: GridItem[][] = [[]]; // a new file starts at each selected page
    list.forEach((it, i) => { if (i && selected.has(it.id)) out.push([]); out.at(-1)!.push(it); });
    return out;
  });
  async function split() {
    busy = true;
    try {
      const base = name.replace(/\.pdf$/i, ''), files: Record<string, Uint8Array> = {};
      let at = 1;
      for (const [n, part] of parts.entries()) {
        addUnique(files, `${base} (${n + 1}) ${t('pages')} ${at}-${at + part.length - 1}.pdf`, await pool.keep(await pool.build({ items: toItems(part) })));
        at += part.length;
      }
      await saveFile(zip(files), `${base} (${t('split')}).zip`, 'application/zip');
    } finally { busy = false; }
  }
  const cropTarget = $derived(items().find((it) => selected.has(it.id)) ?? items()[0]);
  function cropped(crop: number[] | undefined, all: boolean) {
    change(edit(groups, all ? new Set(items().map((x) => x.id)) : selected.size ? sel() : new Set([cropTarget.id]), (x) => ({ ...x, crop })));
  }

  // the page editor on one page; its saved page takes the old one's place (one undo step)
  let editing = $state<GridItem | null>(null);
  const editBase = (it: GridItem) => toItems(items())[items().findIndex((x) => x.id === it.id)];
  function edited(r: Saved) {
    const id = editing!.id;
    change(edit(groups, new Set([id]), (x) => ({ ...x, doc: r.doc, page: 0, rotate: 0, w: r.w, h: r.h, image: false, blank: false })));
    editing = null;
  }

  function keys(e: KeyboardEvent) {
    if (editing || !(e.ctrlKey || e.metaKey) || (e.target as HTMLElement).closest('input')) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
  }
</script>

<svelte:window onkeydown={keys} />
<input bind:this={picker} type="file" multiple accept="application/pdf,.pdf,image/png,image/jpeg" hidden
  onchange={(e) => { const f = [...(e.currentTarget.files ?? [])]; e.currentTarget.value = ''; if (f.length) insertFiles(f, insertAt); }} />
{#if editing}
  <PageEditor {pool} base={editBase(editing)} label="{t('page')} {items().findIndex((x) => x.id === editing!.id) + 1}" onSave={edited} onCancel={() => (editing = null)} />
{:else}
<div class="org">
  <div class="tools" role="toolbar" aria-label={t('organize')}>
    <button class="btn" onclick={() => insert()} disabled={busy}>{@html icon('plus')}{t('insertFile')}</button>
    <button class="btn" onclick={blank} disabled={busy}>{@html icon('blank')}{t('blankPage')}</button>
    <span class="sep"></span>
    <button class="btn" onclick={extract} disabled={busy || !selected.size}>{@html icon('extract')}{t('extract')}</button>
    <button class="btn" class:on={panel === 'split'} aria-pressed={panel === 'split'} onclick={() => (panel = panel === 'split' ? null : 'split')} disabled={busy}>{@html icon('split')}{t('split')}</button>
    <button class="btn" class:on={panel === 'crop'} aria-pressed={panel === 'crop'} onclick={() => (panel = panel === 'crop' ? null : 'crop')} disabled={busy || !items().length}>{@html icon('crop')}{t('crop')}</button>
    <button class="btn icon" onclick={() => turn(-90)} disabled={!selected.size} title={t('rotateLeft')} aria-label={t('rotateLeft')}><span class="flip">{@html icon('rotate')}</span></button>
    <button class="btn icon" onclick={() => turn(90)} disabled={!selected.size} title={t('rotateRight')} aria-label={t('rotateRight')}>{@html icon('rotate')}</button>
    <button class="btn icon" onclick={remove} disabled={!selected.size} title={t('delete')} aria-label={t('delete')}>{@html icon('delete')}</button>
    <button class="btn" onclick={() => (editing = items().find((it) => selected.has(it.id)) ?? null)} disabled={selected.size !== 1}>{@html icon('edit')}{t('editPage')}</button>
    <span class="sep"></span>
    <button class="btn icon" onclick={undo} disabled={!canUndo} title={t('undo')} aria-label={t('undo')}>{@html icon('undo')}</button>
    <button class="btn icon" onclick={redo} disabled={!canRedo} title={t('redo')} aria-label={t('redo')}><span class="flip">{@html icon('undo')}</span></button>
    <span class="count num" aria-live="polite">{selected.size ? `${selected.size} ${t('selected')}` : `${items().length} ${t('pagesCount')}`}</span>
    <label class="zoom"><span class="sr">{t('thumbSize')}</span>{@html icon('zoom')}<input type="range" min="96" max="280" step="8" bind:value={size} aria-label={t('thumbSize')} /></label>
  </div>
  <div class="main" class:withpanel={!!panel}>
    <PageGrid {pool} {groups} {selected} {size} number={(_, n) => String(n + 1)} onchange={change} oninsert={(_, i) => insert(i)}
      onfiles={(files, _, i) => insertFiles(files, i)} onopen={(it) => (editing = it)} />
    {#if panel === 'crop' && cropTarget}
      {#key cropTarget.id}<CropPanel {pool} item={cropTarget} count={selected.size || 1} onApply={cropped} onClose={() => (panel = null)} />{/key}
    {:else if panel === 'split'}
      <aside class="panel" aria-label={t('split')}>
        <div class="head"><h2>{t('split')}</h2><button class="btn icon" onclick={() => (panel = null)} title={t('close')} aria-label={t('close')}>{@html icon('close')}</button></div>
        <label class="choice"><input type="radio" bind:group={splitBy} value="every" />{t('splitEvery')}
          <input class="n num" type="number" min="1" max={items().length} bind:value={every} aria-label={t('splitEvery')} onfocus={() => (splitBy = 'every')} />{t('pagesCount')}</label>
        <label class="choice"><input type="radio" bind:group={splitBy} value="selected" />{t('splitSelected')}</label>
        <label class="choice"><input type="radio" bind:group={splitBy} value="each" />{t('splitEach')}</label>
        <p class="help num">{parts.length} {t('files')} · {t('splitZip')}</p>
        <button class="btn primary" onclick={split} disabled={busy || parts.length < 2}>{@html icon('split')}{t('splitSave')}</button>
      </aside>
    {/if}
  </div>
</div>
{/if}

<style>
  .org { height: 100%; display: grid; grid-template-rows: auto 1fr; min-height: 0; }
  .main { display: grid; grid-template-columns: 1fr; min-height: 0; }
  .main.withpanel { grid-template-columns: 1fr auto; }
  .btn.on { background: var(--green-soft); border-color: var(--green); }
  .panel { width: 320px; display: flex; flex-direction: column; gap: var(--s-12); padding: var(--s-16); background: var(--surface); border-inline-start: 1px solid var(--line); overflow-y: auto; }
  .head { display: flex; align-items: center; justify-content: space-between; }
  .panel h2 { margin: 0; font-size: var(--fs-18); }
  .help { margin: 0; color: var(--muted); }
  .choice { display: flex; align-items: center; gap: var(--s-8); min-height: var(--control); }
  .choice input[type='radio'] { flex: none; width: 20px; height: 20px; accent-color: var(--green); }
  .choice .n { width: 64px; min-height: var(--control); padding: 0 var(--s-8); border: 1px solid var(--line); border-radius: var(--r-8); background: var(--paper); }
  .tools { display: flex; align-items: center; gap: var(--s-8); padding: var(--s-8) var(--s-16); background: var(--surface); border-bottom: 1px solid var(--line); flex-wrap: wrap; }
  .sep { width: 1px; height: 24px; background: var(--line); }
  .flip { display: grid; transform: scaleX(-1); }
  .count { margin-inline-start: auto; color: var(--muted); }
  .zoom { display: flex; align-items: center; gap: var(--s-8); color: var(--muted); }
  .zoom input { width: 120px; min-height: var(--control); accent-color: var(--green); }
</style>
