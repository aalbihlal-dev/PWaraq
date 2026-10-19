<script lang="ts">
  // Redact: mark areas by dragging on a page, or find all phone numbers / e-mails / a word; the marks are previewed, then
  // applied: MuPDF removes the text, photo pixels and lines under them from the file (the result replaces the document).
  import type { EnginePool } from '../lib/engine/pool';
  import type { Mark } from '../lib/engine/redact';
  import { t } from '../lib/i18n.svelte';
  import { icon } from '../lib/icons.js';
  import { lazyPage } from '../lib/lazy';

  let { pool, sizes, bytes, onReplace }: { pool: EnginePool; sizes: { w: number; h: number }[]; bytes: Uint8Array; onReplace: (bytes: Uint8Array) => Promise<void> } = $props();
  const W = 560, k = (i: number) => W / sizes[i].w;
  let marks = $state<Mark[]>([]), kind = $state<'phone' | 'email' | 'word'>('phone'), word = $state(''), metadata = $state(false);
  let busy = $state(false), note = $state(''), error = $state(''), drag = $state<{ page: number; x: number; y: number; w: number; h: number } | null>(null);

  const lazy = lazyPage(() => pool, 'redact', k);

  const at = (e: PointerEvent, i: number) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); return [(e.clientX - r.left) / k(i), (e.clientY - r.top) / k(i)]; };
  function down(e: PointerEvent, page: number) {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const [x, y] = at(e, page); drag = { page, x, y, w: 0, h: 0 };
  }
  function move(e: PointerEvent, page: number) {
    if (!drag || drag.page !== page) return;
    const [x, y] = at(e, page); drag = { ...drag, w: x - drag.x, h: y - drag.y };
  }
  function up() {
    if (!drag) return;
    const d = drag; drag = null;
    const m = { page: d.page, x: Math.min(d.x, d.x + d.w), y: Math.min(d.y, d.y + d.h), w: Math.abs(d.w), h: Math.abs(d.h) };
    if (m.w > 4 && m.h > 4) marks.push(m);
  }

  async function find() {
    busy = true; error = note = '';
    try {
      let added = 0;
      await Promise.all(sizes.map(async (_, page) => {
        const found: Omit<Mark, 'page'>[] = await pool.run({ op: 'redactfind', page, priority: 3, key: 'rf' + page, args: { doc: 0, kind, query: word } });
        for (const f of found) if (!marks.some((m) => m.page === page && Math.abs(m.x - f.x) < 1 && Math.abs(m.y - f.y) < 1)) { marks.push({ page, ...f }); added++; }
      }));
      if (!added) note = t('noMatches');
    } catch { error = t('toolFailed'); }
    busy = false;
  }
  async function apply() {
    busy = true; error = note = '';
    try {
      const out = await pool.tool('redact', { bytes: bytes.slice(), marks: $state.snapshot(marks), metadata });
      marks = [];
      await onReplace(out);
    } catch { error = t('toolFailed'); }
    busy = false;
  }
</script>

<div class="redact">
  <section class="pages" aria-label={t('pages')}>
    {#each sizes as s, i}
      <div class="sheet" style="width:{W}px;height:{s.h * k(i)}px" role="presentation" onpointerdown={(e) => down(e, i)} onpointermove={(e) => move(e, i)} onpointerup={up}>
        <canvas use:lazy={i}></canvas>
        {#each marks as m, n}
          {#if m.page === i}<button class="mark" style="left:{m.x * k(i)}px;top:{m.y * k(i)}px;width:{m.w * k(i)}px;height:{m.h * k(i)}px" title={t('removeMark')} aria-label={t('removeMark')}
            onpointerdown={(e) => e.stopPropagation()} onclick={() => marks.splice(n, 1)}></button>{/if}
        {/each}
        {#if drag?.page === i}<span class="mark drag" style="left:{Math.min(drag.x, drag.x + drag.w) * k(i)}px;top:{Math.min(drag.y, drag.y + drag.h) * k(i)}px;width:{Math.abs(drag.w) * k(i)}px;height:{Math.abs(drag.h) * k(i)}px"></span>{/if}
      </div>
    {/each}
  </section>

  <aside class="side">
    <h2>{t('redact')}</h2>
    <p class="help">{t('redactHelp')}</p>
    <h2>{t('findToMark')}</h2>
    <label class="choice"><input type="radio" bind:group={kind} value="phone" />{t('findPhone')}</label>
    <label class="choice"><input type="radio" bind:group={kind} value="email" />{t('findEmail')}</label>
    <label class="choice"><input type="radio" bind:group={kind} value="word" />{t('findWord')}</label>
    {#if kind === 'word'}<label class="field"><span>{t('findWord')}</span><input bind:value={word} /></label>{/if}
    <button class="btn" onclick={find} disabled={busy || (kind === 'word' && !word.trim())}>{@html icon('search')}{t('findAll')}</button>
    <p class="count num">{marks.length} {t('marksCount')}</p>
    <button class="btn" onclick={() => (marks = [])} disabled={busy || !marks.length}>{@html icon('clear')}{t('clearMarks')}</button>
    <label class="switch"><input type="checkbox" bind:checked={metadata} />{t('removeMetadata')}</label>
    <span class="grow"></span>
    <button class="btn primary" onclick={apply} disabled={busy || (!marks.length && !metadata)}>{@html icon('redact')}{t('redactApply')}</button>
    <p class="state" aria-live="polite">{busy ? t('applying') : note}</p>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
  </aside>
</div>

<style>
  .redact { height: 100%; display: grid; grid-template-columns: 1fr 340px; min-height: 0; }
  .pages { display: flex; flex-direction: column; align-items: center; gap: var(--s-16); background: var(--canvas); padding: var(--s-24); overflow: auto; }
  .sheet { position: relative; flex: none; background: #fff; box-shadow: var(--shadow); cursor: crosshair; touch-action: none; }
  .sheet canvas { width: 100%; height: 100%; display: block; pointer-events: none; }
  .mark { position: absolute; padding: 0; border: 2px solid var(--danger); background: rgba(0, 0, 0, .55); cursor: pointer; }
  .mark.drag { pointer-events: none; }
  .side { display: flex; flex-direction: column; gap: var(--s-12); padding: var(--s-16); background: var(--surface); border-inline-start: 1px solid var(--line); overflow-y: auto; }
  h2 { margin: var(--s-8) 0 0; font-size: var(--fs-18); }
  .help, .count, .state { margin: 0; color: var(--muted); }
  .state { font-size: var(--fs-12); min-height: 18px; }
  .field { display: grid; gap: var(--s-8); font-weight: 600; }
  .field input { min-height: var(--control); padding: 0 var(--s-12); border: 1px solid var(--line); border-radius: var(--r-8); background: var(--paper); font-weight: 400; }
  .switch, .choice { display: flex; align-items: center; gap: var(--s-8); min-height: var(--control); font-weight: 600; }
  .switch input, .choice input { flex: none; width: 20px; height: 20px; accent-color: var(--green); }
  .grow { flex: 1; }
  .error { margin: 0; color: var(--danger); }
  @media (max-width: 900px) { .redact { grid-template-columns: 1fr; grid-template-rows: 1fr auto; } .side { border-inline-start: 0; border-top: 1px solid var(--line); } }
</style>
