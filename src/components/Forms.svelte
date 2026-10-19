<script lang="ts">
  // Forms: the PDF's fields (text, checkbox, radio, choice) listed in a right-hand panel, with the pages and the field
  // boxes on the left. Applying writes the answers into the file (still fillable, or fixed with "flatten").
  import type { EnginePool } from '../lib/engine/pool';
  import type { Field } from '../lib/engine/forms';
  import { t } from '../lib/i18n.svelte';
  import { icon } from '../lib/icons.js';

  let { pool, sizes, bytes, onReplace }: { pool: EnginePool; sizes: { w: number; h: number }[]; bytes: Uint8Array; onReplace: (bytes: Uint8Array) => Promise<void> } = $props();
  const W = 560, k = (i: number) => W / sizes[i].w;
  let fields = $state<Field[]>([]), values = $state<Record<string, string | boolean>>({}), loaded = $state(false), flatten = $state(false);
  let busy = $state(false), error = $state('');

  $effect(() => {
    pool.tool<Field[]>('formfields', { bytes: bytes.slice() }).then((f) => {
      fields = f; loaded = true;
      for (const x of f) values[x.id] = x.type === 'checkbox' || x.type === 'radio' ? x.checked : x.value;
    }).catch(() => { loaded = true; error = t('toolFailed'); });
  });

  // radio buttons of one group are shown together, as one question
  const rows = $derived.by(() => {
    const out: { name: string; fields: Field[] }[] = [];
    for (const f of fields) {
      const same = f.type === 'radio' ? out.find((r) => r.fields[0].type === 'radio' && r.name === f.name) : null;
      if (same) same.fields.push(f); else out.push({ name: f.name, fields: [f] });
    }
    return out;
  });
  const chosen = (r: { fields: Field[] }) => r.fields.find((f) => values[f.id])?.id ?? '';
  const pick = (r: { fields: Field[] }, id: string) => { for (const f of r.fields) values[f.id] = f.id === id; };

  function lazy(node: HTMLCanvasElement, i: number) {
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      pool.run<ImageBitmap>({ op: 'render', page: i, priority: 1, key: 'forms' + i, args: { scale: k(i) * Math.min(devicePixelRatio || 1, 2) } })
        .then((bmp) => { node.width = bmp.width; node.height = bmp.height; node.getContext('2d')!.drawImage(bmp, 0, 0); bmp.close(); }).catch(() => {});
    }, { rootMargin: '400px' });
    io.observe(node);
    return { destroy: () => io.disconnect() };
  }

  async function apply() {
    busy = true; error = '';
    try {
      const answers: Record<string, string | boolean> = {};
      for (const f of fields) {
        if (f.readOnly) continue;
        const v = values[f.id], was = f.type === 'checkbox' || f.type === 'radio' ? f.checked : f.value;
        // a radio button is sent only when it is the one chosen; a changed answer is sent, an unchanged one is not
        if (v !== was && !(f.type === 'radio' && v === false)) answers[f.id] = v;
      }
      await onReplace(await pool.tool('fillform', { bytes: bytes.slice(), answers, flatten }));
    } catch { error = t('toolFailed'); }
    busy = false;
  }
</script>

