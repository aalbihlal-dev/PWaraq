// Importing a digital ID from a .pfx / .p12 file (PKCS#12): the password opens it, the private key (PKCS#8) and the
// certificate come out, nothing is kept. Modern files (PBES2: PBKDF2 + AES) are decrypted with WebCrypto; the legacy
// files Windows and older OpenSSL write (pbeWithSHAAnd3-KeyTripleDES-CBC, pbeWithSHAAnd40BitRC2-CBC) need the two
// old ciphers, so small DES and RC2 decryptors live here — pure, checked against OpenSSL's output in tests/unit/certsign.
import { cat, kid, kids, oidOf, read, same, type Node } from './der.ts';
import type { KeyAlg } from './pades.ts';

const OID = {
  data: '1.2.840.113549.1.7.1', encryptedData: '1.2.840.113549.1.7.6',
  keyBag: '1.2.840.113549.1.12.10.1.1', shroudedKeyBag: '1.2.840.113549.1.12.10.1.2', certBag: '1.2.840.113549.1.12.10.1.3', x509: '1.2.840.113549.1.9.22.1',
  localKeyId: '1.2.840.113549.1.9.21',
  pbes2: '1.2.840.113549.1.5.13', pbkdf2: '1.2.840.113549.1.5.12', pbe3des: '1.2.840.113549.1.12.1.3', pbeRc2_40: '1.2.840.113549.1.12.1.6',
  aes128: '2.16.840.1.101.3.4.1.2', aes192: '2.16.840.1.101.3.4.1.22', aes256: '2.16.840.1.101.3.4.1.42', des3: '1.2.840.113549.3.7',
  hmacSha1: '1.2.840.113549.2.7', hmacSha256: '1.2.840.113549.2.9', hmacSha384: '1.2.840.113549.2.10', hmacSha512: '1.2.840.113549.2.11',
  sha1: '1.3.14.3.2.26', sha256: '2.16.840.1.101.3.4.2.1', sha384: '2.16.840.1.101.3.4.2.2', sha512: '2.16.840.1.101.3.4.2.3',
  rsa: '1.2.840.113549.1.1.1', ec: '1.2.840.10045.2.1',
};
const HASH: Record<string, string> = { [OID.hmacSha1]: 'SHA-1', [OID.hmacSha256]: 'SHA-256', [OID.hmacSha384]: 'SHA-384', [OID.hmacSha512]: 'SHA-512', [OID.sha1]: 'SHA-1', [OID.sha256]: 'SHA-256', [OID.sha384]: 'SHA-384', [OID.sha512]: 'SHA-512' };
const subtle = () => globalThis.crypto.subtle;

export type Opened = { key: Uint8Array; cert: Uint8Array; chain: Uint8Array[]; alg: KeyAlg };
/** The private key and certificate inside `pfx`. Throws WRONG_PASSWORD, UNSUPPORTED (an algorithm Waraq does not know) or NO_KEY. */
export async function openPfx(pfx: Uint8Array, password: string): Promise<Opened> {
  let top: Node, authSafe: Uint8Array;
  try { top = read(pfx); authSafe = read(kid(kid(top, 1), 1).body).body; } catch { throw new Error('UNSUPPORTED'); }
  const mac = kids(top)[2];
  if (mac && !(await macOk(mac, authSafe, password))) throw new Error('WRONG_PASSWORD');
  const keys: { key: Uint8Array; id?: Uint8Array }[] = [], certs: { cert: Uint8Array; id?: Uint8Array }[] = [];
  for (const ci of kids(read(authSafe))) {
    const type = oidOf(kid(ci, 0)), inner = kid(kid(ci, 1), 0);
    let safe: Uint8Array;
    if (type === OID.data) safe = inner.body;
    else if (type === OID.encryptedData) {
      const eci = kid(inner, 1), enc = kids(eci)[2];
      safe = await decrypt(kid(eci, 1), enc.tag === 0xa0 ? cat(...kids(enc).map((k) => k.body)) : enc.body, password);
    } else continue;
    let bags: Node[];
    try { bags = kids(read(safe)); } catch { throw new Error('WRONG_PASSWORD'); }
    for (const bag of bags) {
      const bagType = oidOf(kid(bag, 0)), value = kid(kid(bag, 1), 0), attrs = kids(bag)[2];
      let id: Uint8Array | undefined;
      if (attrs) for (const a of kids(attrs)) if (oidOf(kid(a, 0)) === OID.localKeyId) id = kid(kid(a, 1), 0).body;
      if (bagType === OID.keyBag) keys.push({ key: value.raw, id });
      else if (bagType === OID.shroudedKeyBag) keys.push({ key: await decrypt(kid(value, 0), kid(value, 1).body, password), id });
      else if (bagType === OID.certBag && oidOf(kid(value, 0)) === OID.x509) certs.push({ cert: kid(kid(value, 1), 0).body, id });
    }
  }
  const k = keys[0];
  if (!k) throw new Error('NO_KEY');
  let alg: KeyAlg;
  try {
    const ai = kid(read(k.key), 1), o = oidOf(kid(ai, 0));
    alg = o === OID.rsa ? 'rsa' : o === OID.ec && oidOf(kid(ai, 1)) === '1.2.840.10045.3.1.7' ? 'p256' : (() => { throw 0; })();
  } catch { throw new Error('WRONG_PASSWORD'); }
  const mine = (k.id && certs.find((c) => same(c.id ?? new Uint8Array(), k.id!))) ?? certs[0];
  if (!mine) throw new Error('NO_KEY');
  return { key: k.key, cert: mine.cert, chain: certs.filter((c) => c !== mine).map((c) => c.cert), alg };
}

