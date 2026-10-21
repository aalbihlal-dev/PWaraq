<script lang="ts" module>
  export type Saved = { doc: number; w: number; h: number; bytes: Uint8Array };
</script>

<script lang="ts">
  // The page editor (like Acrobat's Edit PDF / PDFCraft): the page large in the middle, tools on top, options on the
  // right, no pop-ups. Text is added as real text (Tajawal), a replaced line in its own font; photos are added, moved, resized, replaced or
  // deleted. Save makes the edited page a new one-page source that takes the old page's place (View, Organize, Portfolio).
  import { onMount, tick } from 'svelte';
  import type { EnginePool } from '../lib/engine/pool';
  import type { Item } from '../lib/engine/assemble';
  import { LEADING, BASELINE, type Box, type Edit, type PageLine } from '../lib/engine/editpage';
  import { i18n, t, type Key } from '../lib/i18n.svelte';
  import { icon } from '../lib/icons.js';
  import { pickFiles } from '../lib/store';
  import { isDesktop, readPath } from '../lib/desktop';
  import { WINDOWS_FONTS } from '../lib/engine/fontstore';
  import { uid } from '../lib/pages';

  let { pool, base, label, onSave, onCancel }: { pool: EnginePool; base: Item; label: string; onSave: (r: Saved) => void | Promise<void>; onCancel: () => void } = $props();

  // what the editor holds: the engine's edits plus an id; `orig` = the state it was lifted with (unchanged ones are dropped)
  type Obj = Edit & { id: string; orig?: string; line?: number; removed?: boolean; aligned?: boolean };
  let doc = $state(-1), size = $state({ w: 595, h: 842 }), found = $state<{ lines: PageLine[]; images: Box[] }>({ lines: [], images: [] });
  let objs = $state<Obj[]>([]), selected = $state<string | null>(null), tool = $state<'select' | 'text' | 'redact'>('select'), busy = $state(t('openingPage'));
  const sel = $derived(objs.find((o) => o.id === selected));
  // a replaced line: the font it will be written in (its own, or the closest bundled one and the letters that were missing)
  let fontInfo = $state<{ font: string; using: string | null; missing: string[]; reason?: 'own' | 'missing' | 'unusable' | 'none'; source?: 'pdf' | 'bundled' | 'system'; width?: number } | null>(null);
  const systemTried = new Set<string>(); // families this sitting already looked for on this PC
  $effect(() => {
    const o = sel;
    if (o?.kind !== 'text' || !o.from || !o.text.trim()) { fontInfo = null; return; }
    const args = { doc, page: 0, from: $state.snapshot(o.from), text: o.text, bold: o.bold, size: o.size };
    const timer = setTimeout(() => pool.run<typeof fontInfo>({ op: 'fontcheck', page: 0, priority: 0, args }).then(async (f) => {
      fontInfo = f;
      // desktop: a line whose own copy of the font cannot be reused gets the whole font from this PC when it has it
      if (f?.using && f.source !== 'system' && isDesktop && !systemTried.has(f.font)) {
        systemTried.add(f.font);
        const file = WINDOWS_FONTS[f.font.toLowerCase().replace(/[^a-z]/g, '')]?.[o.bold ? 1 : 0] ?? WINDOWS_FONTS[f.font.toLowerCase().replace(/[^a-z]/g, '')]?.[0];
        if (file) try {
          const bytes = new Uint8Array(await (await readPath('C:/Windows/Fonts/' + file)).arrayBuffer());
          await pool.run({ op: 'addfont', page: 0, priority: 0, args: { name: f.font, bytes } });
          fontInfo = await pool.run<typeof fontInfo>({ op: 'fontcheck', page: 0, priority: 0, args });
        } catch (e) { console.warn('system font:', e); }
      }
    }).catch((e) => console.warn('font check:', e)), 200);
    return () => clearTimeout(timer);
  });
  const fontText = (f: NonNullable<typeof fontInfo>) => (!f.using ? t('fontOwn') : f.source === 'system' ? t('fontSystem') : f.reason === 'missing' && f.missing.length ? t('fontMissing') : t('fontUnusable'))
    .replace('{font}', f.font || '?').replace('{using}', f.using ?? '').replace('{letters}', f.missing.join(' '));
  const photos: Uint8Array[] = [];
  let urls = $state<string[]>([]);

  onMount(() => {
    (async () => {
      try {
        const a = await pool.add(await pool.build({ items: [base] }));
        size = a.sizes[0];
        found = await pool.run({ op: 'objects', page: 0, priority: 0, args: { doc: a.id, page: 0 } });
        doc = a.id;
      } catch { onCancel(); }
      busy = '';
    })();
    measure();
    return () => { urls.forEach((u) => URL.revokeObjectURL(u)); if (clean) URL.revokeObjectURL(clean); };
  });

  // the page fills the middle; s = screen pixels per point
  let sw = $state(0), sh = $state(0);
  const s = $derived(sw && sh ? Math.max(0.2, Math.min((sw - 48) / size.w, (sh - 48) / size.h)) : 0);

  // background: the page with what the edits take away already gone (the rest is drawn on top while editing)
  let canvas = $state<HTMLCanvasElement>(), clean = $state(''); // clean: the untouched page, for pictures of photos being moved
  const lifted = $derived(JSON.stringify(objs.flatMap((o): Edit[] => o.kind === 'image' ? [{ kind: 'image', index: o.index, from: o.from, ...o.from }]
    : o.kind === 'text' && o.from ? [{ kind: 'text', from: o.from, text: '', size: 1, color: [0, 0, 0], bold: false, align: 'left', ...o.from }]
    : o.kind === 'redact' && o.w > 2 && o.h > 2 ? [{ kind: 'redact', x: o.x, y: o.y, w: o.w, h: o.h }] : [])));
  $effect(() => {
    if (doc < 0 || !s || !canvas) return;
    const edits = JSON.parse(lifted) as Edit[], scale = s * Math.min(devicePixelRatio || 1, 2), c = canvas;
    const job = edits.length ? pool.run<ImageBitmap>({ op: 'edit', page: 0, priority: 0, key: 'editor', args: { doc, page: 0, edits, scale } })
      : pool.run<ImageBitmap>({ op: 'render', page: 0, priority: 0, key: 'editor', args: { doc, scale } });
    job.then(async (bmp) => {
      c.width = bmp.width; c.height = bmp.height; c.getContext('2d')!.drawImage(bmp, 0, 0);
      if (!edits.length && !clean) { const o = new OffscreenCanvas(bmp.width, bmp.height); o.getContext('2d')!.drawImage(bmp, 0, 0); clean = URL.createObjectURL(await o.convertToBlob()); }
      bmp.close();
    }).catch(() => {});
  });

  // the browser's first baseline in a text box of LEADING line height vs the engine's (BASELINE): the box is shifted by
  // the difference so the text on screen sits where it will be written
  let shift = $state([0, 0]);
  async function measure() {
    try {
      shift = await Promise.all([400, 700].map(async (wt) => {
        await document.fonts.load(`${wt} 100px Tajawal`);
        const c = document.createElement('canvas').getContext('2d')!; c.font = `${wt} 100px Tajawal`;
        const m = c.measureText('Hgا'), a = m.fontBoundingBoxAscent / 100, d = m.fontBoundingBoxDescent / 100;
        return BASELINE - ((LEADING - a - d) / 2 + a);
      }));
    } catch {}
  }

  // undo / redo: snapshots of the edits
  let past: Obj[][] = [], future: Obj[][] = [], canUndo = $state(false), canRedo = $state(false);
  const snap = () => $state.snapshot(objs) as Obj[];
  function record(before: Obj[]) { past.push(before); future = []; canUndo = true; canRedo = false; }
  function change(f: () => void) { const before = snap(); f(); record(before); }
  function undo() { if (!past.length) return; future.push(snap()); objs = past.pop()!; canUndo = !!past.length; canRedo = true; keep(); }
  function redo() { if (!future.length) return; past.push(snap()); objs = future.pop()!; canRedo = !!future.length; canUndo = true; keep(); }
  const keep = () => { if (!objs.some((o) => o.id === selected)) selected = null; };

  const stateOf = (o: Obj) => { const { id, orig, ...rest } = $state.snapshot(o) as Obj; return JSON.stringify(rest); };
  // choosing something else lets go of the last one: a lifted line or photo left as it was goes back to the page untouched
  function select(id: string | null) {
    if (id === selected) return;
    const last = objs.find((o) => o.id === selected);
    if (last && ((last.orig && last.orig === stateOf(last)) || (last.kind === 'text' && !last.from && !last.text.trim()))) objs = objs.filter((o) => o !== last);
    selected = id;
  }

  const rgb = (c: number[]) => `rgb(${c.map((v) => Math.round(v * 255)).join(' ')})`;
  // text colours: black and the Waraq palette (as 0..1 RGB for the engine)
  const hex = (h: string) => [1, 3, 5].map((i) => +(parseInt(h.slice(i, i + 2), 16) / 255).toFixed(3));
  const COLOURS: [Key, number[]][] = [['black', hex('#000000')], ['inkColour', hex('#233c36')], ['greenColour', hex('#15775d')], ['mintColour', hex('#eaf3eb')], ['whiteColour', hex('#fafbf8')]];
  const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 60, 72];
  const sameColour = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]) < 0.01);

  async function focusText(id: string) { await tick(); document.querySelector<HTMLTextAreaElement>(`[data-obj="${id}"] textarea`)?.focus(); }
  // a click on the page: places a new text box (Add text), or lets go of the selection
  function pageDown(e: PointerEvent) {
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).matches('canvas')) return;
    if (tool === 'redact') { markArea(e); return; }
    if (tool !== 'text') { select(null); return; }
    // the box grows from the click towards the end of the line: rightwards in English, leftwards in Arabic
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect(), x = (e.clientX - r.left) / s, y = (e.clientY - r.top) / s, rtl = i18n.lang === 'ar';
    const w = Math.max(80, Math.min(260, rtl ? x - 8 : size.w - x - 8));
    const o: Obj = { id: uid(), kind: 'text', text: '', size: 16, color: COLOURS[1][1], bold: false, align: rtl ? 'right' : 'left', x: rtl ? Math.max(0, x - w) : x, y: y - 8, w, h: 16 * LEADING };
    e.preventDefault();
    change(() => objs.push(o)); select(o.id); tool = 'select'; focusText(o.id);
  }
  // Redact: drag a box over what should go; it stays selected (move it, resize it, Delete takes it away)
  function markArea(e: PointerEvent) {
    e.preventDefault();
    const el = e.currentTarget as HTMLElement, r = el.getBoundingClientRect(), x0 = (e.clientX - r.left) / s, y0 = (e.clientY - r.top) / s, before = snap();
    const o: Obj = { id: uid(), kind: 'redact', x: x0, y: y0, w: 0, h: 0 };
    objs.push(o); select(o.id);
    const box = objs[objs.length - 1];
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const x = (ev.clientX - r.left) / s, y = (ev.clientY - r.top) / s;
      Object.assign(box, { x: Math.min(x0, x), y: Math.min(y0, y), w: Math.abs(x - x0), h: Math.abs(y - y0) });
    };
    const up = () => {
      el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
      if (box.w < 4 || box.h < 4) { objs = objs.filter((x) => x.id !== o.id); selected = null; } else record(before);
    };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  }
  // an existing line of text: a text box in its place, with its text, size, colour and weight; the box reaches the page
  // margin so a longer text stays on one line instead of wrapping onto the line below
  function liftLine(i: number) {
    const l = found.lines[i], id = uid(), w = Math.max(l.w, l.rtl ? l.x + l.w - 24 : size.w - l.x - 24);
    const o: Obj = { id, kind: 'text', line: i, from: { x: l.x, y: l.y, w: l.w, h: l.h }, text: l.text, size: +l.size.toFixed(1), color: l.color, bold: l.bold, align: l.rtl ? 'right' : 'left',
      x: l.rtl ? l.x + l.w - w : l.x, y: l.base - BASELINE * l.size, w, h: l.h };
    o.orig = stateOf(o); objs.push(o); select(id); focusText(id);
  }
  function liftImage(i: number) {
    const b = found.images[i], o: Obj = { id: uid(), kind: 'image', index: i, from: { ...b }, ...b };
    o.orig = stateOf(o); objs.push(o); select(o.id);
  }
  const liftedLine = (i: number) => objs.some((o) => o.kind === 'text' && o.line === i);
  const liftedImage = (i: number) => objs.some((o) => o.kind === 'image' && o.index === i);

  // drag to move (the whole photo, or the bar above a text box); the corner resizes (photos keep their shape)
  function drag(e: PointerEvent, o: Obj, mode: 'move' | 'size') {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation(); select(o.id);
    const el = e.currentTarget as HTMLElement, before = snap(), sx = e.clientX, sy = e.clientY, start = { x: o.x, y: o.y, w: o.w, h: o.h };
    let moved = false;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / s, dy = (ev.clientY - sy) / s;
      moved ||= Math.abs(dx) + Math.abs(dy) > 0.5;
      if (mode === 'move') { o.x = Math.min(size.w - 16, Math.max(16 - start.w, start.x + dx)); o.y = Math.min(size.h - 16, Math.max(-start.h + 16, start.y + dy)); }
      else if (o.kind === 'text') o.w = Math.max(24, start.w + dx);
      else if (o.kind === 'redact') { o.w = Math.max(4, start.w + dx); o.h = Math.max(4, start.h + dy); }
      else { o.w = Math.max(12, start.w + dx); o.h = (o.w * start.h) / start.w; }
    };
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); if (moved) record(before); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  }

  // typing is one undo step per visit to the text box
  let typing: Obj[] | null = null;
  // a new text box follows the direction of what is typed (Arabic to the right) until an alignment is chosen; the box
  // turns around the point where it was placed
  function direction(o: Obj) {
    if (o.kind !== 'text' || o.from || o.aligned || o.align === 'center') return;
    const first = o.text.match(/[A-Za-z؀-ۿ]/)?.[0];
    if (!first) return;
    const want = /[؀-ۿ]/.test(first) ? 'right' : 'left';
    if (want !== o.align) { o.x = Math.max(0, Math.min(size.w - o.w, o.x + (want === 'right' ? -o.w : o.w))); o.align = want; }
  }
  function typed(o: Obj) { if (typing && JSON.stringify(typing.find((x) => x.id === o.id)) !== JSON.stringify($state.snapshot(o))) record(typing); typing = null; }

  function remove() {
    const o = sel;
    if (!o) return;
    change(() => {
      if (o.kind === 'image') o.removed = true; // stays an edit: the photo is taken off the page
      else if (o.kind === 'text' && o.from) { o.removed = true; o.text = ''; }
      else objs = objs.filter((x) => x.id !== o.id);
    });
    selected = null;
  }

  // photos: a new one in the middle of the page, or a replacement in the selected photo's place
  let picker: HTMLInputElement, replacing = false;
  async function choosePhoto(replace: boolean) {
    replacing = replace;
    const [f] = await pickFiles({ accept: { 'image/*': ['.png', '.jpg', '.jpeg'] }, fallback: () => picker.click() });
    if (f) await usePhoto(f.file);
  }
  async function usePhoto(file: File) {
    let bmp: ImageBitmap;
    try { bmp = await createImageBitmap(file); } catch { alert(t('notImage')); return; }
    const n = photos.push(new Uint8Array(await file.arrayBuffer())) - 1;
    urls = [...urls, URL.createObjectURL(file)];
    const target = replacing ? sel : undefined;
    if (target && (target.kind === 'image' || target.kind === 'photo')) change(() => { target.photo = n; });
    else {
      const w = Math.min(size.w * 0.4, bmp.width * 0.75), h = (w * bmp.height) / bmp.width;
      const o: Obj = { id: uid(), kind: 'photo', photo: n, x: (size.w - w) / 2, y: Math.max(8, (size.h - h) / 2), w, h };
      change(() => objs.push(o)); select(o.id);
    }
    bmp.close();
  }
  // a photo being moved: the new photo, or the picture of the old one cut from the untouched page
  function picture(o: Obj) {
    if (o.kind === 'image' && o.photo == null) {
      const kx = o.w / o.from.w, ky = o.h / o.from.h;
      return `background-image:url(${clean});background-size:${size.w * s * kx}px ${size.h * s * ky}px;background-position:${-o.from.x * s * kx}px ${-o.from.y * s * ky}px`;
    }
    return '';
  }

  async function save() {
    select(null);
    const edits = (snap()).map(({ id, orig, line, ...e }) => e as Edit);
    if (!edits.length) { onCancel(); return; }
    busy = t('savingPage');
    try {
      const bytes = await pool.run<Uint8Array>({ op: 'edit', priority: 0, any: true, args: { doc, page: 0, edits, photos: photos.map((p) => p.slice()) } });
      const a = await pool.add(bytes.slice());
      await onSave({ doc: a.id, w: a.sizes[0].w, h: a.sizes[0].h, bytes });
    } catch (e) { busy = ''; alert(String((e as Error).message || e)); }
  }

  function keys(e: KeyboardEvent) {
    if ((e.target as HTMLElement).closest('textarea,input,select')) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if ((e.ctrlKey || e.metaKey) && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); remove(); }
    else if (e.key === 'Escape') { tool = 'select'; select(null); }
  }
