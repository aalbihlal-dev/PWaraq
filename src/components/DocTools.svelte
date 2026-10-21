<script lang="ts">
  // Whole-document tools, one screen per task: page numbers and watermark (Edit → Whole document), compress and pages
  // as images (Convert), password protect and unlock (Protect). A preview of page 1 on the left, options on the right.
  // Changes to the document itself go to `onReplace` (then Save as usual); copies (smaller, protected, images) are saved
  // as new files and the open document stays as it is.
  import type { EnginePool } from '../lib/engine/pool';
  import { i18n, t } from '../lib/i18n.svelte';
  import { icon } from '../lib/icons.js';
  import { saveFile } from '../lib/store';
  import { CONVERTIBLE_ACCEPT, desktop, toPdf } from '../lib/convert';
  import { zip } from '../lib/zip';
  import { addUnique } from '../lib/names';

  let { pool, kind, sizes, name, bytes, password, onReplace }: { pool: EnginePool; kind: 'stamp' | 'convert' | 'protect';
    sizes: { w: number; h: number }[]; name: string; bytes: Uint8Array; password?: string; onReplace: (bytes: Uint8Array) => Promise<void> } = $props();
  const base = $derived(name.replace(/\.pdf$/i, ''));
  let busy = $state(''), note = $state(''), error = $state('');
  async function run(label: string, job: () => Promise<void>) {
    busy = label; error = ''; note = '';
    try { await job(); } catch (e) { const msg = String((e as Error)?.message); error = /NEED_OWNER/.test(msg) ? t('needOwner') : /PASSWORD/.test(msg) ? t('wrongPassword') : t('toolFailed'); }
    busy = '';
  }
  const all = () => sizes.map((_, page) => ({ doc: 0, page }));
  const mb = (n: number) => (n / 1048576).toLocaleString(i18n.lang, { maximumFractionDigits: 1 }) + ' MB';

  // preview: page 1, with the numbers and the watermark drawn over it as they will appear
  const P = 300, s0 = $derived(sizes[0]), k = $derived(Math.min(P / s0.w, (P * 1.35) / s0.h));
  let canvas = $state<HTMLCanvasElement>();
  $effect(() => {
    const c = canvas; if (!c) return;
    pool.run<ImageBitmap>({ op: 'render', page: 0, priority: 1, key: 'toolpreview', args: { scale: (P / s0.w) * Math.min(devicePixelRatio || 1, 2) } })
      .then((bmp) => { c.width = bmp.width; c.height = bmp.height; c.getContext('2d')!.drawImage(bmp, 0, 0); bmp.close(); }).catch(() => {});
  });

  // Edit → Whole document
  let numbersOn = $state(true), position = $state<'bl' | 'bc' | 'br' | 'tl' | 'tc' | 'tr'>('bc'), start = $state(1), total = $state(false);
  let markOn = $state(false), markText = $state(''), opacity = $state(20), angle = $state(45);
  const label = $derived(total ? `${start} / ${start + sizes.length - 1}` : String(start));
  const stamp = () => run(t('applying'), async () => {
    const out = await pool.build({ items: all(), numbers: numbersOn, numberStyle: { position, start, total },
      watermark: markOn && markText.trim() ? { text: markText.trim(), opacity: opacity / 100, angle } : undefined });
    await onReplace(out);
  });

  // Convert
  let level = $state<'recommended' | 'small'>('recommended'), dpi = $state(150);
  const shrink = () => run(t('compressing'), async () => {
    const out = await pool.tool('compress', { bytes: bytes.slice(), level, current: password ?? '' });
    if (out.length >= bytes.length) { note = t('alreadySmall'); return; }
    note = `${mb(bytes.length)} → ${mb(out.length)}`;
    await saveFile(out, `${base} (${t('smaller')}).pdf`);
  });
  const images = () => run(t('reading'), async () => {
    const files: Record<string, Uint8Array> = {};
    for (let page = 0; page < sizes.length; page++) {
      const bmp = await pool.run<ImageBitmap>({ op: 'render', page, priority: 1, args: { scale: dpi / 72 } });
      const c = new OffscreenCanvas(bmp.width, bmp.height); c.getContext('2d')!.drawImage(bmp, 0, 0); bmp.close();
      addUnique(files, `${base} ${String(page + 1).padStart(3, '0')}.png`, new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer()));
    }
    if (sizes.length === 1) await saveFile(Object.values(files)[0], `${base}.png`, 'image/png');
    else await saveFile(zip(files), `${base} (${t('images')}).zip`, 'application/zip');
  });

  const canOffice = !!desktop();
  const office = (e: Event & { currentTarget: HTMLInputElement }) => {
    const file = e.currentTarget.files?.[0]; e.currentTarget.value = '';
    if (file) run(t('officeConverting'), async () => {
      try { await saveFile(await toPdf(file), file.name.replace(/\.[^.]+$/, '') + '.pdf'); }
      catch { error = t('officeFailed'); }
    });
  };

  // Protect
  let pw = $state(''), pw2 = $state(''), print = $state(true), copy = $state(false);
  const pwOk = $derived(pw.length >= 4 && pw === pw2 && !pw.includes(','));
  const lock = () => run(t('applying'), async () => {
    await saveFile(await pool.tool('protect', { bytes: bytes.slice(), password: pw, print, copy, current: password ?? '' }), `${base} (${t('protected')}).pdf`);
    note = t('protectedSaved'); pw = pw2 = '';
  });
  // a file with limits (no copy, no print …) opened without its owner password: only a copy with the same limits
  let held = $state<{ restricted: boolean; owner: boolean } | null>(null);
  $effect(() => { pool.tool<typeof held>('guard', { bytes: bytes.slice(), current: password ?? '' }).then((g) => (held = g)).catch(() => {}); });
  const limited = $derived(!!held?.restricted && !held.owner);
  const copyAs = () => run(t('applying'), async () => { await saveFile(bytes, `${base} (${t('copyWord')}).pdf`); });
  const free = () => run(t('applying'), async () => { await onReplace(await pool.tool('unlock', { bytes: bytes.slice(), password: password ?? '' })); });