async function macOk(mac: Node, data: Uint8Array, password: string) {
  try {
    const di = kid(mac, 0), hash = HASH[oidOf(kid(kid(di, 0), 0))], want = kid(di, 1).body, salt = kid(mac, 1).body, iter = kids(mac)[2] ? Number(bigOf(kids(mac)[2])) : 1;
    if (!hash) return true; // an unknown MAC is not checked; the decryption tells
    const len = { 'SHA-1': 20, 'SHA-256': 32, 'SHA-384': 48, 'SHA-512': 64 }[hash]!;
    const key = await subtle().importKey('raw', (await kdf12(hash, password, salt, iter, 3, len)) as Uint8Array<ArrayBuffer>, { name: 'HMAC', hash }, false, ['sign']);
    return same(new Uint8Array(await subtle().sign('HMAC', key, data as Uint8Array<ArrayBuffer>)), want);
  } catch { return false; }
}
const bigOf = (n: Node) => { let v = 0; for (const b of n.body) v = v * 256 + b; return v; };

/** `data` under the password-based scheme `alg` (an AlgorithmIdentifier). */
async function decrypt(alg: Node, data: Uint8Array, password: string): Promise<Uint8Array> {
  const scheme = oidOf(kid(alg, 0)), params = kid(alg, 1);
  try {
    if (scheme === OID.pbes2) {
      const kdf = kid(params, 0), enc = kid(params, 1);
      if (oidOf(kid(kdf, 0)) !== OID.pbkdf2) throw new Error('UNSUPPORTED');
      const kp = kids(kid(kdf, 1)), salt = kp[0].body, iter = bigOf(kp[1]);
      const prfNode = kp.slice(2).find((k) => k.tag === 0x30), prf = prfNode ? HASH[oidOf(kid(prfNode, 0))] : 'SHA-1';
      const cipher = oidOf(kid(enc, 0)), iv = kid(enc, 1).body;
      const bitsFor: Record<string, number> = { [OID.aes128]: 128, [OID.aes192]: 192, [OID.aes256]: 256, [OID.des3]: 192 };
      if (!prf || !bitsFor[cipher]) throw new Error('UNSUPPORTED');
      const base = await subtle().importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
      const key = new Uint8Array(await subtle().deriveBits({ name: 'PBKDF2', hash: prf, salt: salt as Uint8Array<ArrayBuffer>, iterations: iter }, base, bitsFor[cipher]));
      if (cipher === OID.des3) return unpad(des3Cbc(key, iv, data));
      const k = await subtle().importKey('raw', key as Uint8Array<ArrayBuffer>, 'AES-CBC', false, ['decrypt']);
      return new Uint8Array(await subtle().decrypt({ name: 'AES-CBC', iv: iv as Uint8Array<ArrayBuffer> }, k, data as Uint8Array<ArrayBuffer>));
    }
    if (scheme === OID.pbe3des || scheme === OID.pbeRc2_40) {
      const salt = kid(params, 0).body, iter = bigOf(kid(params, 1)), keyLen = scheme === OID.pbe3des ? 24 : 5;
      const key = await kdf12('SHA-1', password, salt, iter, 1, keyLen), iv = await kdf12('SHA-1', password, salt, iter, 2, 8);
      return unpad(scheme === OID.pbe3des ? des3Cbc(key, iv, data) : rc2Cbc(key, 40, iv, data));
    }
  } catch (e) { if ((e as Error).message === 'UNSUPPORTED') throw e; throw new Error('WRONG_PASSWORD'); }
  throw new Error('UNSUPPORTED');
}
function unpad(b: Uint8Array) {
  const n = b[b.length - 1];
  if (!n || n > 16 || n > b.length) throw new Error('WRONG_PASSWORD');
  return b.subarray(0, b.length - n);
}