<div class="forms">
  <section class="pages" aria-label={t('pages')}>
    {#each sizes as s, i}
      <div class="sheet" style="width:{W}px;height:{s.h * k(i)}px">
        <canvas use:lazy={i}></canvas>
        {#each fields as f}
          {#if f.page === i}<button class="box" style="left:{f.rect[0] * k(i)}px;top:{f.rect[1] * k(i)}px;width:{f.rect[2] * k(i)}px;height:{f.rect[3] * k(i)}px" tabindex="-1" aria-label={f.label}
            onclick={() => document.getElementById('f-' + f.id)?.focus()}></button>{/if}
        {/each}
      </div>
    {/each}
  </section>

  <aside class="side">
    <h2>{t('forms')}</h2>
    {#if loaded && !fields.length}
      <p class="help">{t('noFields')}</p>
    {:else}
      <p class="help">{t('formsHelp')}</p>
      {#each rows as r}
        {@const f = r.fields[0]}
        {#if f.type === 'text'}
          <label class="field"><span>{f.label}{f.readOnly ? ` (${t('fieldReadOnly')})` : ''}</span>
            {#if f.multiline}<textarea id="f-{f.id}" rows="3" dir="auto" bind:value={values[f.id] as string} disabled={f.readOnly}></textarea>
            {:else}<input id="f-{f.id}" dir="auto" bind:value={values[f.id] as string} disabled={f.readOnly} />{/if}</label>
        {:else if f.type === 'checkbox'}
          <label class="switch"><input id="f-{f.id}" type="checkbox" bind:checked={values[f.id] as boolean} disabled={f.readOnly} />{f.label}</label>
        {:else if f.type === 'radio'}
          <fieldset><legend>{r.name}</legend>
            {#each r.fields as o}
              <label class="choice"><input id="f-{o.id}" type="radio" name={'g-' + r.name} checked={chosen(r) === o.id} disabled={o.readOnly} onchange={() => pick(r, o.id)} />{o.on}</label>
            {/each}
          </fieldset>
        {:else}
          <label class="field"><span>{f.label}{f.readOnly ? ` (${t('fieldReadOnly')})` : ''}</span>
            <select id="f-{f.id}" bind:value={values[f.id] as string} disabled={f.readOnly}><option value=""></option>{#each f.options as o}<option value={o}>{o}</option>{/each}</select></label>
        {/if}
      {/each}
    {/if}
    <span class="grow"></span>
    <label class="switch"><input type="checkbox" bind:checked={flatten} />{t('flatten')}</label>
    <button class="btn primary" onclick={apply} disabled={busy || !fields.length}>{@html icon('check')}{t('formsApply')}</button>
    <p class="state" aria-live="polite">{busy ? t('applying') : ''}</p>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
  </aside>
</div>

<style>
  .forms { height: 100%; display: grid; grid-template-columns: 1fr 340px; min-height: 0; }
  .pages { display: flex; flex-direction: column; align-items: center; gap: var(--s-16); background: var(--canvas); padding: var(--s-24); overflow: auto; }
  .sheet { position: relative; flex: none; background: #fff; box-shadow: var(--shadow); }
  .sheet canvas { width: 100%; height: 100%; display: block; }
  .box { position: absolute; padding: 0; border: 2px solid var(--green); border-radius: 2px; background: rgba(21, 119, 93, .12); cursor: pointer; }
  .side { display: flex; flex-direction: column; gap: var(--s-12); padding: var(--s-16); background: var(--surface); border-inline-start: 1px solid var(--line); overflow-y: auto; }
  h2 { margin: var(--s-8) 0 0; font-size: var(--fs-18); }
  .help, .state { margin: 0; color: var(--muted); }
  .state { font-size: var(--fs-12); min-height: 18px; }
  .field { display: grid; gap: var(--s-8); font-weight: 600; }
  .field input, .field select, .field textarea { min-height: var(--control); padding: 0 var(--s-12); border: 1px solid var(--line); border-radius: var(--r-8); background: var(--paper); font: inherit; font-weight: 400; }
  .field textarea { padding: var(--s-8) var(--s-12); }
  fieldset { display: grid; gap: 0; margin: 0; padding: 0; border: 0; }
  legend { padding: 0; font-weight: 600; }
  .switch, .choice { display: flex; align-items: center; gap: var(--s-8); min-height: var(--control); font-weight: 600; }
  .switch input, .choice input { flex: none; width: 20px; height: 20px; accent-color: var(--green); }
  .grow { flex: 1; }
  .error { margin: 0; color: var(--danger); }
  @media (max-width: 900px) { .forms { grid-template-columns: 1fr; grid-template-rows: 1fr auto; } .side { border-inline-start: 0; border-top: 1px solid var(--line); } }
</style>
