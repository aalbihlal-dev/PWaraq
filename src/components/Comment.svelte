<script lang="ts">
  // Comment: highlight, underline, strike-through, pen, shapes, arrow, text box and sticky note, written into the file as
  // standard PDF annotations (Acrobat and other readers show and edit them). The pages are drawn without the comments; the
  // comments are edited as a list and drawn on top. Changes are written when leaving the task or saving (build), like Organize.
  import { onMount, tick } from 'svelte';
  import type { EnginePool } from '../lib/engine/pool';
  import { remap, type Annot, type Kind, type Rect } from '../lib/engine/annots';
  import { t, type Key } from '../lib/i18n.svelte';
  import { icon } from '../lib/icons.js';
  import { lazyPage } from '../lib/lazy';

  let { pool, sizes, bytes, changed = $bindable(false) }: { pool: EnginePool; sizes: { w: number; h: number }[]; bytes: Uint8Array; changed?: boolean } = $props();
  const W = 720, k = (i: number) => W / sizes[i].w;
  type Tool = 'select' | Kind;
  const TOOLS: [Tool, Key][] = [['select', 'cSelect'], ['highlight', 'cHighlight'], ['underline', 'cUnderline'], ['strike', 'cStrike'], ['ink', 'cPen'], ['square', 'cRect'], ['circle', 'cEllipse'], ['line', 'cLine'], ['arrow', 'cArrow'], ['text', 'cText'], ['note', 'cNote']];
  const COLORS: [string, Key][] = [['#f5c518', 'cYellow'], ['#d93a3a', 'cRed'], ['#15775d', 'cGreen'], ['#2f6fd6', 'cBlue'], ['#ee8a1c', 'cOrange'], ['#233c36', 'cDark']];
  const STICKY: Tool[] = ['highlight', 'underline', 'strike', 'ink']; // these stay active after a comment; the others go back to Select
  const FIRST: Partial<Record<Tool, string>> = { highlight: '#f5c518', note: '#f5c518', text: '#233c36' };

  let items = $state<Annot[]>([]), doc = $state(-1), error = $state(''), tool = $state<Tool>('select'), color = $state('#f5c518'), selected = $state('');
  let past = $state<Annot[][]>([]), future = $state<Annot[][]>([]), draft = $state<Annot | null>(null);
  let orig: Annot[] = [], seq = 0, picked = false, noteBox = $state<HTMLTextAreaElement>(), before: Annot[] | null = null;
  const sel = $derived(items.find((a) => a.id === selected));
  const src = (a: Annot) => ({ page: a.page, src: Number(a.id.split(':')[1]) });
  const snap = () => $state.snapshot(items) as Annot[];

  onMount(async () => {
    try {
      orig = await pool.tool<Annot[]>('annotlist', { bytes: bytes.slice() });
      items = structuredClone(orig);
      // the pages are drawn from a copy without these comments (they are drawn here, where they can be moved)
      doc = (await pool.add(await pool.tool('annotapply', { bytes: bytes.slice(), remove: orig.map(src), add: [] }))).id;
    } catch { error = t('toolFailed'); }
  });

  /** The file with the changes written (what leaving the task or saving applies). */
  export async function build() {
    const now = new Map(items.map((a) => [a.id, a])), was = new Map(orig.map((a) => [a.id, a])), same = (a: Annot, b: Annot) => JSON.stringify(a) === JSON.stringify(b);
    const remove = orig.filter((o) => !same(o, now.get(o.id) ?? ({} as Annot))).map(src);
    const add = items.filter((a) => !was.has(a.id) || !same(a, was.get(a.id)!)).map((a) => $state.snapshot(a));
    return remove.length || add.length ? pool.tool<Uint8Array>('annotapply', { bytes: bytes.slice(), remove, add }) : bytes;
  }

  // ---- undo: one step per action (a snapshot of the list before it)
  function record(prev: Annot[]) { past.push(prev); future = []; changed = true; }
  function edit(fn: () => void) { const prev = snap(); fn(); record(prev); }
  function undo() { if (!past.length) return; future.push(snap()); items = past.pop()!; changed = true; }
  function redo() { if (!future.length) return; past.push(snap()); items = future.pop()!; changed = true; }
  const remove = () => { if (sel) { const id = sel.id; edit(() => { items = items.filter((a) => a.id !== id); }); selected = ''; } };

  function choose(next: Tool) {
    tool = next; selected = '';
    if (!picked && FIRST[next]) color = FIRST[next]!; else if (!picked && next !== 'select') color = '#d93a3a';
  }
  function pick(c: string) { color = c; picked = true; if (sel) edit(() => { sel.color = c; }); }

  // ---- drawing, moving and resizing with the pointer. Points are in PDF points from the page's top left.
  type Gesture = { page: number; kind: 'move' | 'resize' | 'draw'; box: DOMRect; start: number[]; orig?: Annot; handle?: number; moved?: boolean };
  let g: Gesture | null = null;
  const hold = (id: string) => items.find((a) => a.id === id)!;
  const pt = (e: PointerEvent, gg: Gesture) => [(e.clientX - gg.box.left) / k(gg.page), (e.clientY - gg.box.top) / k(gg.page)];
  const norm = (a: number[], b: number[]): Rect => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
  const movable = (a: Annot) => !a.quads; // text marks stay on their text

  function down(e: PointerEvent, page: number) {
    if (e.button !== 0) return;
    const layer = e.currentTarget as HTMLElement, el = e.target as Element, id = el.closest('[data-id]')?.getAttribute('data-id'), handle = el.closest('[data-h]')?.getAttribute('data-h');
    g = { page, kind: 'draw', box: layer.getBoundingClientRect(), start: [] };
    g.start = pt(e, g);
    layer.setPointerCapture(e.pointerId);
    if (tool === 'select') {
      if (handle != null && sel) { g.kind = 'resize'; g.handle = Number(handle); g.orig = $state.snapshot(sel) as Annot; before = snap(); return; }
      selected = id ?? '';
      if (id && movable(hold(id))) { g.kind = 'move'; g.orig = $state.snapshot(hold(id)) as Annot; before = snap(); } else g = null;
      return;
    }
    selected = '';
    if (tool === 'note') { add({ kind: 'note', rect: [g.start[0], g.start[1], g.start[0] + 20, g.start[1] + 20] }); g = null; return; }
    const base = { id: '', page, color, note: '' };
    if (tool === 'ink') draft = { ...base, kind: 'ink', rect: [...g.start, ...g.start] as Rect, strokes: [[g.start]] };
    else if (!['highlight', 'underline', 'strike'].includes(tool)) draft = { ...base, kind: tool as Kind, rect: [...g.start, ...g.start] as Rect, line: ['line', 'arrow'].includes(tool) ? [...g.start, ...g.start] : undefined };
  }

  let marking = false;
  async function mark(gg: Gesture, p: number[], last: boolean) {
    if (marking && !last) return; // one text lookup at a time while dragging
    marking = true;
    try {
      const quads: number[][] = await pool.run({ op: 'hilite', page: gg.page, priority: 0, key: last ? undefined : 'hilite', args: { doc, a: gg.start, b: p } });
      if (last) return quads;
      draft = quads.length ? { id: '', page: gg.page, kind: tool as Kind, color, note: '', rect: [0, 0, 0, 0], quads } : null;
    } catch {} finally { marking = false; }
  }

  function move(e: PointerEvent) {
    if (!g) return;
    const p = pt(e, g);
    if (g.kind === 'move') {
      const dx = p[0] - g.start[0], dy = p[1] - g.start[1], [x0, y0, x1, y1] = g.orig!.rect;
      g.moved ||= Math.hypot(dx, dy) > 0.5;
      items = items.map((a) => (a.id === g!.orig!.id ? remap(g!.orig!, [x0 + dx, y0 + dy, x1 + dx, y1 + dy]) : a));
    } else if (g.kind === 'resize') {
      const [x0, y0, x1, y1] = g.orig!.rect, corner = [[x1, y1], [x0, y1], [x1, y0], [x0, y0]][g.handle!]; // handles: top-left, top-right, bottom-left, bottom-right
      const r = norm(corner, p); if (r[2] - r[0] < 6) r[2] = r[0] + 6; if (r[3] - r[1] < 6) r[3] = r[1] + 6;
      g.moved = true;
      items = items.map((a) => (a.id === g!.orig!.id ? remap(g!.orig!, r) : a));
    } else if (['highlight', 'underline', 'strike'].includes(tool)) mark(g, p, false);
    else if (draft?.strokes) { const s = draft.strokes[0], l = s[s.length - 1]; if (Math.hypot(p[0] - l[0], p[1] - l[1]) > 0.5) { s.push(p); draft.rect = bounds(s); } }
    else if (draft) {
      draft.rect = norm(g.start, p);
      if (draft.line) draft.line = [...g.start, ...p];
    }
  }
  const bounds = (s: number[][]): Rect => { const xs = s.map((p) => p[0]), ys = s.map((p) => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };

  async function up(e: PointerEvent) {
    const gg = g; g = null;
    if (!gg) return;
    if (gg.kind !== 'draw') { if (gg.moved && before) record(before); before = null; return; }
    const p = pt(e, gg), d = draft; draft = null;
    if (['highlight', 'underline', 'strike'].includes(tool)) {
      const quads = await mark(gg, p, true);
      if (quads?.length) add({ kind: tool as Kind, page: gg.page, quads, rect: bounds(quads.flatMap((q) => [[q[0], q[1]], [q[6], q[7]]])) });
    } else if (d?.strokes) {
      if (d.strokes[0].length > 1) add({ kind: 'ink', page: gg.page, strokes: d.strokes, rect: d.rect });
    } else if (tool === 'text' && d) {
      add({ kind: 'text', page: gg.page, rect: Math.hypot(p[0] - gg.start[0], p[1] - gg.start[1]) > 8 ? d.rect : [gg.start[0], gg.start[1], gg.start[0] + 160, gg.start[1] + 36] });
    } else if (d && Math.hypot(p[0] - gg.start[0], p[1] - gg.start[1]) > 4) add({ kind: d.kind, page: gg.page, rect: d.rect, line: d.line });
  }

  async function add(a: Partial<Annot> & { kind: Kind; rect: Rect }) {
    const item: Annot = { id: 'n' + ++seq, page: g?.page ?? a.page ?? 0, color, note: a.kind === 'text' ? t('cDefaultText') : '', ...a };
    edit(() => { items.push(item); });
    selected = item.id;
    if (!STICKY.includes(tool)) tool = 'select';
    if (a.kind === 'text' || a.kind === 'note') { await tick(); noteBox?.focus(); noteBox?.select(); }
  }

  function keys(e: KeyboardEvent) {
    const typing = (e.target as HTMLElement).closest('input,textarea');
    const mod = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
    if (mod && key === 'z' && !e.shiftKey && !typing) { e.preventDefault(); undo(); }
    else if (mod && (key === 'y' || (key === 'z' && e.shiftKey)) && !typing) { e.preventDefault(); redo(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && !typing && selected) { e.preventDefault(); remove(); }
    else if (e.key === 'Escape') { tool = 'select'; selected = ''; }
  }

  const arrowHead = (l: number[]) => {
    const a = Math.atan2(l[3] - l[1], l[2] - l[0]), n = 11, f = (d: number) => `${l[2] - n * Math.cos(a + d)},${l[3] - n * Math.sin(a + d)}`;
    return `${l[2]},${l[3]} ${f(-0.45)} ${f(0.45)}`;
  };
  const lazy = lazyPage(() => pool, 'comment', k, () => doc);
  const count = $derived(items.length);
</script>

<svelte:window onkeydown={keys} />
<div class="comment">
  <section class="pages" aria-label={t('pages')}>
    {#if doc >= 0}
      {#each sizes as s, i}
        <div class="sheet" style="width:{W}px;height:{s.h * k(i)}px">
          <canvas use:lazy={i}></canvas>
          <div class="layer" class:draw={tool !== 'select'} role="application" aria-label="{t('page')} {i + 1}"
            onpointerdown={(e) => down(e, i)} onpointermove={move} onpointerup={up} onpointercancel={() => { g = null; draft = null; }}>
            <svg viewBox="0 0 {s.w} {s.h}" width="100%" height="100%">
              {#each items.filter((a) => a.page === i) as a (a.id)}{@render shape(a)}{/each}
              {#if draft && draft.page === i}{@render shape(draft)}{/if}
              {#if sel && sel.page === i}
                {@const r = sel.rect}
                {@const hs = 10 / k(i)}
                <rect class="outline" x={r[0] - 2} y={r[1] - 2} width={r[2] - r[0] + 4} height={r[3] - r[1] + 4} />
                {#if !sel.quads && sel.kind !== 'note'}
                  {#each [[r[0], r[1]], [r[2], r[1]], [r[0], r[3]], [r[2], r[3]]] as c, h}
                    <rect class="handle" data-h={h} x={c[0] - hs / 2} y={c[1] - hs / 2} width={hs} height={hs} />
                  {/each}
                {/if}
              {/if}
            </svg>
          </div>
        </div>
      {/each}
    {/if}
  </section>

  <aside class="side">
    <h2>{t('comment')}</h2>
    <p class="help">{t('commentHelp')}</p>
    <div class="tools" role="toolbar" aria-label={t('comment')}>
      {#each TOOLS as [id, label]}
        <button class="tool" class:on={tool === id} aria-pressed={tool === id} onclick={() => choose(id)} disabled={doc < 0}>{t(label)}</button>
      {/each}
    </div>
    <div class="row" role="group" aria-label={t('cColour')}>
      {#each COLORS as [c, label]}
        <button class="swatch" class:on={(sel?.color ?? color) === c} style="background:{c}" aria-label={t(label)} aria-pressed={(sel?.color ?? color) === c} onclick={() => pick(c)}></button>
      {/each}
    </div>
    {#if sel}
      <label class="field"><span>{t('cContents')}</span>
        <textarea bind:this={noteBox} rows="4" dir="auto" value={sel.note}
          onfocus={() => (before = snap())}
          oninput={(e) => { sel.note = e.currentTarget.value; }}
          onchange={() => { if (before && JSON.stringify(before) !== JSON.stringify(snap())) record(before); before = null; }}></textarea></label>
      <button class="btn" onclick={remove}>{@html icon('clear')}{t('cDelete')}</button>
    {:else}
      <p class="help">{t('cNone')}</p>
    {/if}
    <span class="grow"></span>
    <div class="row">
      <button class="btn icon" onclick={undo} disabled={!past.length} title={t('undo')} aria-label={t('undo')}>{@html icon('undo')}</button>
      <button class="btn icon" onclick={redo} disabled={!future.length} title={t('redo')} aria-label={t('redo')}><span class="flip">{@html icon('undo')}</span></button>
      <span class="state">{count} {t('cCount')}</span>
    </div>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
  </aside>
</div>

{#snippet shape(a: Annot)}
  <g data-id={a.id}>
    {#if a.kind === 'highlight'}
      {#each a.quads ?? [] as q}<polygon class="hl" points="{q[0]},{q[1]} {q[2]},{q[3]} {q[6]},{q[7]} {q[4]},{q[5]}" fill={a.color} />{/each}
    {:else if a.kind === 'underline' || a.kind === 'strike'}
      {#each a.quads ?? [] as q}
        <polygon points="{q[0]},{q[1]} {q[2]},{q[3]} {q[6]},{q[7]} {q[4]},{q[5]}" fill="transparent" />
        {#if a.kind === 'underline'}<line x1={q[4]} y1={q[5]} x2={q[6]} y2={q[7]} stroke={a.color} stroke-width="1.5" />
        {:else}<line x1={(q[0] + q[4]) / 2} y1={(q[1] + q[5]) / 2} x2={(q[2] + q[6]) / 2} y2={(q[3] + q[7]) / 2} stroke={a.color} stroke-width="1.5" />{/if}
      {/each}
    {:else if a.kind === 'ink'}
      {#each a.strokes ?? [] as s}
        {@const d = 'M' + s.map((p) => p.join(' ')).join(' L')}
        <path {d} class="ink" stroke={a.color} /><path {d} class="hit" />
      {/each}
    {:else if a.kind === 'square'}
      <rect x={a.rect[0]} y={a.rect[1]} width={a.rect[2] - a.rect[0]} height={a.rect[3] - a.rect[1]} class="ink" stroke={a.color} />
      <rect x={a.rect[0]} y={a.rect[1]} width={a.rect[2] - a.rect[0]} height={a.rect[3] - a.rect[1]} class="hit" />
    {:else if a.kind === 'circle'}
      <ellipse cx={(a.rect[0] + a.rect[2]) / 2} cy={(a.rect[1] + a.rect[3]) / 2} rx={(a.rect[2] - a.rect[0]) / 2} ry={(a.rect[3] - a.rect[1]) / 2} class="ink" stroke={a.color} />
      <ellipse cx={(a.rect[0] + a.rect[2]) / 2} cy={(a.rect[1] + a.rect[3]) / 2} rx={(a.rect[2] - a.rect[0]) / 2} ry={(a.rect[3] - a.rect[1]) / 2} class="hit" />
    {:else if a.kind === 'line' || a.kind === 'arrow'}
      {@const l = a.line ?? [0, 0, 0, 0]}
      <line x1={l[0]} y1={l[1]} x2={l[2]} y2={l[3]} class="ink" stroke={a.color} /><line x1={l[0]} y1={l[1]} x2={l[2]} y2={l[3]} class="hit" />
      {#if a.kind === 'arrow'}<polygon points={arrowHead(l)} fill={a.color} />{/if}
    {:else if a.kind === 'note'}
      <rect x={a.rect[0]} y={a.rect[1]} width="20" height="20" rx="3" fill={a.color} stroke="#233c36" stroke-width="1" />
      <path d="M{a.rect[0] + 5} {a.rect[1] + 7}h10M{a.rect[0] + 5} {a.rect[1] + 12}h7" stroke="#233c36" stroke-width="1.5" fill="none" />
    {:else}
      <foreignObject x={a.rect[0]} y={a.rect[1]} width={Math.max(1, a.rect[2] - a.rect[0])} height={Math.max(1, a.rect[3] - a.rect[1])}>
        <div class="tb" dir="auto" style="color:{a.color}">{a.note}</div>
      </foreignObject>
    {/if}
  </g>
{/snippet}

<style>
  .comment { height: 100%; display: grid; grid-template-columns: 1fr 340px; min-height: 0; }
  .pages { display: flex; flex-direction: column; align-items: center; gap: var(--s-16); background: var(--canvas); padding: var(--s-24); overflow: auto; }
  .sheet { position: relative; flex: none; background: #fff; box-shadow: var(--shadow); }
  .sheet canvas { width: 100%; height: 100%; display: block; }
  .layer { position: absolute; inset: 0; touch-action: none; user-select: none; }
  .layer.draw { cursor: crosshair; }
  .layer svg { display: block; overflow: hidden; }
  .hl { mix-blend-mode: multiply; opacity: .8; }
  .layer :global(.ink) { fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .layer :global(.hit) { fill: none; stroke: transparent; stroke-width: 12; pointer-events: stroke; }
  .tb { width: 100%; height: 100%; overflow: hidden; font: 12px/1.2 Helvetica, Arial, sans-serif; white-space: pre-wrap; overflow-wrap: anywhere; }
  .outline { fill: none; stroke: var(--green); stroke-width: 1; stroke-dasharray: 4 3; pointer-events: none; }
  .handle { fill: #fff; stroke: var(--green); stroke-width: 1.5; cursor: nwse-resize; }
  .side { display: flex; flex-direction: column; gap: var(--s-12); padding: var(--s-16); background: var(--surface); border-inline-start: 1px solid var(--line); overflow-y: auto; }
  h2 { margin: var(--s-8) 0 0; font-size: var(--fs-18); }
  .help, .state { margin: 0; color: var(--muted); }
  .state { font-size: var(--fs-12); margin-inline-start: auto; }
  .tools { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-8); }
  .tool { min-height: var(--control); padding: 0 var(--s-12); border: 1px solid var(--line); border-radius: var(--r-8); background: var(--surface); color: var(--ink); font-weight: 600; }
  .tool.on { background: var(--green-soft); border-color: var(--green); }
  .tool:disabled { opacity: .55; }
  .row { display: flex; align-items: center; gap: var(--s-8); }
  .swatch { width: var(--control); height: var(--control); border: 2px solid var(--line); border-radius: 50%; padding: 0; cursor: pointer; }
  .swatch.on { border-color: var(--ink); box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--ink); }
  .field { display: grid; gap: var(--s-8); font-weight: 600; }
  .field textarea { padding: var(--s-8) var(--s-12); border: 1px solid var(--line); border-radius: var(--r-8); background: var(--paper); font: inherit; font-weight: 400; resize: vertical; }
  .grow { flex: 1; }
  .flip { display: inline-flex; transform: scaleX(-1); }
  .error { margin: 0; color: var(--danger); }
  @media (max-width: 900px) { .comment { grid-template-columns: 1fr; grid-template-rows: 1fr auto; } .side { border-inline-start: 0; border-top: 1px solid var(--line); } }
</style>