/** The PKCS#12 key derivation (RFC 7292 appendix B): `id` 1 = key, 2 = IV, 3 = MAC key. */
async function kdf12(hash: string, password: string, salt: Uint8Array, iterations: number, id: number, n: number): Promise<Uint8Array> {
  const u = { 'SHA-1': 20, 'SHA-256': 32, 'SHA-384': 48, 'SHA-512': 64 }[hash]!, v = hash === 'SHA-384' || hash === 'SHA-512' ? 128 : 64;
  const pw = password ? cat(bmp(password), new Uint8Array(2)) : new Uint8Array(0); // BMPString with its terminating zero
  const fill = (src: Uint8Array) => { if (!src.length) return new Uint8Array(0); const out = new Uint8Array(Math.ceil(src.length / v) * v); for (let i = 0; i < out.length; i++) out[i] = src[i % src.length]; return out; };
  const D = new Uint8Array(v).fill(id), I = cat(fill(salt), fill(pw)), out: Uint8Array[] = [];
  for (let got = 0; got < n; ) {
    let A = cat(D, I);
    for (let r = 0; r < iterations; r++) A = new Uint8Array(await subtle().digest(hash, A as Uint8Array<ArrayBuffer>));
    out.push(A); got += u;
    const B = new Uint8Array(v); for (let i = 0; i < v; i++) B[i] = A[i % u];
    for (let j = 0; j < I.length; j += v) { // I_j = I_j + B + 1
      let carry = 1;
      for (let i = v - 1; i >= 0; i--) { const s = I[j + i] + B[i] + carry; I[j + i] = s & 255; carry = s >> 8; }
    }
  }
  return cat(...out).subarray(0, n);
}
const bmp = (s: string) => { const out = new Uint8Array(s.length * 2); for (let i = 0; i < s.length; i++) { out[2 * i] = s.charCodeAt(i) >> 8; out[2 * i + 1] = s.charCodeAt(i) & 255; } return out; };

