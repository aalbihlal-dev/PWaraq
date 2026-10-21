// The smallest ZIP that standard tools open: files stored as they are (PDFs and photos are already compressed).
// Used for the portable Portfolio file (.waraq = manifest.json + the original files).
// shortcut: no compression, no ZIP64 (files under 4 GB in total); add both if portfolios ever get that large.

const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (b: Uint8Array) => { let c = ~0; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return ~c >>> 0; };

export function zip(files: Record<string, Uint8Array>): Uint8Array {
  const enc = new TextEncoder(), parts: Uint8Array[] = [], dir: Uint8Array[] = [];
  let offset = 0;
  for (const [name, data] of Object.entries(files)) {
    const n = enc.encode(name), crc = crc32(data), local = new Uint8Array(30 + n.length), central = new Uint8Array(46 + n.length);
    const l = new DataView(local.buffer), c = new DataView(central.buffer);
    l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true); l.setUint16(6, 0x800, true); // UTF-8 names
    l.setUint32(14, crc, true); l.setUint32(18, data.length, true); l.setUint32(22, data.length, true); l.setUint16(26, n.length, true);
    local.set(n, 30);
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x800, true);
    c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, n.length, true);
    c.setUint32(42, offset, true); central.set(n, 46);
    parts.push(local, data); dir.push(central); offset += local.length + data.length;
  }
  const size = dir.reduce((s, d) => s + d.length, 0), end = new Uint8Array(22), e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, dir.length, true); e.setUint16(10, dir.length, true);
  e.setUint32(12, size, true); e.setUint32(16, offset, true);
  const out = new Uint8Array(offset + size + 22);
  let at = 0;
  for (const p of [...parts, ...dir, end]) { out.set(p, at); at += p.length; }
  return out;
}

/** Reads a ZIP written by `zip` (stored files only); throws on anything else, on a file whose checksum fails, and on more than
 *  `max` entries or bytes in total (a zip bomb is refused from the directory, before anything is copied). */
export function unzip(bytes: Uint8Array, max = { entries: 2000, bytes: 4 * 2 ** 30 }): Record<string, Uint8Array> {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), dec = new TextDecoder(), out: Record<string, Uint8Array> = {};
  let end = bytes.length - 22;
  while (end >= 0 && v.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0) throw new Error('not a zip');
  let p = v.getUint32(end + 16, true), total = 0;
  const count = v.getUint16(end + 10, true);
  if (count > max.entries) throw new Error('zip: too many entries');
  for (let i = 0; i < count; i++) {
    if (p + 46 > bytes.length) throw new Error('bad zip');
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('bad zip');
    const method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true), nlen = v.getUint16(p + 28, true);
    const extra = v.getUint16(p + 30, true), note = v.getUint16(p + 32, true), local = v.getUint32(p + 42, true);
    if (method !== 0) throw new Error('compressed zip entries are not supported');
    if ((total += size) > max.bytes) throw new Error('zip: too large');
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nlen)), start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    if (local + 30 > bytes.length || start + size > bytes.length) throw new Error('bad zip');
    out[name] = bytes.slice(start, start + size);
    if (crc32(out[name]) !== v.getUint32(p + 16, true)) throw new Error('bad zip: checksum');
    p += 46 + nlen + extra + note;
  }
  return out;
}
