// DER (ASN.1) read and write, the little that certificates, CMS signatures and .pfx files need. No dependency: pure
// functions on Uint8Array, so pades.ts and pfx.ts run in the browser and in the Node self-check alike.

/** One TLV: `tag`, the content `body`, and the whole encoding `raw`. */
export type Node = { tag: number; body: Uint8Array; raw: Uint8Array };

export function read(b: Uint8Array, at = 0): Node {
  if (at + 2 > b.length) throw new Error('DER');
  const tag = b[at];
  let len = b[at + 1], p = at + 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n === 0 || n > 4 || p + n > b.length) throw new Error('DER');
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + b[p++];
  }
  if (p + len > b.length) throw new Error('DER');
  return { tag, body: b.subarray(p, p + len), raw: b.subarray(at, p + len) };
}
/** The children of a constructed node, in order. */
export function kids(n: Node): Node[] {
  const out: Node[] = [];
  for (let at = 0; at < n.body.length; ) { const k = read(n.body, at); out.push(k); at += k.raw.length; }
  return out;
}
/** Child `i` of `n`, with the tag it must carry (an error names the place when the structure is not as expected). */
export function kid(n: Node, i: number, tag?: number): Node {
  const k = kids(n)[i];
  if (!k || (tag != null && k.tag !== tag)) throw new Error('DER');
  return k;
}
export const oidOf = (n: Node) => {
  if (n.tag !== 0x06) throw new Error('DER');
  const b = n.body, out: number[] = [];
  let v = 0;
  for (let i = 0; i < b.length; i++) { v = v * 128 + (b[i] & 0x7f); if (!(b[i] & 0x80)) { if (!out.length) out.push(Math.min(2, Math.floor(v / 40)), v - 40 * Math.min(2, Math.floor(v / 40))); else out.push(v); v = 0; } }
  return out.join('.');
};
export const intOf = (n: Node) => { let v = 0n; for (const x of n.body) v = (v << 8n) | BigInt(x); return v; };
/** A positive integer's bytes without the leading zero (serial numbers, RSA modulus). */
export const unsigned = (n: Node) => (n.body[0] === 0 && n.body.length > 1 ? n.body.subarray(1) : n.body);
export function strOf(n: Node): string {
  if (n.tag === 0x1e) return new TextDecoder('utf-16be').decode(n.body); // BMPString
  if (n.tag === 0x0c || n.tag === 0x13 || n.tag === 0x16 || n.tag === 0x14 || n.tag === 0x1a) return new TextDecoder(n.tag === 0x14 ? 'latin1' : 'utf-8').decode(n.body);
  throw new Error('DER');
}
/** UTCTime / GeneralizedTime as a Date. */
export function timeOf(n: Node): Date {
  const s = new TextDecoder().decode(n.body), full = n.tag === 0x18 ? s : (+s.slice(0, 2) < 50 ? '20' : '19') + s;
  const m = /^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)?(?:\.\d+)?(Z|[+-]\d{4})?$/.exec(full);
  if (!m) throw new Error('DER');
  let t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  if (m[7] && m[7] !== 'Z') t -= (m[7][0] === '-' ? -1 : 1) * (+m[7].slice(1, 3) * 60 + +m[7].slice(3)) * 60_000;
  return new Date(t);
}
export const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

// --- writing --------------------------------------------------------------------------------------------------------
export function cat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}
export function tlv(tag: number, ...parts: Uint8Array[]): Uint8Array {
  const body = cat(...parts), n = body.length;
  const len = n < 128 ? [n] : n < 256 ? [0x81, n] : n < 65536 ? [0x82, n >> 8, n & 255] : [0x83, n >> 16, (n >> 8) & 255, n & 255];
  return cat(new Uint8Array([tag, ...len]), body);
}
export const seq = (...p: Uint8Array[]) => tlv(0x30, ...p);
export const set = (...p: Uint8Array[]) => tlv(0x31, ...p);
export const octet = (b: Uint8Array) => tlv(0x04, b);
export const bits = (b: Uint8Array) => tlv(0x03, new Uint8Array([0]), b);
export const utf8 = (s: string) => tlv(0x0c, new TextEncoder().encode(s));
export const ia5 = (s: string) => tlv(0x16, new TextEncoder().encode(s));
export const bool = (v: boolean) => tlv(0x01, new Uint8Array([v ? 0xff : 0]));
export const nil = () => tlv(0x05);
/** [n] EXPLICIT (constructed context tag). */
export const ctx = (n: number, ...p: Uint8Array[]) => tlv(0xa0 | n, ...p);
/** `der` with its tag replaced ([n] IMPLICIT, or SET for signed attributes). */
export const retag = (der: Uint8Array, tag: number) => { const out = der.slice(); out[0] = tag; return out; };
export function int(v: bigint | number | Uint8Array): Uint8Array {
  if (v instanceof Uint8Array) return tlv(0x02, v[0] & 0x80 ? cat(new Uint8Array([0]), v) : v);
  let n = BigInt(v);
  if (n < 0n) throw new Error('DER');
  const out: number[] = [];
  do { out.unshift(Number(n & 255n)); n >>= 8n; } while (n > 0n);
  if (out[0] & 0x80) out.unshift(0);
  return tlv(0x02, new Uint8Array(out));
}
export function oid(s: string): Uint8Array {
  const a = s.split('.').map(Number), out = [a[0] * 40 + a[1]];
  for (const v of a.slice(2)) { const b = [v & 0x7f]; for (let x = Math.floor(v / 128); x > 0; x = Math.floor(x / 128)) b.unshift((x & 0x7f) | 0x80); out.push(...b); }
  return tlv(0x06, new Uint8Array(out));
}
/** UTCTime up to 2049, GeneralizedTime after (as X.509 asks). */
export function time(d: Date): Uint8Array {
  const s = d.toISOString().replace(/[-:T]|\.\d+/g, ''); // YYYYMMDDHHMMSSZ
  return d.getUTCFullYear() < 2050 ? tlv(0x17, new TextEncoder().encode(s.slice(2))) : tlv(0x18, new TextEncoder().encode(s));
}
export const hex = (b: Uint8Array) => Array.from(b, (v) => v.toString(16).padStart(2, '0')).join('');
export const unhex = (s: string) => new Uint8Array((s.replace(/\s+/g, '').match(/../g) ?? []).map((h) => parseInt(h, 16)));