// --- DES / triple DES (decrypt only, CBC) -----------------------------------------------------------------------------
const PC1 = [57, 49, 41, 33, 25, 17, 9, 1, 58, 50, 42, 34, 26, 18, 10, 2, 59, 51, 43, 35, 27, 19, 11, 3, 60, 52, 44, 36, 63, 55, 47, 39, 31, 23, 15, 7, 62, 54, 46, 38, 30, 22, 14, 6, 61, 53, 45, 37, 29, 21, 13, 5, 28, 20, 12, 4];
const PC2 = [14, 17, 11, 24, 1, 5, 3, 28, 15, 6, 21, 10, 23, 19, 12, 4, 26, 8, 16, 7, 27, 20, 13, 2, 41, 52, 31, 37, 47, 55, 30, 40, 51, 45, 33, 48, 44, 49, 39, 56, 34, 53, 46, 42, 50, 36, 29, 32];
const SHIFTS = [1, 1, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 1];
const IP = [58, 50, 42, 34, 26, 18, 10, 2, 60, 52, 44, 36, 28, 20, 12, 4, 62, 54, 46, 38, 30, 22, 14, 6, 64, 56, 48, 40, 32, 24, 16, 8, 57, 49, 41, 33, 25, 17, 9, 1, 59, 51, 43, 35, 27, 19, 11, 3, 61, 53, 45, 37, 29, 21, 13, 5, 63, 55, 47, 39, 31, 23, 15, 7];
const FP = [40, 8, 48, 16, 56, 24, 64, 32, 39, 7, 47, 15, 55, 23, 63, 31, 38, 6, 46, 14, 54, 22, 62, 30, 37, 5, 45, 13, 53, 21, 61, 29, 36, 4, 44, 12, 52, 20, 60, 28, 35, 3, 43, 11, 51, 19, 59, 27, 34, 2, 42, 10, 50, 18, 58, 26, 33, 1, 41, 9, 49, 17, 57, 25];
const E = [32, 1, 2, 3, 4, 5, 4, 5, 6, 7, 8, 9, 8, 9, 10, 11, 12, 13, 12, 13, 14, 15, 16, 17, 16, 17, 18, 19, 20, 21, 20, 21, 22, 23, 24, 25, 24, 25, 26, 27, 28, 29, 28, 29, 30, 31, 32, 1];
const P = [16, 7, 20, 21, 29, 12, 28, 17, 1, 15, 23, 26, 5, 18, 31, 10, 2, 8, 24, 14, 32, 27, 3, 9, 19, 13, 30, 6, 22, 11, 4, 25];
const S = [
  [14, 4, 13, 1, 2, 15, 11, 8, 3, 10, 6, 12, 5, 9, 0, 7, 0, 15, 7, 4, 14, 2, 13, 1, 10, 6, 12, 11, 9, 5, 3, 8, 4, 1, 14, 8, 13, 6, 2, 11, 15, 12, 9, 7, 3, 10, 5, 0, 15, 12, 8, 2, 4, 9, 1, 7, 5, 11, 3, 14, 10, 0, 6, 13],
  [15, 1, 8, 14, 6, 11, 3, 4, 9, 7, 2, 13, 12, 0, 5, 10, 3, 13, 4, 7, 15, 2, 8, 14, 12, 0, 1, 10, 6, 9, 11, 5, 0, 14, 7, 11, 10, 4, 13, 1, 5, 8, 12, 6, 9, 3, 2, 15, 13, 8, 10, 1, 3, 15, 4, 2, 11, 6, 7, 12, 0, 5, 14, 9],
  [10, 0, 9, 14, 6, 3, 15, 5, 1, 13, 12, 7, 11, 4, 2, 8, 13, 7, 0, 9, 3, 4, 6, 10, 2, 8, 5, 14, 12, 11, 15, 1, 13, 6, 4, 9, 8, 15, 3, 0, 11, 1, 2, 12, 5, 10, 14, 7, 1, 10, 13, 0, 6, 9, 8, 7, 4, 15, 14, 3, 11, 5, 2, 12],
  [7, 13, 14, 3, 0, 6, 9, 10, 1, 2, 8, 5, 11, 12, 4, 15, 13, 8, 11, 5, 6, 15, 0, 3, 4, 7, 2, 12, 1, 10, 14, 9, 10, 6, 9, 0, 12, 11, 7, 13, 15, 1, 3, 14, 5, 2, 8, 4, 3, 15, 0, 6, 10, 1, 13, 8, 9, 4, 5, 11, 12, 7, 2, 14],
  [2, 12, 4, 1, 7, 10, 11, 6, 8, 5, 3, 15, 13, 0, 14, 9, 14, 11, 2, 12, 4, 7, 13, 1, 5, 0, 15, 10, 3, 9, 8, 6, 4, 2, 1, 11, 10, 13, 7, 8, 15, 9, 12, 5, 6, 3, 0, 14, 11, 8, 12, 7, 1, 14, 2, 13, 6, 15, 0, 9, 10, 4, 5, 3],
  [12, 1, 10, 15, 9, 2, 6, 8, 0, 13, 3, 4, 14, 7, 5, 11, 10, 15, 4, 2, 7, 12, 9, 5, 6, 1, 13, 14, 0, 11, 3, 8, 9, 14, 15, 5, 2, 8, 12, 3, 7, 0, 4, 10, 1, 13, 11, 6, 4, 3, 2, 12, 9, 5, 15, 10, 11, 14, 1, 7, 6, 0, 8, 13],
  [4, 11, 2, 14, 15, 0, 8, 13, 3, 12, 9, 7, 5, 10, 6, 1, 13, 0, 11, 7, 4, 9, 1, 10, 14, 3, 5, 12, 2, 15, 8, 6, 1, 4, 11, 13, 12, 3, 7, 14, 10, 15, 6, 8, 0, 5, 9, 2, 6, 11, 13, 8, 1, 4, 10, 7, 9, 5, 0, 15, 14, 2, 3, 12],
  [13, 2, 8, 4, 6, 15, 11, 1, 10, 9, 3, 14, 5, 0, 12, 7, 1, 15, 13, 8, 10, 3, 7, 4, 12, 5, 6, 11, 0, 14, 9, 2, 7, 11, 4, 1, 9, 12, 14, 2, 0, 6, 10, 13, 15, 3, 5, 8, 2, 1, 14, 7, 4, 10, 8, 13, 15, 12, 9, 0, 3, 5, 6, 11],
];
const toBits = (b: Uint8Array) => { const out = new Uint8Array(b.length * 8); for (let i = 0; i < out.length; i++) out[i] = (b[i >> 3] >> (7 - (i & 7))) & 1; return out; };
const fromBits = (b: Uint8Array) => { const out = new Uint8Array(b.length / 8); for (let i = 0; i < b.length; i++) out[i >> 3] |= b[i] << (7 - (i & 7)); return out; };
const perm = (b: Uint8Array, t: number[]) => Uint8Array.from(t, (i) => b[i - 1]);
function desKeys(key: Uint8Array): Uint8Array[] {
  const k = perm(toBits(key), PC1);
  let c: Uint8Array = k.subarray(0, 28), d: Uint8Array = k.subarray(28);
  const out: Uint8Array[] = [];
  for (const s of SHIFTS) {
    c = cat(c.subarray(s), c.subarray(0, s)); d = cat(d.subarray(s), d.subarray(0, s));
    out.push(perm(cat(c, d), PC2));
  }
  return out;
}
function desBlock(block: Uint8Array, keys: Uint8Array[]): Uint8Array {
  const b = perm(toBits(block), IP);
  let l = b.subarray(0, 32), r = b.subarray(32);
  for (const k of keys) {
    const x = perm(r, E).map((v, i) => v ^ k[i]), s = new Uint8Array(32);
    for (let i = 0; i < 8; i++) {
      const o = i * 6, v = S[i][((x[o] << 1) | x[o + 5]) * 16 + ((x[o + 1] << 3) | (x[o + 2] << 2) | (x[o + 3] << 1) | x[o + 4])];
      for (let j = 0; j < 4; j++) s[i * 4 + j] = (v >> (3 - j)) & 1;
    }
    const f = perm(s, P), nr = l.map((v, i) => v ^ f[i]);
    l = r; r = nr;
  }
  return fromBits(perm(cat(r, l), FP));
}
/** Triple DES (EDE, three keys) CBC decryption. */
export function des3Cbc(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Uint8Array {
  // decrypt = D(k1) · E(k2) · D(k3); decryption runs the subkeys backwards
  const k1 = desKeys(key.subarray(0, 8)).reverse(), k2 = desKeys(key.subarray(8, 16)), k3 = desKeys(key.subarray(16, 24)).reverse();
  const out = new Uint8Array(data.length);
  let prev = iv;
  for (let at = 0; at + 8 <= data.length; at += 8) {
    const c = data.subarray(at, at + 8), p = desBlock(desBlock(desBlock(c, k3), k2), k1);
    for (let i = 0; i < 8; i++) out[at + i] = p[i] ^ prev[i];
    prev = c;
  }
  return out;
}

// --- RC2 (decrypt only, CBC; RFC 2268) -----------------------------------------------------------------------------------
const PI = [217, 120, 249, 196, 25, 221, 181, 237, 40, 233, 253, 121, 74, 160, 216, 157, 198, 126, 55, 131, 43, 118, 83, 142, 98, 76, 100, 136, 68, 139, 251, 162, 23, 154, 89, 245, 135, 179, 79, 19, 97, 69, 109, 141, 9, 129, 125, 50, 189, 143, 64, 235, 134, 183, 123, 11, 240, 149, 33, 34, 92, 107, 78, 130, 84, 214, 101, 147, 206, 96, 178, 28, 115, 86, 192, 20, 167, 140, 241, 220, 18, 117, 202, 31, 59, 190, 228, 209, 66, 61, 212, 48, 163, 60, 182, 38, 111, 191, 14, 218, 70, 105, 7, 87, 39, 242, 29, 155, 188, 148, 67, 3, 248, 17, 199, 246, 144, 239, 62, 231, 6, 195, 213, 47, 200, 102, 30, 215, 8, 232, 234, 222, 128, 82, 238, 247, 132, 170, 114, 172, 53, 77, 106, 42, 150, 26, 210, 113, 90, 21, 73, 116, 75, 159, 208, 94, 4, 24, 164, 236, 194, 224, 65, 110, 15, 81, 203, 204, 36, 145, 175, 80, 161, 244, 112, 57, 153, 124, 58, 133, 35, 184, 180, 122, 252, 2, 54, 91, 37, 85, 151, 49, 45, 93, 250, 152, 227, 138, 146, 174, 5, 223, 41, 16, 103, 108, 186, 201, 211, 0, 230, 207, 225, 158, 168, 44, 99, 22, 1, 63, 88, 226, 137, 169, 13, 56, 52, 27, 171, 51, 255, 176, 187, 72, 12, 95, 185, 177, 205, 46, 197, 243, 219, 71, 229, 165, 156, 119, 10, 166, 32, 104, 254, 127, 193, 173];
function rc2Keys(key: Uint8Array, bits: number): Uint16Array {
  const L = new Uint8Array(128), T = key.length, T8 = Math.ceil(bits / 8), TM = 255 % 2 ** (8 + bits - 8 * T8);
  L.set(key);
  for (let i = T; i < 128; i++) L[i] = PI[(L[i - 1] + L[i - T]) & 255];
  L[128 - T8] = PI[L[128 - T8] & TM];
  for (let i = 127 - T8; i >= 0; i--) L[i] = PI[L[i + 1] ^ L[i + T8]];
  const K = new Uint16Array(64);
  for (let i = 0; i < 64; i++) K[i] = L[2 * i] + 256 * L[2 * i + 1];
  return K;
}
function rc2Block(c: Uint8Array, K: Uint16Array): Uint8Array {
  const R = [0, 1, 2, 3].map((i) => c[2 * i] | (c[2 * i + 1] << 8)), ror = (v: number, n: number) => ((v >>> n) | (v << (16 - n))) & 0xffff;
  let j = 63;
  const mix = () => { for (const [i, s] of [[3, 5], [2, 3], [1, 2], [0, 1]] as const) { R[i] = ror(R[i], s); R[i] = (R[i] - K[j--] - (R[(i + 3) & 3] & R[(i + 2) & 3]) - (~R[(i + 3) & 3] & R[(i + 1) & 3])) & 0xffff; } };
  const mash = () => { for (const i of [3, 2, 1, 0]) R[i] = (R[i] - K[R[(i + 3) & 3] & 63]) & 0xffff; };
  for (let i = 0; i < 5; i++) mix();
  mash();
  for (let i = 0; i < 6; i++) mix();
  mash();
  for (let i = 0; i < 5; i++) mix();
  return new Uint8Array(R.flatMap((v) => [v & 255, v >> 8]));
}
/** RC2 CBC decryption with `bits` effective key bits. */
export function rc2Cbc(key: Uint8Array, bits: number, iv: Uint8Array, data: Uint8Array): Uint8Array {
  const K = rc2Keys(key, bits), out = new Uint8Array(data.length);
  let prev = iv;
  for (let at = 0; at + 8 <= data.length; at += 8) {
    const c = data.subarray(at, at + 8), p = rc2Block(c, K);
    for (let i = 0; i < 8; i++) out[at + i] = p[i] ^ prev[i];
    prev = c;
  }
  return out;
}
