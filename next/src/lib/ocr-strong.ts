// The "Best quality" reading (desktop add-on pack): Surya OCR 2 running on this computer as a llama.cpp server (a program
// from the pack, listening on 127.0.0.1 only; the page never leaves the PC). This file is the pure part, shared by the
// app and tools/ocr-accuracy.mjs: the request the model expects, and its answer (a block of HTML for every paragraph, each with
// a box) read into text blocks. The text then gets its word positions from Tesseract (ocr-align.ts). Prompt, labels and
// the box scale are those of surya-ocr 0.22 (github.com/datalab-to/surya, GPL-3.0): "OCR this image to HTML".
import type { Block } from './ocr-align';

export const MODEL = 'datalab-to/surya-ocr-2';
export const PROMPT = 'OCR this image to HTML. Each block is a div with data-label and data-bbox (x0 y0 x1 y1, normalized 0-1000).';
const SKIP = new Set(['Figure', 'Image', 'Diagram', 'Blank-Page', 'Picture']); // pictures: nothing to read
export const LONG_SIDE = 1792; // the picture is sent no larger than this (pixels on the long side)

/** The body of the chat request for one page picture (a PNG as base64). */
export function requestBody(pngBase64: string) {
  return { model: MODEL, temperature: 0, max_tokens: 12288, messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,' + pngBase64 } }, { type: 'text', text: PROMPT }] }] };
}

const entities: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
/** HTML inside a block as the text on the page: line and cell ends become spaces, tags and entities go. */
export function textOf(html: string): string {
  return html.replace(/<\/?(?:br|p|div|tr|li|h\d)\b[^>]*>|<\/(?:td|th)>/gi, ' ').replace(/<[^>]+>/g, '').replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (e) => entities[e]).replace(/\s+/g, ' ').trim();
}

/** The model's answer as text blocks with boxes in pixels of the picture it was sent (`w` x `h`): the top-level divs of the
 *  answer, picture blocks left out. A code fence around the answer is ignored. */
export function parseBlocks(raw: string, w: number, h: number): Block[] {
  const text = raw.replace(/^\s*```(?:html)?\s*/i, '').replace(/\s*```\s*$/, ''), blocks: Block[] = [], tag = /<(\/?)div\b([^>]*)>/gi;
  let depth = 0, start = -1, attrs = '';
  for (let m = tag.exec(text); m; m = tag.exec(text)) {
    if (!m[1]) { if (depth++ === 0) { start = m.index + m[0].length; attrs = m[2]; } continue; }
    if (--depth !== 0) { if (depth < 0) depth = 0; continue; }
    const label = /data-label="([^"]*)"/.exec(attrs)?.[1] ?? '', box = /data-bbox="([^"]*)"/.exec(attrs)?.[1].trim().split(/\s+/).map(Number);
    if (!box || box.length !== 4 || box.some((v) => !Number.isFinite(v)) || SKIP.has(label)) continue;
    const t = textOf(text.slice(start, m.index));
    if (t) blocks.push({ text: t, x0: (box[0] / 1000) * w, y0: (box[1] / 1000) * h, x1: (box[2] / 1000) * w, y1: (box[3] / 1000) * h });
  }
  return blocks;
}

/** Reads one page: `url` is the pack's local server (http://127.0.0.1:port), `png` the page picture. Gives the text blocks in
 *  pixels of the picture sent. A server error or an answer without blocks throws, so the caller can fall back to Tesseract. */
export async function readBlocks(url: string, png: Uint8Array, w: number, h: number, signal?: AbortSignal): Promise<Block[]> {
  let bin = ''; for (let i = 0; i < png.length; i += 0x8000) bin += String.fromCharCode(...png.subarray(i, i + 0x8000));
  const r = await fetch(url + '/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(requestBody(btoa(bin))), signal });
  if (!r.ok) throw new Error('strong OCR server answered ' + r.status);
  const blocks = parseBlocks((await r.json()).choices?.[0]?.message?.content ?? '', w, h);
  if (!blocks.length) throw new Error('strong OCR found no text');
  return blocks;
}
