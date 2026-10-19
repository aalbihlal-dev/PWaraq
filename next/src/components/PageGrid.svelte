<script lang="ts">
  // The page grid of Organize and Portfolio (like Acrobat's Organize Pages): click / Ctrl / Shift to select, drag to
  // move every selected page, turn or delete from the page's own buttons, "+" after a page to insert there, files
  // dropped from the computer go where they are dropped. Every change goes to `onchange` (the parent keeps undo).
  import { onMount, type Snippet } from 'svelte';
  import type { SvelteSet } from 'svelte/reactivity';
  import type { EnginePool } from '../lib/engine/pool';
  import { t } from '../lib/i18n.svelte';
  import { icon } from '../lib/icons.js';
  import { move, edit, seen, turned, type Group, type GridItem } from '../lib/pages';

  let { pool, groups, selected, size = 160, number, onchange, oninsert, onfiles, header, lead }: {
    pool: EnginePool; groups: Group[]; selected: SvelteSet<string>; size?: number;
    number: (it: GridItem, flat: number) => string; onchange: (next: Group[]) => void;
    oninsert: (group: string, index: number) => void; onfiles?: (files: File[], group: string, index: number) => void;
    header?: Snippet<[Group, number]>; lead?: Snippet<[Group, number]>;
  } = $props();

  let el: HTMLDivElement;
  const flat = $derived(groups.flatMap((g) => g.items));
  const indexOf = $derived(new Map(flat.map((it, i) => [it.id, i])));
  let anchor = '';

  function pick(e: MouseEvent, it: GridItem) {
    if (e.shiftKey && anchor && indexOf.has(anchor)) {
      const [a, b] = [indexOf.get(anchor)!, indexOf.get(it.id)!].sort((x, y) => x - y);
      if (!(e.ctrlKey || e.metaKey)) selected.clear();
      flat.slice(a, b + 1).forEach((x) => selected.add(x.id));
      return;
    }
    if (e.ctrlKey || e.metaKey) selected.has(it.id) ? selected.delete(it.id) : selected.add(it.id);
    else { selected.clear(); selected.add(it.id); }
    anchor = it.id;
  }
  const only = (it: GridItem) => (selected.has(it.id) ? new Set(selected) : new Set([it.id]));
  const turn = (ids: Set<string>, by: number) => onchange(edit(groups, ids, (x) => ({ ...x, rotate: turned({ rotate: x.rotate + by }) })));
  function remove(ids: Set<string>) { onchange(edit(groups, ids, () => null)); ids.forEach((id) => selected.delete(id)); }

  // drag to move: the green bar shows where the pages will go
  let dragging = false, drop = $state<{ group: string; index: number } | null>(null);
  const rtl = () => document.documentElement.dir === 'rtl';
  function overCell(e: DragEvent, group: string, i: number) {
    e.preventDefault(); e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect(), before = rtl() ? e.clientX > r.left + r.width / 2 : e.clientX < r.left + r.width / 2;
    drop = { group, index: before ? i : i + 1 };
  }
  function overGroup(e: DragEvent, g: Group) { e.preventDefault(); if (!drop || drop.group !== g.id) drop = { group: g.id, index: g.items.length }; }
  function dropped(e: DragEvent) {
    e.preventDefault();
    const at = drop; drop = null;
    if (!at) return;
    if (dragging) onchange(move(groups, new Set(selected), at.group, at.index));
    else if (e.dataTransfer?.files.length) onfiles?.([...e.dataTransfer.files], at.group, at.index);
    dragging = false;
  }

  function keys(e: KeyboardEvent) {
    if ((e.target as HTMLElement).closest('input,textarea,[contenteditable]')) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected.size) { e.preventDefault(); remove(new Set(selected)); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); flat.forEach((x) => selected.add(x.id)); }
    if (e.key === 'Escape') selected.clear();
  }

  // thumbnails: drawn once when they come near the screen, remembered while the grid is open (undo brings pages back)
  const TW = 240, done = new Map<string, ImageBitmap>();
  let io: IntersectionObserver;
  const pending = new Map<Element, GridItem>();
  function paint(c: HTMLCanvasElement, bmp: ImageBitmap) { c.width = bmp.width; c.height = bmp.height; c.getContext('2d')!.drawImage(bmp, 0, 0); }
  function thumb(c: HTMLCanvasElement, it: GridItem) {
    const key = it.doc + ':' + it.page;
    if (it.blank) { c.width = 2; c.height = 2; return; }
    if (done.has(key)) { paint(c, done.get(key)!); return; }
    pending.set(c, it); io?.observe(c);
    return { destroy() { pending.delete(c); io?.unobserve(c); } };
  }
  onMount(() => {
    io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const it = pending.get(e.target); if (!e.isIntersecting || !it) continue;
        io.unobserve(e.target); pending.delete(e.target);
        const key = it.doc + ':' + it.page, c = e.target as HTMLCanvasElement;
        pool.run<ImageBitmap>({ op: 'render', page: it.page, priority: 5, key: 'grid' + key, args: { doc: it.doc, scale: (TW / it.w) * Math.min(devicePixelRatio || 1, 2) } })
          .then((bmp) => { done.set(key, bmp); paint(c, bmp); }).catch(() => { pending.set(c, it); io.observe(c); });
      }
    }, { rootMargin: '600px' });
    pending.forEach((_, c) => io.observe(c));
    return () => { io.disconnect(); done.forEach((b) => b.close()); };
  });

  // each page fits a box of size x 1.3·size, turned pages included
  function box(it: GridItem) {
    const s = seen(it), k = Math.min(size / s.w, (size * 1.3) / s.h);
    return { sheet: `width:${s.w * k}px;height:${s.h * k}px`, canvas: `width:${it.w * k}px;height:${it.h * k}px;transform:translate(-50%,-50%) rotate(${turned(it)}deg)` };
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex (the grid takes keys: Delete, Ctrl+A, Escape) -->
<div class="grid" bind:this={el} tabindex="0" role="listbox" aria-multiselectable="true" aria-label={t('pages')} onkeydown={keys}
  ondragover={(e) => e.preventDefault()} ondrop={dropped} ondragleave={(e) => { if (!el.contains(e.relatedTarget as Node)) drop = null; }}>
  {#each groups as g, gi (g.id)}
    {#if header}{@render header(g, gi)}{/if}
    <div class="cells" role="group" ondragover={(e) => overGroup(e, g)}>
      {#if lead}{@render lead(g, gi)}{/if}
      {#each g.items as it, i (it.id)}
        {@const b = box(it)}
        <div class="cell" class:sel={selected.has(it.id)} class:before={drop?.group === g.id && drop.index === i} class:after={drop?.group === g.id && drop.index === i + 1 && i === g.items.length - 1}
          role="option" aria-selected={selected.has(it.id)} tabindex="-1" draggable="true" data-src="{it.doc}:{it.page}"
          onclick={(e) => pick(e, it)} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(e as unknown as MouseEvent, it); } }}
          ondragstart={(e) => { if (!selected.has(it.id)) { selected.clear(); selected.add(it.id); } dragging = true; e.dataTransfer!.effectAllowed = 'move'; e.dataTransfer!.setData('text/plain', 'waraq-pages'); }}
          ondragover={(e) => overCell(e, g.id, i)} ondragend={() => { dragging = false; drop = null; }}>
          <div class="sheet" style={b.sheet}><canvas use:thumb={it} style={b.canvas}></canvas></div>
          <span class="num">{number(it, indexOf.get(it.id)!)}</span>
          <span class="acts">
            <button class="act" title={t('rotateLeft')} aria-label={t('rotateLeft')} onclick={(e) => { e.stopPropagation(); turn(only(it), -90); }}><span class="flip">{@html icon('rotate')}</span></button>
            <button class="act" title={t('rotateRight')} aria-label={t('rotateRight')} onclick={(e) => { e.stopPropagation(); turn(only(it), 90); }}>{@html icon('rotate')}</button>
            <button class="act" title={t('delete')} aria-label={t('delete')} onclick={(e) => { e.stopPropagation(); remove(only(it)); }}>{@html icon('delete')}</button>
          </span>
          <button class="ins" title={t('insertHere')} aria-label={t('insertHere')} onclick={(e) => { e.stopPropagation(); oninsert(g.id, i + 1); }}>{@html icon('plus')}</button>
        </div>
      {/each}
      {#if !g.items.length}<div class="empty" class:before={drop?.group === g.id}>{t('dropPagesHere')}</div>{/if}
    </div>
  {/each}
</div>

<style>
  .grid { height: 100%; overflow: auto; padding: var(--s-24); background: var(--canvas); outline: none; }
  .cells { display: flex; flex-wrap: wrap; gap: var(--s-24); align-items: flex-end; padding-block: var(--s-8) var(--s-24); }
  .cell { position: relative; display: grid; justify-items: center; gap: var(--s-8); padding: var(--s-8); border: 2px solid transparent; border-radius: var(--r-12); cursor: grab; }
  .cell:hover { background: #ffffff99; }
  .cell.sel { border-color: var(--green); background: var(--green-soft); }
  .sheet { position: relative; background: #fff; box-shadow: var(--shadow); overflow: hidden; }
  .sheet canvas { position: absolute; left: 50%; top: 50%; background: #fff; }
  .num { font-size: var(--fs-14); color: var(--muted); font-variant-numeric: tabular-nums; }
  .cell.sel .num { color: var(--ink); font-weight: 600; }
  .acts { position: absolute; top: var(--s-12); inset-inline: 0; display: none; justify-content: center; gap: var(--s-8); }
  .cell:hover .acts, .cell:focus-within .acts { display: flex; }
  .act { width: var(--control); height: var(--control); display: grid; place-items: center; border: 1px solid var(--line); border-radius: var(--r-8); background: var(--surface); color: var(--ink); box-shadow: var(--shadow); }
  .act:hover { border-color: var(--green); color: var(--green); }
  .flip { display: grid; transform: scaleX(-1); }
  .ins { position: absolute; top: 40%; inset-inline-end: calc(-1 * var(--s-24) / 2 - 18px); z-index: 1; width: var(--control); height: var(--control); display: none; place-items: center; border: 0; border-radius: 50%; background: var(--green); color: #fff; box-shadow: var(--shadow); }
  .cell:hover .ins { display: grid; }
  .cell.before::before, .cell.after::after, .empty.before::before { content: ''; position: absolute; top: 0; bottom: 0; width: 4px; border-radius: 2px; background: var(--green); }
  .cell.before::before, .empty.before::before { inset-inline-start: calc(-1 * var(--s-24) / 2 - 2px); }
  .cell.after::after { inset-inline-end: calc(-1 * var(--s-24) / 2 - 2px); }
  .empty { position: relative; display: grid; place-items: center; min-width: 240px; min-height: 120px; padding: var(--s-16); border: 2px dashed var(--line); border-radius: var(--r-12); color: var(--muted); }
</style>
