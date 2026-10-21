<script lang="ts">
  // Signing mode: the page large in the middle with the places that need signing highlighted, the options panel on the
  // right (bars "Signature needed on page N — Go", files to sign, my signature, the session's date, name). One click on
  // a place — or Enter — puts the signature set there; files are signed one after another and saved together.
  import { onMount } from 'svelte';
  import type { EnginePool } from '../lib/engine/pool';
  import { placeSet, setEdits, formatDate, SET, type Spot, type Placed } from '../lib/engine/sign';
  import type { Box } from '../lib/engine/editpage';
  import { autoThreshold, cleanSignature, INKS, type Pixels } from '../lib/signature';
  import { i18n, t, type Key } from '../lib/i18n.svelte';
  import { icon } from '../lib/icons.js';
  import { pickFiles, saveFile, signatureList, keepSignature, dropSignature, type Signature } from '../lib/store';
  import { uid } from '../lib/pages';
  import { buildCms, covered, fromPdfDate, hex, parseCert, pdfDate, timestamp as tsaToken, verifyCms, type Check, type SigEntry } from '../lib/engine/pades';
  import type { Prepared, SigPlan } from '../lib/engine/signcert';
  import { cat } from '../lib/engine/der';
  import { createId, importId, listIds, removeId, unlockId, type DigitalId, type Unlocked } from '../lib/ids';

  let { pool, first, onDone }: { pool: EnginePool; first: { name: string; bytes: Uint8Array; sizes: { w: number; h: number }[] };
    onDone: (signed: Uint8Array | null) => void | Promise<void> } = $props();

  // the files of this sitting; the first is the document open in the workspace (engine source 0)
  type Mark = Placed & { spot?: number; dateSpot?: number };
  type SigInfo = SigEntry & { whole: boolean; check: Check }; // a certificate signature in the file, checked
  type Doc = { name: string; bytes: Uint8Array; doc: number | null; sizes: { w: number; h: number }[]; spots: Spot[] | null; placed: Mark[]; used: number[]; sigs: SigInfo[] | null };
  // svelte-ignore state_referenced_locally (the first file is taken once, when signing mode opens)
  let files = $state<Doc[]>([{ name: first.name, bytes: first.bytes, doc: 0, sizes: first.sizes, spots: null, placed: [], used: [], sigs: null }]);
  let cur = $state(0), page = $state(0), busy = $state('');
  const f = $derived(files[cur]);
  const size = $derived(f.sizes[page] ?? { w: 595, h: 842 });
  // where the last set went: a file without places to sign gets it at the same place (Enter)
  let last = $state<{ page: number; spot: Box & { rtl: boolean } } | null>(null);

  // --- the set: signature (from this device's library), date fixed for the sitting, optional name --------------------
  const prefs = (() => { try { return JSON.parse(localStorage.getItem('waraq-sign') ?? '{}'); } catch { return {}; } })();
  let library = $state<(Signature & { url: string })[]>([]), chosen = $state<string | null>(prefs.sig ?? null);
  let day = $state(new Date().toISOString().slice(0, 10)); // the session's date: today unless changed
  let calendar = $state<'gregory' | 'islamic-umalqura'>(prefs.calendar ?? 'gregory'), style = $state<'numeric' | 'long' | 'iso'>(prefs.style ?? 'numeric'), digits = $state<'latn' | 'arab'>(prefs.digits ?? 'latn');
  let name = $state<string>(prefs.name ?? '');
  $effect(() => { try { localStorage.setItem('waraq-sign', JSON.stringify({ sig: chosen, calendar, style, digits, name, id: idKey, useCert, tsa })); } catch {} });
  const sig = $derived(library.find((s) => s.key === chosen) ?? library[0]);
  const dateText = $derived(formatDate(new Date(day + 'T12:00'), calendar, style, i18n.lang, digits));
  const set = $derived({ ratio: sig ? sig.w / sig.h : 3, name, date: dateText });
  const textColour = $derived(sig?.ink ?? [0, 0, 0]);

  async function loadLibrary() {
    library.forEach((s) => URL.revokeObjectURL(s.url));
    library = (await signatureList()).map((s) => ({ ...s, url: URL.createObjectURL(s.png) }));
    if (!library.length) making = true;
  }

  // --- making a signature: draw, type or a photo; always cleaned (paper away, cropped, one colour) ---------------------
  let making = $state(false), how = $state<'draw' | 'type' | 'photo'>('draw'), ink = $state<keyof typeof INKS>('black');
  let raw: Pixels | null = null, threshold = $state(200), typed = $state(''), drawn = $state(false), hasPhoto = $state(false);
  let pad = $state<HTMLCanvasElement>(), preview = $state<HTMLCanvasElement>(), photoInput: HTMLInputElement;
  let clean = $state<Pixels | null>(null);
  const pixelsOf = (c: HTMLCanvasElement | OffscreenCanvas): Pixels => { const d = (c.getContext('2d') as CanvasRenderingContext2D).getImageData(0, 0, c.width, c.height); return { data: d.data, width: d.width, height: d.height }; };
  function refresh() {
    if (how === 'draw' && pad && drawn) raw = pixelsOf(pad);
    if (how === 'type') {
      raw = null;
      if (typed.trim()) {
        // the text's own direction (a name that starts with Arabic reads right to left, even with Latin words or digits in it); a long
        // name gets a smaller type, never a squeezed one; Arabic is upright (a slanted Arabic is not a style of the script)
        const c = new OffscreenCanvas(1400, 320), x = c.getContext('2d')!, text = typed.trim(), arabic = /[؀-ۿ]/.test(text), first = text.match(/[\p{L}]/u)?.[0] ?? '';
        const face = (px: number) => `${arabic ? '' : 'italic '}700 ${px}px Tajawal`;
        x.direction = /[֐-ࣿ]/.test(first) ? 'rtl' : 'ltr'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.font = face(160); const room = 1360, wide = x.measureText(text).width, px = wide > room ? Math.max(40, Math.floor((160 * room) / wide)) : 160;
        x.font = face(px); x.fillText(text, 700, 160);
        raw = pixelsOf(c);
      }
    }
    if ((how === 'draw' && !drawn) || (how === 'photo' && !hasPhoto)) raw = null;
    clean = raw ? cleanSignature(raw, threshold, INKS[ink] as unknown as number[]) : null;
    if (preview && clean && clean.width > 1) {
      preview.width = clean.width; preview.height = clean.height;
      preview.getContext('2d')!.putImageData(new ImageData(clean.data as Uint8ClampedArray<ArrayBuffer>, clean.width, clean.height), 0, 0);
    }
  }
  function tab(next: typeof how) { how = next; threshold = 200; if (next === 'photo' && raw && hasPhoto) threshold = autoThreshold(raw); refresh(); }
  function stroke(e: PointerEvent) {
    if (!pad) return;
    const c = pad.getContext('2d')!, r = pad.getBoundingClientRect(), k = pad.width / r.width;
    const at = (ev: PointerEvent) => [(ev.clientX - r.left) * k, (ev.clientY - r.top) * k] as const;
    c.lineWidth = 7; c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = '#000';
    c.beginPath(); c.moveTo(...at(e)); c.lineTo(...at(e)); c.stroke();
    pad.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => { c.lineTo(...at(ev)); c.stroke(); };
    const up = () => { pad!.removeEventListener('pointermove', move); pad!.removeEventListener('pointerup', up); drawn = true; refresh(); };
    pad.addEventListener('pointermove', move); pad.addEventListener('pointerup', up);
  }
  function clearPad() { pad?.getContext('2d')!.clearRect(0, 0, pad.width, pad.height); drawn = false; refresh(); }
  async function choosePhoto() {
    const [p] = await pickFiles({ accept: { 'image/*': ['.png', '.jpg', '.jpeg'] }, fallback: () => photoInput.click() });
    if (p) usePhoto(p.file);
  }
  async function usePhoto(file: File) {
    let bmp: ImageBitmap;
    try { bmp = await createImageBitmap(file); } catch { alert(t('notImage')); return; }
    const k = Math.min(1, 1600 / bmp.width), c = new OffscreenCanvas(Math.round(bmp.width * k), Math.round(bmp.height * k));
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height); bmp.close();
    raw = pixelsOf(c); hasPhoto = true; threshold = autoThreshold(raw); refresh();
  }
  async function saveSignature() {
    if (!clean || clean.width < 2) return;
    const c = new OffscreenCanvas(clean.width, clean.height);
    c.getContext('2d')!.putImageData(new ImageData(clean.data as Uint8ClampedArray<ArrayBuffer>, clean.width, clean.height), 0, 0);
    const key = uid();
    await keepSignature({ key, png: await c.convertToBlob({ type: 'image/png' }), w: clean.width, h: clean.height, at: Date.now(), ink: INKS[ink].map((v) => +(v / 255).toFixed(3)) });
    chosen = key; making = false; clearPad(); typed = ''; hasPhoto = false;
    await loadLibrary();
  }
  async function deleteSignature(key: string) { await dropSignature(key); if (chosen === key) chosen = null; await loadLibrary(); }

  // --- files: opened in the engine and searched for places to sign the first time they are shown ---------------------
  async function ready(d: Doc) {
    if (d.doc == null) { const a = await pool.add(d.bytes.slice()); d.sizes = a.sizes; d.doc = a.id; }
    if (!d.spots) {
      const found: Spot[] = await pool.run({ op: 'spots', priority: 1, any: true, args: { bytes: d.bytes.slice() } });
      d.spots = found.sort((a, b) => a.page - b.page || a.y - b.y || (a.kind === 'sign' ? -1 : 1));
    }
    if (!d.sigs) d.sigs = await verifyAll(d.bytes, d.doc === 0 ? pool.password : '');
  }
  // --- certificate signatures in the file: listed by the engine, checked here with WebCrypto (maths only) --------------
  async function verifyAll(bytes: Uint8Array, password: string): Promise<SigInfo[]> {
    try {
      const list = await pool.run<SigEntry[]>({ op: 'siglist', priority: 1, any: true, args: { bytes: bytes.slice(), password } });
      const out: SigInfo[] = [];
      for (const s of list) { const c = covered(bytes, s.byteRange); out.push({ ...s, whole: c.whole, check: await verifyCms(s.contents, c.ranges) }); }
      return out;
    } catch { return []; }
  }
  const status = (sigs: SigInfo[]): Key => (sigs.some((s) => !s.check.ok) ? 'sigInvalid' : sigs.at(-1)!.whole ? 'sigValid' : 'sigChanged');
  const sigHelp = (s: SigInfo): Key => (s.check.problem ? 'sigUnsupported' : !s.check.signatureOk ? 'sigBadKey' : !s.check.digestOk ? 'sigBrokenHelp' : s.whole ? 'sigValidHelp' : 'sigChangedHelp');
  const when = (d: Date | null) => d?.toLocaleString(i18n.lang === 'ar' ? 'ar-u-nu-latn' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }) ?? '';

  // --- digital IDs on this device; the chosen one signs when "Also sign with my digital ID" is on ----------------------
  let ids = $state<DigitalId[]>([]), idKey = $state<string | null>(prefs.id ?? null), useCert = $state(!!prefs.useCert);
  let pass = $state(''), reason = $state(''), location = $state(''), tsa = $state<string>(prefs.tsa ?? '');
  // drawing a set into a page rewrites it: every certificate signature already in the file would stop matching
  const breaking = $derived(!!f.sigs?.length && f.placed.length > (useCert ? 1 : 0));
  let idForm = $state<'' | 'new' | 'import'>(''), idBusy = $state(false);
  let newName = $state<string>(prefs.name ?? ''), newEmail = $state(''), newAlg = $state<'rsa' | 'p256'>('rsa'), newYears = $state(3), pass1 = $state(''), pass2 = $state('');
  let pfx = $state<{ name: string; bytes: Uint8Array } | null>(null), pfxPass = $state(''), pfxInput: HTMLInputElement;
  let unlocked: Unlocked | null = null; // the key for this sitting, never written anywhere
  const id = $derived(ids.find((i) => i.key === idKey) ?? ids[0]);
  const passOk = $derived(pass1.length >= 8 && pass1 === pass2);
  async function loadIds() { ids = await listIds(); }
  async function makeNewId() {
    idBusy = true;
    try { const i = await createId({ name: newName, email: newEmail, alg: newAlg, years: newYears }, pass1); idKey = i.key; idForm = ''; pass1 = pass2 = ''; await loadIds(); }
    catch (e) { alert(String((e as Error).message || e)); }
    idBusy = false;
  }
  async function choosePfx() {
    const [p] = await pickFiles({ accept: { 'application/x-pkcs12': ['.pfx', '.p12'] }, fallback: () => pfxInput.click() });
    if (p) pfx = { name: p.file.name, bytes: new Uint8Array(await p.file.arrayBuffer()) };
  }
  async function doImport() {
    if (!pfx) return;
    idBusy = true;
    try { const i = await importId(pfx.bytes, pfxPass, pass1); idKey = i.key; idForm = ''; pfx = null; pfxPass = pass1 = pass2 = ''; await loadIds(); }
    catch (e) { const m = (e as Error).message; alert(t(m === 'WRONG_PASSWORD' ? 'wrongPfx' : m === 'NO_KEY' ? 'pfxNoKey' : 'pfxUnsupported')); }
    idBusy = false;
  }
  async function dropIdClick(key: string) {
    if (!confirm(t('confirmRemoveId'))) return;
    await removeId(key); if (idKey === key) idKey = null; unlocked = null; await loadIds();
  }
  /** The file certificate-signed: the first placed set is the visible stamp (in the clicked empty field when there is one),
   *  the other sets are drawn into the pages first; the engine appends the update, the CMS is made here and written in. */
  async function certSign(d: Doc, signer: Unlocked, png: Uint8Array, password: string, pagesOf: (list: Mark[]) => { page: number; edits: ReturnType<typeof setEdits> }[]) {
    const [head, ...rest] = d.placed, spot = head.spot != null ? d.spots![head.spot] : undefined;
    const boxes = [head.sig, head.name, head.date].filter((b): b is Box => !!b), x = Math.min(...boxes.map((b) => b.x)), y = Math.min(...boxes.map((b) => b.y));
    const url = tsa.trim();
    const plan: SigPlan = { page: head.page, rect: { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y }, field: spot?.field ? spot.name : undefined,
      edits: setEdits(set, head, textColour), name: signer.cert.name, reason: reason.trim() || undefined, location: location.trim() || undefined, time: pdfDate(new Date()),
      room: signer.id.cert.length + signer.id.chain.reduce((n, c) => n + c.length, 0) + 2048 + (url ? 8192 : 0), drawn: pagesOf(rest) };
    const p = await pool.run<Prepared>({ op: 'sigprepare', priority: 0, any: true, args: { bytes: d.bytes.slice(), password, plan: $state.snapshot(plan), photos: [png.slice()] } });
    const c = covered(p.bytes, p.byteRange), digest = new Uint8Array(await crypto.subtle.digest('SHA-256', cat(...c.ranges) as Uint8Array<ArrayBuffer>));
    const cms = await buildCms({ key: signer.key, cert: signer.id.cert, chain: signer.id.chain, alg: signer.id.alg }, digest, url ? (sig) => tsaToken(url, sig) : undefined);
    p.bytes.set(new TextEncoder().encode(hex(cms)), p.contentsAt);
    return p.bytes;
  }
  const targets = (d: Doc) => (d.spots ?? []).map((s, i) => ({ s, i })).filter(({ s, i }) => s.kind === 'sign' && !d.used.includes(i));
  async function show(i: number) {
    cur = i; busy = t('findingSpots');
    try { await ready(files[i]); } finally { busy = ''; }
    const d = files[i], next = targets(d)[0];
    page = next ? next.s.page : !d.spots?.length && last ? Math.min(last.page, d.sizes.length - 1) : 0;
  }
  onMount(() => { loadLibrary(); loadIds(); show(0); measure(); return () => library.forEach((s) => URL.revokeObjectURL(s.url)); });

  async function addFiles() {
    const picked = await pickFiles({ multiple: true, accept: { 'application/pdf': ['.pdf'] }, fallback: () => fileInput.click() });
    await useFiles(picked.map((p) => p.file));
  }
  let fileInput: HTMLInputElement;
  async function useFiles(list: File[]) {
    for (const file of list) files.push({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()), doc: null, sizes: [], spots: null, placed: [], used: [], sigs: null });
  }

  // --- placing the set -------------------------------------------------------------------------------------------------
  // a date place on the same page close to the signature place goes with it
  function pairedDate(d: Doc, s: Spot) {
    let best: { i: number; s: Spot } | undefined;
    (d.spots ?? []).forEach((x, i) => {
      if (x.kind !== 'date' || x.page !== s.page || d.used.includes(i) || Math.abs(x.y - s.y) > 150) return;
      if (!best || Math.abs(x.y - s.y) < Math.abs(best.s.y - s.y)) best = { i, s: x };
    });
    return best;
  }
  function place(spot: Box & { rtl: boolean; field?: boolean }, at: number, i?: number) {
    if (!sig) { making = true; return; }
    const d = files[cur], date = i != null ? pairedDate(d, d.spots![i]) : undefined;
    d.placed.push({ ...placeSet(set, spot, date?.s), page: at, spot: i, dateSpot: date?.i });
    if (i != null) d.used.push(i);
    if (date) d.used.push(date.i);
    last = { page: at, spot: { x: spot.x, y: spot.y, w: spot.w, h: spot.h, rtl: spot.rtl, field: spot.field } as Box & { rtl: boolean } };
  }
  // a click on the page (not on a place): the signature sits on the line under the pointer
  function pageClick(e: MouseEvent) {
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).matches('canvas')) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect(), x = (e.clientX - r.left) / s, y = (e.clientY - r.top) / s;
    place({ x: x - SET.width / 2, y: y - 8, w: SET.width, h: 12, rtl: i18n.lang === 'ar' }, page);
  }
  // Enter: sign the next place (or the last file's place in a file without any), then go on to the next place or file
  const ghost = $derived(!f.spots?.length && !f.placed.length && last && sig ? last : null);
  async function signNext() {
    const d = files[cur], next = targets(d)[0];
    if (next) place(next.s, next.s.page, next.i);
    else if (ghost) place(ghost.spot, Math.min(ghost.page, d.sizes.length - 1));
    else if (!d.placed.length) return; // nothing to sign here yet: click the page first
    const more = targets(d)[0];
    if (more) page = more.s.page;
    else if (cur < files.length - 1) await show(cur + 1);
  }
  function undo() { const d = files[cur], p = d.placed.pop(); if (p) d.used = d.used.filter((i) => i !== p.spot && i !== p.dateSpot); }

  async function saveAll() {
    busy = t('savingSigned');
    try {
      let signer: Unlocked | null = null;
      if (useCert) {
        if (!id || (!pass && unlocked?.id.key !== id.key)) { alert(t('needId')); busy = ''; return; }
        if (unlocked?.id.key !== id.key) { try { unlocked = await unlockId(id, pass); } catch { alert(t('wrongPassphrase')); busy = ''; return; } }
        signer = unlocked; pass = '';
      }
      const png = new Uint8Array(await sig!.png.arrayBuffer());
      const pagesOf = (list: Mark[]) => [...new Set(list.map((p) => p.page))].map((pg) => ({ page: pg, edits: list.filter((p) => p.page === pg).flatMap((p) => setEdits(set, p, textColour)) }));
      let firstSigned: Uint8Array | null = null;
      for (const [n, d] of files.entries()) {
        if (!d.placed.length) continue;
        const password = n === 0 ? pool.password : '';
        let bytes: Uint8Array;
        if (signer) { busy = t('signingCert'); bytes = await certSign(d, signer, png, password, pagesOf); }
        else bytes = await pool.run<Uint8Array>({ op: 'sign', priority: 0, any: true, args: { bytes: d.bytes.slice(), pages: $state.snapshot(pagesOf(d.placed)), photos: [png.slice()], password } });
        await saveFile(bytes, d.name.replace(/\.pdf$/i, '') + '-signed.pdf');
        if (n === 0) firstSigned = bytes;
      }
      await onDone(firstSigned); // the signed file becomes the open document (a fresh workspace, in View)
    } catch (e) { const m = String((e as Error).message || e); alert(m.startsWith('TSA_') ? t('tsaFailed') : m); }
    busy = '';
  }

  // --- the page --------------------------------------------------------------------------------------------------------
  let sw = $state(0), sh = $state(0), canvas = $state<HTMLCanvasElement>();
  const s = $derived(sw && sh ? Math.max(0.2, Math.min((sw - 48) / size.w, (sh - 48) / size.h)) : 0);
  $effect(() => {
    const doc = f.doc, c = canvas;
    if (doc == null || !s || !c) return;
    const scale = s * Math.min(devicePixelRatio || 1, 2);
    pool.run<ImageBitmap>({ op: 'render', page, priority: 0, key: 'sign', args: { doc, page, scale } }).then((bmp) => {
      c.width = bmp.width; c.height = bmp.height; c.getContext('2d')!.drawImage(bmp, 0, 0); bmp.close();
    }).catch(() => {});
  });
  const union = (a: Box, b?: Box) => (b ? { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.max(a.x + a.w, b.x + b.w) - Math.min(a.x, b.x), h: Math.max(a.y + a.h, b.y + b.h) - Math.min(a.y, b.y) } : a);
  const at = (b: Box) => `left:${b.x * s}px;top:${b.y * s}px;width:${b.w * s}px;height:${b.h * s}px`;
  const rgb = (c: number[]) => `rgb(${c.map((v) => Math.round(v * 255)).join(' ')})`;
  const needs = $derived([...new Set(targets(f).map(({ s }) => s.page))]);
  const nextSpot = $derived(targets(f)[0]?.i);
  // the browser's first baseline vs the engine's, as in the page editor
  let shift = $state(0);
  async function measure() {
    try {
      await document.fonts.load('400 100px Tajawal');
      const c = document.createElement('canvas').getContext('2d')!; c.font = '400 100px Tajawal';
      const m = c.measureText('Hgا'), a = m.fontBoundingBoxAscent / 100, d = m.fontBoundingBoxDescent / 100;
      shift = 1 - ((SET.lead - a - d) / 2 + a);
    } catch {}
  }

  function keys(e: KeyboardEvent) {
    if ((e.target as HTMLElement).closest('textarea,input,select,button')) return;
    if (e.key === 'Enter') { e.preventDefault(); signNext(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
  }
  const SWATCHES: [keyof typeof INKS, Key][] = [['black', 'black'], ['inkColour', 'inkColour'], ['blueColour', 'blueColour'], ['greenColour', 'greenColour']];
  const css = (c: readonly number[]) => `rgb(${c.join(' ')})`;
</script>

<svelte:window onkeydown={keys} />
<input bind:this={photoInput} type="file" accept="image/png,image/jpeg" hidden onchange={(e) => { const p = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (p) usePhoto(p); }} />
<input bind:this={fileInput} type="file" accept="application/pdf,.pdf" multiple hidden onchange={(e) => { const l = [...(e.currentTarget.files ?? [])]; e.currentTarget.value = ''; useFiles(l); }} />
<input bind:this={pfxInput} type="file" accept=".pfx,.p12,application/x-pkcs12" hidden onchange={async (e) => { const p = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (p) pfx = { name: p.name, bytes: new Uint8Array(await p.arrayBuffer()) }; }} />
<div class="signing">
  <div class="tools" role="toolbar" aria-label={t('sign')}>
    <span class="where num" title={f.name}>{f.name} · {cur + 1} / {files.length}</span>
    <span class="sep"></span>
    <button class="btn icon" onclick={() => (page = Math.max(0, page - 1))} disabled={page === 0} title={t('prevPage')} aria-label={t('prevPage')}><span class="back">{@html icon('arrow')}</span></button>
    <span class="num muted">{t('page')} {page + 1} {t('of')} {f.sizes.length}</span>
    <button class="btn icon" onclick={() => (page = Math.min(f.sizes.length - 1, page + 1))} disabled={page >= f.sizes.length - 1} title={t('nextPage')} aria-label={t('nextPage')}><span class="fwd">{@html icon('arrow')}</span></button>
    <span class="sep"></span>
    <button class="btn icon" onclick={undo} disabled={!f.placed.length} title={t('undo')} aria-label={t('undo')}>{@html icon('undo')}</button>
    {#if f.sigs?.length}
      {@const st = status(f.sigs)}
      <span class="badge" class:bad={st !== 'sigValid'} role="status">{@html icon(st === 'sigValid' ? 'shield' : 'warning')}<span class="num">{f.sigs.length}</span> {t(f.sigs.length === 1 ? 'signature1' : 'signatureN')} · {t(st)}</span>
    {/if}
    <span class="end">
      <button class="btn primary" onclick={signNext} disabled={!!busy || !sig}>{@html icon('signature')}{t('signNext')} <kbd>Enter</kbd></button>
      <button class="btn" onclick={saveAll} disabled={!!busy || !files.some((d) => d.placed.length)}>{@html icon('download')}{t('saveAll')}</button>
    </span>
  </div>

  <div class="body">
    <div class="stage" bind:clientWidth={sw} bind:clientHeight={sh}>
      {#if busy}<p class="busy" role="status">{busy}</p>{/if}
      {#if s}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions (the page itself: a click signs there; Enter and the panel work from the keyboard) -->
        <div class="sheet" dir="ltr" style="width:{size.w * s}px;height:{size.h * s}px" onclick={pageClick}>
          <canvas bind:this={canvas} style="width:{size.w * s}px;height:{size.h * s}px"></canvas>
          {#each f.spots ?? [] as spot, i}
            {#if spot.page === page && !f.used.includes(i)}
              {#if spot.kind === 'sign'}
                <button class="spot" class:next={i === nextSpot} style={at(union(spot, spot.label))} aria-label="{t('sign')} — {t('page')} {page + 1}"
                  onclick={(e) => { e.stopPropagation(); place(spot, page, i); }}></button>
              {:else}<span class="spot date" style={at(union(spot, spot.label))}></span>{/if}
            {/if}
          {/each}
          {#if ghost && Math.min(ghost.page, f.sizes.length - 1) === page}
            {@const g = placeSet(set, ghost.spot)}
            <span class="ghost" style={at(g.sig)}>{t('sameAsLast')}</span>
          {/if}
          {#each f.placed as p}
            {#if p.page === page && sig}
              <img class="set" src={sig.url} alt={t('mySignature')} style={at(p.sig)} />
              {#each [[p.name, name], [p.date, dateText]] as [b, text]}
                {#if b && String(text).trim()}
                  {@const box = b as Box}
                  <span class="settext" style="{at(box)};font-size:{SET.text * s}px;color:{rgb(textColour)};text-align:{p.onDate ? (p.rtl ? 'right' : 'left') : 'center'};transform:translateY({shift * SET.text * s}px)">{text}</span>
                {/if}
              {/each}
            {/if}
          {/each}
        </div>
      {/if}
    </div>

    <aside class="side" aria-label={t('options')}>
      {#if f.sigs?.length}
        <section aria-label={t('signatures')}>
          <h2>{t('signatures')}</h2>
          <ul class="files">
            {#each f.sigs as s}
              <li class="sigitem" class:bad={!s.check.ok}>
                <span class="between"><span class="fname">{s.check.cert?.name || s.name || '?'}</span><span class="num muted">{t('page')} {s.page + 1}</span></span>
                {#if fromPdfDate(s.time)}<span class="num muted">{when(fromPdfDate(s.time))}</span>{/if}
                <span class="state">{@html icon(s.check.ok ? (s.whole ? 'check' : 'info') : 'warning')}<span>{t(sigHelp(s))}</span></span>
                {#if s.check.cert?.selfSigned}<span class="help">{t('sigSelf')}</span>{/if}
                {#if s.check.cert && !s.check.certValid}<span class="help">{t('sigExpired')}</span>{/if}
                {#if s.reason || s.location}<span class="help" dir="auto">{[s.reason, s.location].filter(Boolean).join(' · ')}</span>{/if}
                {#if s.check.timestamped}<span class="help">{t('sigTimestamped')} {when(s.check.signedAt)}</span>{/if}
              </li>
            {/each}
          </ul>
        </section>
      {/if}
      {#if breaking}<p class="note warn" role="status">{@html icon('warning')}<span>{t('breakWarn')}</span></p>{/if}
      {#if f.spots}
        {#each needs as n}
          <div class="need" role="status"><span>{t('needSign')} {n + 1}</span><button class="btn" onclick={() => (page = n)}>{t('go')}</button></div>
        {:else}
          <p class="note">{@html icon('info')}<span>{f.spots.length ? t('allSigned') : t('noSpots')}</span></p>
        {/each}
      {/if}
      <p class="help">{t('placeHelp')}</p>

      <section>
        <h2>{t('filesToSign')}</h2>
        <ul class="files">
          {#each files as d, i}
            <li><button class="file" class:on={i === cur} onclick={() => show(i)}>
              <span class="fname" title={d.name}>{d.name}</span>
              <span class="num muted">{d.placed.length ? `${d.placed.length} ${t('signedCount')}` : t('notSigned')}</span>
            </button></li>
          {/each}
        </ul>
        <button class="btn" onclick={addFiles}>{@html icon('plus')}{t('addFiles')}</button>
      </section>

      <section>
        <h2>{t('mySignature')}</h2>
        {#if library.length}
          <div class="lib" role="radiogroup" aria-label={t('mySignature')}>
            {#each library as l (l.key)}
              <span class="libitem">
                <button class="sigbtn" role="radio" aria-checked={l.key === sig?.key} aria-label={t('useSignature')} onclick={() => (chosen = l.key)}><img src={l.url} alt="" /></button>
                <button class="btn icon" onclick={() => deleteSignature(l.key)} title={t('deleteSignature')} aria-label={t('deleteSignature')}>{@html icon('delete')}</button>
              </span>
            {/each}
          </div>
        {:else}<p class="help">{t('noSignature')}</p>{/if}
        {#if making}
          <div class="maker">
            <div class="row" role="tablist" aria-label={t('newSignature')}>
              {#each [['draw', 'drawTab'], ['type', 'typeTab'], ['photo', 'photoTab']] as [k, label]}
                <button class="btn" role="tab" class:on={how === k} aria-selected={how === k} onclick={() => tab(k as typeof how)}>{t(label as Key)}</button>
              {/each}
            </div>
            {#if how === 'draw'}
              <canvas class="pad" bind:this={pad} width="560" height="200" aria-label={t('drawHere')} onpointerdown={stroke}></canvas>
              <button class="btn" onclick={clearPad}>{@html icon('clear')}{t('clearPad')}</button>
            {:else if how === 'type'}
              <label class="field"><span>{t('typeSignature')}</span><input bind:value={typed} oninput={refresh} dir="auto" /></label>
            {:else}
              <button class="btn" onclick={choosePhoto}>{@html icon('images')}{t('choosePhoto')}</button>
              {#if hasPhoto}
                <label class="field"><span>{t('paperRemoval')} <span class="num muted">{threshold}</span></span>
                  <input type="range" min="1" max="255" bind:value={threshold} oninput={refresh} /></label>
                <p class="help">{t('paperHelp')}</p>
              {/if}
            {/if}
            <div class="field" role="radiogroup" aria-label={t('colour')}><span>{t('colour')}</span>
              <span class="row">
                {#each SWATCHES as [k, label]}
                  <button class="swatch" role="radio" aria-checked={ink === k} title={t(label)} aria-label={t(label)} style="--c:{css(INKS[k])}" onclick={() => { ink = k; refresh(); }}></button>
                {/each}
              </span>
            </div>
            <canvas class="preview" class:empty={!clean || clean.width < 2} bind:this={preview} width="1" height="1"></canvas>
            <span class="row">
              <button class="btn primary" onclick={saveSignature} disabled={!clean || clean.width < 2}>{@html icon('check')}{t('saveSignature')}</button>
              {#if library.length}<button class="btn" onclick={() => (making = false)}>{t('cancel')}</button>{/if}
            </span>
          </div>
        {:else}
          <button class="btn" onclick={() => { making = true; refresh(); }}>{@html icon('plus')}{t('newSignature')}</button>
        {/if}
      </section>

      <section>
        <h2>{t('digitalId')}</h2>
        <label class="check"><input type="checkbox" bind:checked={useCert} /><span>{t('useCert')}</span></label>
        <p class="help">{t('useCertHelp')}</p>
        {#if useCert}
          {#if ids.length}
            <div class="lib" role="radiogroup" aria-label={t('digitalId')}>
              {#each ids as i (i.key)}
                {@const c = parseCert(i.cert)}
                <span class="libitem">
                  <button class="file idbtn" class:on={i.key === id?.key} role="radio" aria-checked={i.key === id?.key} onclick={() => (idKey = i.key)}>
                    <span class="fname">{c.name}</span>
                    <span class="num muted">{c.email ? c.email + ' · ' : ''}{t('validUntil')} {c.notAfter.toLocaleDateString(i18n.lang === 'ar' ? 'ar-u-nu-latn' : 'en-GB')}{c.selfSigned ? ' · ' + t('selfSignedShort') : ''}</span>
                  </button>
                  <button class="btn icon" onclick={() => dropIdClick(i.key)} title={t('removeId')} aria-label={t('removeId')}>{@html icon('delete')}</button>
                </span>
              {/each}
            </div>
            <label class="field"><span>{t('passphrase')}</span><input class="input" type="password" bind:value={pass} autocomplete="off" /></label>
            <p class="help">{t('passOnceHelp')}</p>
          {:else}<p class="help">{t('noIds')}</p>{/if}
          {#if idForm}
            <div class="maker">
              {#if idForm === 'new'}
                <label class="field"><span>{t('fullName')}</span><input class="input" bind:value={newName} dir="auto" /></label>
                <label class="field"><span>{t('emailOptional')}</span><input class="input" type="email" bind:value={newEmail} dir="ltr" /></label>
                <div class="field" role="radiogroup" aria-label={t('keyType')}><span>{t('keyType')}</span>
                  <span class="row">
                    <button class="btn" role="radio" class:on={newAlg === 'rsa'} aria-checked={newAlg === 'rsa'} onclick={() => (newAlg = 'rsa')}>{t('keyRsa')}</button>
                    <button class="btn" role="radio" class:on={newAlg === 'p256'} aria-checked={newAlg === 'p256'} onclick={() => (newAlg = 'p256')}>{t('keyEc')}</button>
                  </span>
                </div>
                <label class="field"><span>{t('validity')}</span>
                  <select bind:value={newYears}>{#each [[1, 'years1'], [3, 'years3'], [5, 'years5'], [10, 'years10']] as [y, k]}<option value={y}>{t(k as Key)}</option>{/each}</select>
                </label>
              {:else}
                <button class="btn" onclick={choosePfx}>{@html icon('upload')}{pfx ? pfx.name : t('choosePfx')}</button>
                <label class="field"><span>{t('pfxPassword')}</span><input class="input" type="password" bind:value={pfxPass} autocomplete="off" /></label>
                <p class="help">{t('pfxHelp')}</p>
              {/if}
              <label class="field"><span>{t('passphrase')}</span><input class="input" type="password" bind:value={pass1} autocomplete="new-password" /></label>
              <label class="field"><span>{t('passphraseAgain')}</span><input class="input" type="password" bind:value={pass2} autocomplete="new-password" /></label>
              <p class="help">{passOk ? t('passphraseHelp') : t('passphraseShort')}</p>
              <span class="row">
                {#if idForm === 'new'}<button class="btn primary" onclick={makeNewId} disabled={idBusy || !newName.trim() || !passOk}>{@html icon('check')}{t('createId')}</button>
                {:else}<button class="btn primary" onclick={doImport} disabled={idBusy || !pfx || !passOk}>{@html icon('check')}{t('doImport')}</button>{/if}
                <button class="btn" onclick={() => (idForm = '')}>{t('cancel')}</button>
              </span>
            </div>
          {:else}
            <span class="row"><button class="btn" onclick={() => (idForm = 'new')}>{@html icon('plus')}{t('newId')}</button><button class="btn" onclick={() => (idForm = 'import')}>{@html icon('upload')}{t('importId')}</button></span>
          {/if}
          <label class="field"><span>{t('sigReason')}</span><input class="input" bind:value={reason} dir="auto" /></label>
          <label class="field"><span>{t('sigLocation')}</span><input class="input" bind:value={location} dir="auto" /></label>
          <label class="field"><span>{t('timestampUrl')}</span><input class="input" type="url" bind:value={tsa} placeholder="https://" dir="ltr" /></label>
          <p class="help">{t('timestampHelp')}</p>
        {/if}
      </section>

      <section>
        <h2>{t('dateLabel')}</h2>
        <input class="input" type="date" bind:value={day} aria-label={t('dateLabel')} />
        <div class="row" role="radiogroup" aria-label={t('calendar')}>
          <button class="btn" role="radio" class:on={calendar === 'gregory'} aria-checked={calendar === 'gregory'} onclick={() => (calendar = 'gregory')}>{t('gregorian')}</button>
          <button class="btn" role="radio" class:on={calendar !== 'gregory'} aria-checked={calendar !== 'gregory'} onclick={() => (calendar = 'islamic-umalqura')}>{t('hijri')}</button>
        </div>
        <div class="row" role="radiogroup" aria-label={t('digitsLabel')}>
          <button class="btn" role="radio" class:on={digits === 'latn'} aria-checked={digits === 'latn'} onclick={() => (digits = 'latn')}>{t('digitsWestern')}</button>
          <button class="btn" role="radio" class:on={digits === 'arab'} aria-checked={digits === 'arab'} onclick={() => (digits = 'arab')}>{t('digitsArabic')}</button>
        </div>
        <label class="field"><span>{t('dateFormat')}</span>
          <select bind:value={style}>
            <option value="numeric">{t('fmtNumeric')}</option><option value="long">{t('fmtLong')}</option><option value="iso">{t('fmtIso')}</option>
          </select>
        </label>
        <p class="datetext num" aria-live="polite">{dateText}</p>
        <p class="help">{t('sameDate')}</p>
      </section>

      <label class="field"><span>{t('nameUnder')}</span><input class="input" bind:value={name} dir="auto" /></label>
    </aside>
  </div>
</div>

<style>
  .signing { height: 100%; display: grid; grid-template-rows: auto 1fr; min-height: 0; }
  .tools { display: flex; align-items: center; gap: var(--s-8); padding: var(--s-8) var(--s-16); background: var(--surface); border-bottom: 1px solid var(--line); flex-wrap: wrap; }
  .where { max-width: 32ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
  .sep { width: 1px; height: 24px; background: var(--line); }
  .muted { color: var(--muted); }
  .back, .fwd { display: grid; }
  .back { transform: scaleX(-1); }
  :global([dir='rtl']) .back { transform: none; }
  :global([dir='rtl']) .fwd { transform: scaleX(-1); }
  .end { display: flex; gap: var(--s-8); margin-inline-start: auto; }
  kbd { font: inherit; font-size: var(--fs-12); opacity: .85; }
  .btn.on { background: var(--green-soft); border-color: var(--green); color: var(--green-deep); }
  .badge { display: inline-flex; align-items: center; gap: var(--s-8); min-height: var(--control); padding: 0 var(--s-12); border-radius: var(--r-8); background: var(--green-soft); color: var(--green-deep); font-weight: 600; white-space: nowrap; }
  .badge.bad { color: var(--danger); background: var(--surface); border: 1px solid var(--danger); }
  .badge :global(svg) { flex: none; }
  .note.warn { border: 1px solid var(--danger); background: var(--surface); }
  .note.warn :global(svg) { color: var(--danger); }
  .sigitem { display: grid; gap: var(--s-8); padding: var(--s-8) var(--s-12); border: 1px solid var(--green); border-radius: var(--r-8); background: var(--surface); }
  .sigitem.bad { border-color: var(--danger); }
  .between { display: flex; justify-content: space-between; gap: var(--s-8); }
  .state { display: flex; gap: var(--s-8); font-weight: 600; }
  .state :global(svg) { flex: none; color: var(--green); }
  .sigitem.bad .state :global(svg) { color: var(--danger); }
  .check { display: flex; align-items: center; gap: var(--s-8); min-height: var(--control); font-weight: 600; }
  .check input { width: 20px; height: 20px; margin: 0; accent-color: var(--green); }
  .idbtn { flex: 1; }
  .field input[type='password'], .field input[type='email'], .field input[type='url'] { min-height: var(--control); padding: 0 var(--s-12); border: 1px solid var(--line); border-radius: var(--r-8); background: var(--paper); font-weight: 400; }
  .body { display: grid; grid-template-columns: 1fr 320px; min-height: 0; }
  .stage { position: relative; overflow: auto; display: grid; place-items: center; padding: var(--s-24); background: var(--canvas); min-height: 0; }
  .busy { position: absolute; inset: 0; z-index: 3; margin: 0; display: grid; place-items: center; background: var(--veil); font-size: var(--fs-16); font-weight: 600; }
  .sheet { position: relative; background: var(--surface); box-shadow: var(--shadow); cursor: crosshair; }
  .sheet canvas { position: absolute; inset: 0; }
  .spot { position: absolute; padding: 0; border: 2px solid var(--green); border-radius: 4px; background: var(--select-tint); cursor: pointer; }
  .spot.next { background: var(--green-soft); box-shadow: 0 0 0 4px var(--select-tint); mix-blend-mode: multiply; }
  .spot.date { border-style: dashed; pointer-events: none; }
  .ghost { position: absolute; display: grid; place-items: center; border: 2px dashed var(--green); border-radius: 4px; background: var(--select-tint); color: var(--green-deep); font-size: var(--fs-12); font-weight: 600; text-align: center; pointer-events: none; }
  .set { position: absolute; pointer-events: none; }
  .settext { position: absolute; white-space: nowrap; line-height: 1.3; font-family: Tajawal, sans-serif; pointer-events: none; }
  .side { display: flex; flex-direction: column; gap: var(--s-16); padding: var(--s-16); background: var(--surface); border-inline-start: 1px solid var(--line); overflow-y: auto; }
  .side section { display: grid; gap: var(--s-8); }
  .side h2 { margin: 0; font-size: var(--fs-16); }
  .need { display: flex; align-items: center; justify-content: space-between; gap: var(--s-8); padding: var(--s-8) var(--s-12); border: 1px solid var(--green); border-radius: var(--r-8); background: var(--green-soft); font-weight: 600; }
  .note { display: flex; gap: var(--s-8); margin: 0; padding: var(--s-12); border-radius: var(--r-8); background: var(--green-soft); }
  .note :global(svg) { flex: none; color: var(--green); }
  .help { margin: 0; color: var(--muted); }
  .files { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--s-8); }
  .file { width: 100%; min-height: var(--control); display: grid; gap: 0; padding: var(--s-8) var(--s-12); border: 1px solid var(--line); border-radius: var(--r-8); background: var(--surface); text-align: start; }
  .file.on { border-color: var(--green); background: var(--green-soft); }
  .fname { display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; line-height: 1.3; font-weight: 600; }
  .lib { display: grid; gap: var(--s-8); }
  .libitem { display: flex; align-items: center; gap: var(--s-8); }
  .sigbtn { flex: 1; height: 64px; padding: var(--s-8); border: 1px solid var(--line); border-radius: var(--r-8); background: var(--surface); }
  .sigbtn[aria-checked='true'] { border-color: var(--green); box-shadow: 0 0 0 2px var(--green); }
  .sigbtn img { max-width: 100%; max-height: 100%; display: block; margin: auto; }
  .maker { display: grid; gap: var(--s-12); padding: var(--s-12); border: 1px solid var(--line); border-radius: var(--r-8); background: var(--paper); }
  .pad { width: 100%; height: 100px; border: 1px dashed var(--green); border-radius: var(--r-8); background: var(--surface); touch-action: none; cursor: crosshair; }
  .preview { max-width: 100%; max-height: 80px; justify-self: center; }
  .preview.empty { display: none; }
  .row { display: flex; flex-wrap: wrap; gap: var(--s-8); }
  .field { display: grid; gap: var(--s-8); font-weight: 600; }
  .field select, .input, .field input:not([type]) { min-height: var(--control); padding: 0 var(--s-12); border: 1px solid var(--line); border-radius: var(--r-8); background: var(--paper); font-weight: 400; }
  .field input[type='range'] { accent-color: var(--green); min-height: var(--control); }
  .swatch { width: var(--control); height: var(--control); border: 1px solid var(--line); border-radius: 50%; background: var(--c); }
  .swatch[aria-checked='true'] { box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--green); }
  .datetext { margin: 0; font-size: var(--fs-16); font-weight: 600; }
  @media (max-width: 900px) { .body { grid-template-columns: 1fr; grid-template-rows: 1fr auto; } .side { max-height: 45vh; border-inline-start: 0; border-top: 1px solid var(--line); } }
</style>
