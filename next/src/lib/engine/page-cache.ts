// Finished drawings of heavy pages, kept between sessions (people reopen the same drawings): lossless PNGs in the
// browser cache, keyed by the file's SHA-256, page and image scale. Ordinary pages are fast enough to redraw.
const NAME = 'waraq-pages-v1';
let docKey = '';

export async function setDocument(bytes: Uint8Array) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>));
  docKey = Array.from(hash.slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
}
const url = (page: number, scale: number) => `/__waraq-page/${docKey}/${page}/${scale.toFixed(4)}.png`;

export async function cached(page: number, scale: number): Promise<ImageBitmap | null> {
  if (!docKey || typeof caches === 'undefined') return null;
  try {
    const hit = await (await caches.open(NAME)).match(url(page, scale));
    return hit ? await createImageBitmap(await hit.blob()) : null;
  } catch { return null; }
}

export async function remember(page: number, scale: number, bmp: ImageBitmap) {
  if (!docKey || typeof caches === 'undefined') return;
  try {
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    c.getContext('2d')!.drawImage(bmp, 0, 0);
    const png = await c.convertToBlob({ type: 'image/png' });
    await (await caches.open(NAME)).put(url(page, scale), new Response(png, { headers: { 'content-type': 'image/png' } }));
  } catch {} // quota or private mode: the page is simply drawn again next time
}