</script>

<div class="tools">
  <section class="preview" aria-label={t('page') + ' 1'}>
    <div class="sheet" style="width:{s0.w * k}px;height:{s0.h * k}px">
      <canvas bind:this={canvas}></canvas>
      {#if kind === 'stamp'}
        {#if markOn && markText.trim()}<span class="mark" style="opacity:{opacity / 100 + 0.1};transform:translate(-50%,-50%) rotate({-angle}deg)">{markText}</span>{/if}
        {#if numbersOn}<span class="pno num {position}">{label}</span>{/if}
      {/if}
    </div>
    <p class="muted num">{sizes.length} {t('pagesCount')} · {mb(bytes.length)}</p>
  </section>

  <aside class="side">
    {#if kind === 'stamp'}
      <h2>{t('wholeDocument')}</h2>
      <label class="switch"><input type="checkbox" bind:checked={numbersOn} />{t('numbers')}</label>
      {#if numbersOn}
        <label class="field"><span>{t('numberPosition')}</span>
          <select bind:value={position}>
            <option value="bc">{t('posBottomCentre')}</option><option value="br">{t('posBottomRight')}</option><option value="bl">{t('posBottomLeft')}</option>
            <option value="tc">{t('posTopCentre')}</option><option value="tr">{t('posTopRight')}</option><option value="tl">{t('posTopLeft')}</option>
          </select></label>
        <div class="row">
          <label class="field"><span>{t('startAt')}</span><input type="number" min="0" bind:value={start} /></label>
          <label class="switch"><input type="checkbox" bind:checked={total} />{t('withTotal')}</label>
        </div>
      {/if}
      <label class="switch"><input type="checkbox" bind:checked={markOn} />{t('watermark')}</label>
      {#if markOn}
        <label class="field"><span>{t('watermarkText')}</span><input bind:value={markText} placeholder={t('watermarkExample')} /></label>
        <div class="row">
          <label class="field"><span>{t('opacity')} {opacity}%</span><input type="range" min="5" max="60" bind:value={opacity} /></label>
          <label class="field"><span>{t('angle')} {angle}°</span><input type="range" min="0" max="90" step="15" bind:value={angle} /></label>
        </div>
      {/if}
      <span class="grow"></span>
      <button class="btn primary" onclick={stamp} disabled={!!busy || (!numbersOn && !(markOn && markText.trim()))}>{@html icon('check')}{t('applyAll')}</button>
    {:else if kind === 'convert'}
      <h2>{t('compress')}</h2>
      <p class="help">{t('compressHelp')}</p>
      <label class="choice"><input type="radio" bind:group={level} value="recommended" />{t('compressRecommended')}</label>
      <label class="choice"><input type="radio" bind:group={level} value="small" />{t('compressSmall')}</label>
      <button class="btn primary" onclick={shrink} disabled={!!busy}>{@html icon('compress')}{t('compressSave')}</button>
      <h2>{t('images')}</h2>
      <label class="field"><span>{t('resolution')}</span>
        <select bind:value={dpi}><option value={96}>96 dpi</option><option value={150}>150 dpi</option><option value={300}>300 dpi</option></select></label>
      <button class="btn" onclick={images} disabled={!!busy}>{@html icon('png')}{t('imagesSave')}</button>
      <h2>{t('officeTitle')}</h2>
      <p class="help">{canOffice ? t('officeHelp') : t('officeDesktopOnly')}</p>
      <label class="btn" class:disabled={!canOffice || !!busy}>{@html icon('upload')}{t('officeChoose')}
        <input type="file" accept={CONVERTIBLE_ACCEPT} hidden disabled={!canOffice || !!busy} onchange={office} /></label>
    {:else}
      {#if limited}
      <h2>{t('limitedTitle')}</h2>
      <p class="help">{t('limitedHelp')}</p>
      <button class="btn primary" onclick={copyAs} disabled={!!busy}>{@html icon('download')}{t('copySave')}</button>
      {:else}
      <h2>{t('protectTitle')}</h2>
      <p class="help">{t('protectHelp')}</p>
      <label class="field"><span>{t('password')}</span><input type="password" bind:value={pw} autocomplete="new-password" /></label>
      <label class="field"><span>{t('passwordAgain')}</span><input type="password" bind:value={pw2} autocomplete="new-password" /></label>
      {#if pw.includes(',')}<p class="error">{t('noComma')}</p>{/if}
      <label class="switch"><input type="checkbox" bind:checked={print} />{t('allowPrint')}</label>
      <label class="switch"><input type="checkbox" bind:checked={copy} />{t('allowCopy')}</label>
      <button class="btn primary" onclick={lock} disabled={!!busy || !pwOk}>{@html icon('protect')}{t('protectSave')}</button>
      <h2>{t('unlockTitle')}</h2>
      {#if password}
        <p class="help">{t('unlockHelp')}</p>
        <button class="btn" onclick={free} disabled={!!busy}>{@html icon('unlock')}{t('unlockApply')}</button>
      {:else}<p class="help">{t('notLocked')}</p>{/if}
      {/if}
    {/if}
    <p class="state num" aria-live="polite">{busy || note}</p>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
  </aside>
</div>

<style>
  .tools { height: 100%; display: grid; grid-template-columns: 1fr 340px; min-height: 0; }
  .preview { display: grid; place-content: center; justify-items: center; gap: var(--s-12); background: var(--canvas); padding: var(--s-24); overflow: auto; }
  .sheet { position: relative; background: #fff; box-shadow: var(--shadow); overflow: hidden; }
  .sheet canvas { width: 100%; height: 100%; display: block; }
  .mark { position: absolute; left: 50%; top: 50%; white-space: nowrap; font: 700 var(--fs-32)/1 var(--font); color: var(--green); pointer-events: none; }
  .pno { position: absolute; font-size: var(--fs-12); color: var(--muted); }
  .pno.bc, .pno.tc { left: 50%; transform: translateX(-50%); } .pno.bl, .pno.tl { left: 8px; } .pno.br, .pno.tr { right: 8px; }
  .pno.bl, .pno.bc, .pno.br { bottom: 6px; } .pno.tl, .pno.tc, .pno.tr { top: 6px; }
  .muted { margin: 0; color: var(--muted); }
  .side { display: flex; flex-direction: column; gap: var(--s-12); padding: var(--s-16); background: var(--surface); border-inline-start: 1px solid var(--line); overflow-y: auto; }
  h2 { margin: var(--s-8) 0 0; font-size: var(--fs-18); }
  .help { margin: 0; color: var(--muted); }
  .field { display: grid; gap: var(--s-8); font-weight: 600; }
  .field input:not([type='range']), .field select { min-height: var(--control); padding: 0 var(--s-12); border: 1px solid var(--line); border-radius: var(--r-8); background: var(--paper); font-weight: 400; }
  .field input[type='range'] { accent-color: var(--green); min-height: var(--control); }
  .row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-12); align-items: end; }
  .switch, .choice { display: flex; align-items: center; gap: var(--s-8); min-height: var(--control); font-weight: 600; }
  .switch input, .choice input { flex: none; width: 20px; height: 20px; accent-color: var(--green); }
  .grow { flex: 1; }
  label.btn { cursor: pointer; } label.btn.disabled { opacity: 0.5; cursor: not-allowed; }
  .state { margin: 0; color: var(--muted); font-size: var(--fs-12); min-height: 18px; }
  .error { margin: 0; color: var(--danger); }
  @media (max-width: 900px) { .tools { grid-template-columns: 1fr; grid-template-rows: auto 1fr; } .side { border-inline-start: 0; border-top: 1px solid var(--line); } }
</style>