</script>

<svelte:window onkeydown={keys} />
<input bind:this={picker} type="file" accept="image/png,image/jpeg" hidden
  onchange={(e) => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (f) usePhoto(f); }} />
<div class="editor">
  <div class="tools" role="toolbar" aria-label={t('editPage')}>
    <button class="btn" class:on={tool === 'select'} aria-pressed={tool === 'select'} onclick={() => (tool = 'select')}>{@html icon('move')}{t('selectTool')}</button>
    <button class="btn" class:on={tool === 'text'} aria-pressed={tool === 'text'} onclick={() => { tool = 'text'; select(null); }} disabled={doc < 0}>{@html icon('text')}{t('addText')}</button>
    <button class="btn" onclick={() => choosePhoto(false)} disabled={doc < 0}>{@html icon('images')}{t('addPhoto')}</button>
    <button class="btn" class:on={tool === 'redact'} aria-pressed={tool === 'redact'} onclick={() => { tool = 'redact'; select(null); }} disabled={doc < 0}>{@html icon('redact')}{t('redactArea')}</button>
    <span class="sep"></span>
    <button class="btn icon" onclick={undo} disabled={!canUndo} title={t('undo')} aria-label={t('undo')}>{@html icon('undo')}</button>
    <button class="btn icon" onclick={redo} disabled={!canRedo} title={t('redo')} aria-label={t('redo')}><span class="flip">{@html icon('undo')}</span></button>
    <button class="btn icon" onclick={remove} disabled={!sel} title={t('delete')} aria-label={t('delete')}>{@html icon('delete')}</button>
    <span class="where num">{label}</span>
    <button class="btn" onclick={onCancel} disabled={!!busy && doc >= 0}>{@html icon('close')}{t('cancel')}</button>
    <button class="btn primary" onclick={save} disabled={!!busy}>{@html icon('check')}{t('savePage')}</button>
  </div>

  <div class="body">
    <div class="stage" bind:clientWidth={sw} bind:clientHeight={sh}>
      {#if busy}<p class="busy" role="status">{busy}</p>{/if}
      {#if s}
        <!-- svelte-ignore a11y_no_static_element_interactions (the page itself: a click places text or lets go of the selection) -->
        <div class="sheet" class:placing={tool !== 'select'} dir="ltr" style="width:{size.w * s}px;height:{size.h * s}px" onpointerdown={pageDown}>
          <canvas bind:this={canvas} style="width:{size.w * s}px;height:{size.h * s}px"></canvas>
          {#if tool === 'select' && doc >= 0}
            {#each found.images as b, i}{#if !liftedImage(i)}
              <button class="hit photo" style="left:{b.x * s}px;top:{b.y * s}px;width:{b.w * s}px;height:{b.h * s}px" aria-label="{t('changePhoto')} {i + 1}" onpointerdown={(e) => { e.stopPropagation(); liftImage(i); }}></button>
            {/if}{/each}
            {#each found.lines as l, i}{#if !liftedLine(i)}
              <button class="hit line" style="left:{l.x * s}px;top:{l.y * s}px;width:{l.w * s}px;height:{l.h * s}px" aria-label="{t('changeText')}: {l.text}" onpointerdown={(e) => { e.stopPropagation(); e.preventDefault(); liftLine(i); }}></button>
            {/if}{/each}
          {/if}
          {#each objs as o (o.id)}
            {#if !o.removed}
              {#if o.kind === 'text'}
                <div class="obj text" class:on={o.id === selected} data-obj={o.id} style="left:{o.x * s}px;top:{o.y * s}px;width:{o.w * s}px">
                  {#if o.id === selected}<div class="grip" title={t('moveHandle')} onpointerdown={(e) => drag(e, o, 'move')}></div>{/if}
                  <textarea bind:value={o.text} dir="auto" rows="1" spellcheck="false" placeholder={t('typeHere')} aria-label={t('textOptions')}
                    style="font-size:{o.size * s}px;font-weight:{o.bold ? 700 : 400};color:{rgb(o.color)};text-align:{o.align};line-height:{LEADING};transform:translateY({shift[o.bold ? 1 : 0] * o.size * s}px)"
                    oninput={() => direction(o)} onfocus={() => { select(o.id); typing = snap(); }} onblur={() => typed(o)}></textarea>
                  {#if o.id === selected}<div class="corner" title={t('resizeHandle')} onpointerdown={(e) => drag(e, o, 'size')}></div>{/if}
                </div>
              {:else}
                <!-- svelte-ignore a11y_no_static_element_interactions (moved with the pointer; Delete and the options panel work from the keyboard) -->
                <div class="obj pic" class:redact={o.kind === 'redact'} class:on={o.id === selected} data-obj={o.id} style="left:{o.x * s}px;top:{o.y * s}px;width:{o.w * s}px;height:{o.h * s}px;{picture(o)}"
                  onpointerdown={(e) => drag(e, o, 'move')}>
                  {#if o.kind !== 'redact' && o.photo != null}<img src={urls[o.photo]} alt="" draggable="false" />{/if}
                  {#if o.id === selected}<div class="corner" title={t('resizeHandle')} onpointerdown={(e) => drag(e, o, 'size')}></div>{/if}
                </div>
              {/if}
            {/if}
          {/each}
        </div>
      {/if}
    </div>

    <aside class="side" aria-label={t('options')}>
      {#if sel?.kind === 'text'}
        {@const o = sel}
        <h2>{t('textOptions')}</h2>
        <label class="field"><span>{t('fontSize')}</span>
          <select value={o.size} onchange={(e) => change(() => (o.size = +e.currentTarget.value))}>
            {#each SIZES.includes(o.size) ? SIZES : [...SIZES, o.size].sort((a, b) => a - b) as n}<option value={n}>{n}</option>{/each}
          </select>
        </label>
        <div class="field" role="radiogroup" aria-label={t('colour')}><span>{t('colour')}</span>
          <span class="row">
            {#each COLOURS as [name, c]}
              <button class="swatch" role="radio" aria-checked={sameColour(o.color, c)} title={t(name)} aria-label={t(name)} style="--c:{rgb(c)}" onclick={() => change(() => (o.color = c))}></button>
            {/each}
          </span>
        </div>
        <span class="row"><button class="btn" class:on={o.bold} aria-pressed={o.bold} onclick={() => change(() => (o.bold = !o.bold))}><b>{t('bold')}</b></button></span>
        <div class="field"><span>{t('alignment')}</span>
          <span class="row" role="group" aria-label={t('alignment')} dir="ltr">
            {#each [['left', 'alignLeft'], ['center', 'alignCenter'], ['right', 'alignRight']] as [a, k]}
              <button class="btn" class:on={o.align === a} aria-pressed={o.align === a} onclick={() => change(() => { o.align = a as typeof o.align; o.aligned = true; })}>{t(k as Key)}</button>
            {/each}
          </span>
        </div>
        <p class="help">{t('textHelp')}</p>
        {#if o.from && fontInfo}
          <p class="note" class:warn={!!fontInfo.using} data-testid="font-note">{@html icon('info')}<span>{fontText(fontInfo)}</span></p>
          {#if fontInfo.width && fontInfo.width > o.w * 1.18}
            <p class="note warn" data-testid="shrink-note">{@html icon('info')}<span>{t('fontShrink').replace('{pct}', String(Math.round((o.w / fontInfo.width) * 100)))}</span></p>
          {/if}
        {:else}
          <p class="note">{@html icon('info')}<span>{t('fontNote')}</span></p>
        {/if}
        <button class="btn" onclick={remove}>{@html icon('delete')}{t('delete')}</button>
      {:else if sel}
        <h2>{t('photoOptions')}</h2>
        <p class="help">{t('photoHelp')}</p>
        <button class="btn" onclick={() => choosePhoto(true)}>{@html icon('images')}{t('replacePhoto')}</button>
        <button class="btn" onclick={remove}>{@html icon('delete')}{t('delete')}</button>
      {:else}
        <h2>{t('editPage')}</h2>
        <p class="help">{tool === 'text' ? t('placeText') : tool === 'redact' ? t('placeRedact') : t('editorHelp')}</p>
        <p class="note">{@html icon('info')}<span>{t('fontNote')}</span></p>
      {/if}
    </aside>
  </div>
</div>

<style>
  .editor { height: 100%; display: grid; grid-template-rows: auto 1fr; min-height: 0; }
  .tools { display: flex; align-items: center; gap: var(--s-8); padding: var(--s-8) var(--s-16); background: var(--surface); border-bottom: 1px solid var(--line); flex-wrap: wrap; }
  .sep { width: 1px; height: 24px; background: var(--line); }
  .flip { display: grid; transform: scaleX(-1); }
  .where { margin-inline-start: auto; color: var(--muted); }
  .btn.on { background: var(--green-soft); border-color: var(--green); color: var(--green-deep); }
  .body { display: grid; grid-template-columns: 1fr 300px; min-height: 0; }
  .stage { position: relative; overflow: auto; display: grid; place-items: center; padding: var(--s-24); background: var(--canvas); min-height: 0; }
  .busy { position: absolute; inset: 0; z-index: 3; margin: 0; display: grid; place-items: center; background: var(--veil); font-size: var(--fs-16); font-weight: 600; }
  .sheet { position: relative; background: var(--surface); box-shadow: var(--shadow); touch-action: none; }
  .sheet.placing { cursor: text; }
  .sheet canvas { position: absolute; inset: 0; }
  .hit { position: absolute; padding: 0; border: 1px solid transparent; border-radius: 2px; background: transparent; cursor: pointer; }
  .hit:hover, .hit:focus-visible { border-color: var(--green); background: var(--select-tint); }
  .hit.line { cursor: text; }
  .obj { position: absolute; }
  .obj.redact { border: 2px dashed var(--danger); }
  .obj.on { outline: 2px dashed var(--green); outline-offset: 2px; }
  .text textarea { display: block; width: 100%; min-height: 1em; padding: 0; margin: 0; border: 0; background: transparent; resize: none; overflow: hidden; white-space: pre-wrap; font-family: Tajawal, sans-serif; field-sizing: content; outline: none; }
  .text:not(.on):hover { outline: 1px solid var(--green); }
  .grip { position: absolute; left: -2px; right: -2px; bottom: 100%; height: 12px; margin-bottom: 2px; border-radius: 4px 4px 0 0; background: var(--green); cursor: move; }
  .pic { cursor: move; background-repeat: no-repeat; }
  .pic img { width: 100%; height: 100%; object-fit: contain; display: block; pointer-events: none; }
  .corner { position: absolute; right: -8px; bottom: -8px; width: 14px; height: 14px; border: 2px solid var(--surface); border-radius: 50%; background: var(--green); cursor: nwse-resize; }
  .side { display: flex; flex-direction: column; gap: var(--s-16); padding: var(--s-16); background: var(--surface); border-inline-start: 1px solid var(--line); overflow-y: auto; }
  .side h2 { margin: 0; font-size: var(--fs-18); }
  .field { display: grid; gap: var(--s-8); font-weight: 600; }
  .field select { min-height: var(--control); padding: 0 var(--s-12); border: 1px solid var(--line); border-radius: var(--r-8); background: var(--paper); font-weight: 400; }
  .row { display: flex; flex-wrap: wrap; gap: var(--s-8); }
  .swatch { width: var(--control); height: var(--control); border: 1px solid var(--line); border-radius: 50%; background: var(--c); }
  .swatch[aria-checked='true'] { box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--green); }
  .help { margin: 0; color: var(--muted); }
  .note { display: flex; gap: var(--s-8); margin: 0; padding: var(--s-12); border-radius: var(--r-8); background: var(--green-soft); color: var(--ink); }
  .note :global(svg) { flex: none; color: var(--green); }
  .note.warn { background: var(--paper); border: 1px solid var(--green); }
  @media (max-width: 900px) { .body { grid-template-columns: 1fr; grid-template-rows: 1fr auto; } .side { max-height: 40vh; border-inline-start: 0; border-top: 1px solid var(--line); } }
</style>
