// Certificate signatures, the standards side: a self-signed X.509 digital ID, a CMS / PKCS#7 detached signature in
// the PAdES-B-B shape (SHA-256, ESS signing-certificate-v2, no signing-time attribute: the PDF's /M carries the time),
// its verification, and an RFC 3161 timestamp token. WebCrypto does the maths; der.ts does the encoding. Pure, so the
// Node self-check (tests/unit/certsign) and the browser run the same code.
import { bits, bool, cat, ctx, hex, ia5, int, kid, kids, nil, octet, oid, oidOf, read, retag, same, seq, set, strOf, time, timeOf, tlv, unsigned, utf8, type Node } from './der.ts';

export type KeyAlg = 'rsa' | 'p256';
const OID = {
  data: '1.2.840.113549.1.7.1', signedData: '1.2.840.113549.1.7.2',
  contentType: '1.2.840.113549.1.9.3', messageDigest: '1.2.840.113549.1.9.4', signingTime: '1.2.840.113549.1.9.5',
  signingCertV2: '1.2.840.113549.1.9.16.2.47', timeStampToken: '1.2.840.113549.1.9.16.2.14', tstInfo: '1.2.840.113549.1.9.16.1.4',
  sha1: '1.3.14.3.2.26', sha256: '2.16.840.1.101.3.4.2.1', sha384: '2.16.840.1.101.3.4.2.2', sha512: '2.16.840.1.101.3.4.2.3',
  rsa: '1.2.840.113549.1.1.1', sha1Rsa: '1.2.840.113549.1.1.5', sha256Rsa: '1.2.840.113549.1.1.11', sha384Rsa: '1.2.840.113549.1.1.12', sha512Rsa: '1.2.840.113549.1.1.13',
  ecPublicKey: '1.2.840.10045.2.1', p256: '1.2.840.10045.3.1.7', ecdsaSha256: '1.2.840.10045.4.3.2', ecdsaSha384: '1.2.840.10045.4.3.3', ecdsaSha512: '1.2.840.10045.4.3.4', ecdsaSha1: '1.2.840.10045.4.1',
  cn: '2.5.4.3', email: '1.2.840.113549.1.9.1', keyUsage: '2.5.29.15', subjectAltName: '2.5.29.17', basicConstraints: '2.5.29.19',
};
const HASH: Record<string, string> = { [OID.sha1]: 'SHA-1', [OID.sha256]: 'SHA-256', [OID.sha384]: 'SHA-384', [OID.sha512]: 'SHA-512' };
// signature algorithm OID -> the hash it carries (CMS may also name the bare key algorithm and hash separately)
const SIG_HASH: Record<string, string> = { [OID.sha1Rsa]: 'SHA-1', [OID.sha256Rsa]: 'SHA-256', [OID.sha384Rsa]: 'SHA-384', [OID.sha512Rsa]: 'SHA-512', [OID.ecdsaSha1]: 'SHA-1', [OID.ecdsaSha256]: 'SHA-256', [OID.ecdsaSha384]: 'SHA-384', [OID.ecdsaSha512]: 'SHA-512' };
const subtle = () => globalThis.crypto.subtle;
const algId = (o: string, params?: Uint8Array) => seq(oid(o), params ?? nil());
const sha256 = async (b: Uint8Array) => new Uint8Array(await subtle().digest('SHA-256', b as Uint8Array<ArrayBuffer>));

// --- a digital ID ------------------------------------------------------------------------------------------------------
export type IdSpec = { name: string; email?: string; alg: KeyAlg; years: number };
const keyParams = (alg: KeyAlg) => alg === 'rsa' ? { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' } : { name: 'ECDSA', namedCurve: 'P-256' };
const signParams = (alg: KeyAlg) => alg === 'rsa' ? { name: 'RSASSA-PKCS1-v1_5' } : { name: 'ECDSA', hash: 'SHA-256' };
const sigAlgId = (alg: KeyAlg) => alg === 'rsa' ? algId(OID.sha256Rsa) : seq(oid(OID.ecdsaSha256));
/** WebCrypto's raw r‖s to the DER SEQUENCE CMS and X.509 want. */
const ecDer = (raw: Uint8Array) => seq(int(raw.subarray(0, raw.length / 2)), int(raw.subarray(raw.length / 2)));
const ecRaw = (der: Uint8Array, n = 32) => { const [r, s] = kids(read(der)).map(unsigned), out = new Uint8Array(2 * n); out.set(r, n - r.length); out.set(s, 2 * n - s.length); return out; };
const name = (cn: string, email?: string) => seq(set(seq(oid(OID.cn), utf8(cn))), ...(email ? [set(seq(oid(OID.email), ia5(email)))] : []));

/** A self-signed certificate for `spec`, made on this device; the private key as PKCS#8 (to be locked by the caller). */
export async function makeId(spec: IdSpec, now = new Date()): Promise<{ cert: Uint8Array; key: Uint8Array }> {
  const pair = await subtle().generateKey(keyParams(spec.alg), true, ['sign', 'verify']);
  const spki = new Uint8Array(await subtle().exportKey('spki', pair.publicKey)), key = new Uint8Array(await subtle().exportKey('pkcs8', pair.privateKey));
  const serial = crypto.getRandomValues(new Uint8Array(16)), subject = name(spec.name.trim(), spec.email?.trim() || undefined);
  const until = new Date(now); until.setUTCFullYear(until.getUTCFullYear() + spec.years);
  const ext = (o: string, critical: boolean, v: Uint8Array) => seq(oid(o), ...(critical ? [bool(true)] : []), octet(v));
  const tbs = seq(ctx(0, int(2)), int(serial), sigAlgId(spec.alg), subject, seq(time(now), time(until)), subject, spki,
    ctx(3, seq(ext(OID.basicConstraints, true, seq()), ext(OID.keyUsage, true, tlv(0x03, new Uint8Array([6, 0xc0]))), // digitalSignature, nonRepudiation
      ...(spec.email?.trim() ? [ext(OID.subjectAltName, false, seq(tlv(0x81, new TextEncoder().encode(spec.email.trim()))))] : []))));
  const sig = new Uint8Array(await subtle().sign(signParams(spec.alg), pair.privateKey, tbs as Uint8Array<ArrayBuffer>));
  return { cert: seq(tbs, sigAlgId(spec.alg), bits(spec.alg === 'rsa' ? sig : ecDer(sig))), key };
}

export type Cert = { raw: Uint8Array; tbs: Uint8Array; serial: Uint8Array; issuer: Uint8Array; subject: Uint8Array; name: string; email?: string; notBefore: Date; notAfter: Date; spki: Uint8Array; alg: KeyAlg | null; sigAlg: string; signature: Uint8Array; selfSigned: boolean };
/** What a certificate says, enough to show the signer and check it. */
export function parseCert(raw: Uint8Array): Cert {
  const c = read(raw), tbs = kid(c, 0, 0x30), f = kids(tbs);
  let i = f[0].tag === 0xa0 ? 1 : 0; // version is optional
  const serial = unsigned(f[i++]); i++; // signature algorithm inside tbs
  const issuer = f[i++].raw, [nb, na] = kids(f[i++]), subject = f[i++], spki = f[i++].raw;
  const keyOid = oidOf(kid(kid(read(spki), 0), 0)), params = kids(kid(read(spki), 0))[1];
  const alg: KeyAlg | null = keyOid === OID.rsa ? 'rsa' : keyOid === OID.ecPublicKey && params?.tag === 0x06 && oidOf(params) === OID.p256 ? 'p256' : null;
  const attrs = new Map<string, string>();
  for (const rdn of kids(subject)) for (const av of kids(rdn)) { try { attrs.set(oidOf(kid(av, 0)), strOf(kid(av, 1))); } catch { /* an unprintable value */ } }
  let email = attrs.get(OID.email);
  if (!email && f[i]?.tag === 0xa3) for (const e of kids(kid(f[i], 0))) if (oidOf(kid(e, 0)) === OID.subjectAltName) for (const g of kids(read(kids(e).at(-1)!.body))) if (g.tag === 0x81) email = new TextDecoder().decode(g.body);
  const sigAlg = oidOf(kid(kid(c, 1), 0)), signature = kid(c, 2, 0x03).body.subarray(1);
  return { raw, tbs: tbs.raw, serial, issuer, subject: subject.raw, name: attrs.get(OID.cn) ?? email ?? '?', email, notBefore: timeOf(nb), notAfter: timeOf(na), spki, alg, sigAlg, signature, selfSigned: same(issuer, subject.raw) };
}

const importPublic = (c: Cert, hash: string) => subtle().importKey('spki', c.spki as Uint8Array<ArrayBuffer>, c.alg === 'rsa' ? { name: 'RSASSA-PKCS1-v1_5', hash } : { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
/** Does `signer` vouch for `data` with `signature` (an X.509 or CMS signature value)? False when the algorithm is unknown. */
async function verifyWith(signer: Cert, hash: string, data: Uint8Array, signature: Uint8Array) {
  if (!signer.alg) return false;
  try {
    const key = await importPublic(signer, hash), sig = signer.alg === 'rsa' ? signature : ecRaw(signature);
    return await subtle().verify(signer.alg === 'rsa' ? { name: 'RSASSA-PKCS1-v1_5' } : { name: 'ECDSA', hash }, key, sig as Uint8Array<ArrayBuffer>, data as Uint8Array<ArrayBuffer>);
  } catch { return false; }
}

// --- signing -----------------------------------------------------------------------------------------------------------
export type Signer = { key: CryptoKey; cert: Uint8Array; chain?: Uint8Array[]; alg: KeyAlg };
/** The detached CMS SignedData over a document whose SHA-256 is `digest`. `tsa`: gets the signature value and returns a
 *  timestamp token to carry with it (PAdES-B-T; see `timestamp`). */
export async function buildCms(s: Signer, digest: Uint8Array, tsa?: (signature: Uint8Array) => Promise<Uint8Array>): Promise<Uint8Array> {
  const cert = parseCert(s.cert);
  const attr = (o: string, v: Uint8Array) => seq(oid(o), set(v));
  const signed = set(attr(OID.contentType, oid(OID.data)), attr(OID.messageDigest, octet(digest)), attr(OID.signingCertV2, seq(seq(seq(octet(await sha256(s.cert)))))));
  const raw = new Uint8Array(await subtle().sign(signParams(s.alg), s.key, signed as Uint8Array<ArrayBuffer>)), sig = s.alg === 'rsa' ? raw : ecDer(raw);
  const token = tsa ? await tsa(sig) : null;
  const info = seq(int(1), seq(cert.issuer, int(cert.serial)), algId(OID.sha256), retag(signed, 0xa0), s.alg === 'rsa' ? algId(OID.rsa) : seq(oid(OID.ecdsaSha256)), octet(sig),
    ...(token ? [ctx(1, attr(OID.timeStampToken, token))] : []));
  const sd = seq(int(1), set(algId(OID.sha256)), seq(oid(OID.data)), retag(set(s.cert, ...(s.chain ?? [])), 0xa0), set(info));
  return seq(oid(OID.signedData), ctx(0, sd));
}

/** An RFC 3161 request for `signature`; the token from the answer (a ContentInfo), or an error naming the status. */
export async function timestamp(url: string, signature: Uint8Array, fetchFn = fetch): Promise<Uint8Array> {
  const req = seq(int(1), seq(algId(OID.sha256), octet(await sha256(signature))), int(crypto.getRandomValues(new Uint8Array(8))), bool(true));
  const r = await fetchFn(url, { method: 'POST', headers: { 'Content-Type': 'application/timestamp-query' }, body: req as Uint8Array<ArrayBuffer> });
  if (!r.ok) throw new Error('TSA_HTTP_' + r.status);
  const resp = read(new Uint8Array(await r.arrayBuffer())), status = Number(intOfNode(kid(kid(resp, 0), 0)));
  if (status > 1) throw new Error('TSA_STATUS_' + status);
  return kid(resp, 1, 0x30).raw;
}
const intOfNode = (n: Node) => { let v = 0; for (const b of n.body) v = v * 256 + b; return v; };
/** The time a timestamp token vouches for (TSTInfo.genTime); null when it cannot be read. */
export function timeOfToken(token: Uint8Array): Date | null {
  try {
    const sd = kid(kid(read(token), 1), 0), eci = kid(sd, 2), content = kids(eci)[1];
    const tst = read(read(content.body).body); // [0] EXPLICIT OCTET STRING holding TSTInfo
    return timeOf(kids(tst)[4]);
  } catch { return null; }
}

// --- verifying -----------------------------------------------------------------------------------------------------------
export type Check = {
  ok: boolean; // the signature is sound: the bytes match and the signer's key signed them
  digestOk: boolean; signatureOk: boolean;
  cert: Cert | null; certValid: boolean; certSelfOk: boolean; // dates at `at`; the self-signed certificate signs itself
  signedAt: Date | null; // from the timestamp token when there is one
  timestamped: boolean;
  problem?: 'NO_CERT' | 'UNSUPPORTED' | 'MALFORMED';
};
/** `cms` checked against the signed bytes (`ranges`, in order): maths only — nobody vouches for who the signer is. */
export async function verifyCms(cms: Uint8Array, ranges: Uint8Array[], at = new Date()): Promise<Check> {
  const out: Check = { ok: false, digestOk: false, signatureOk: false, cert: null, certValid: false, certSelfOk: false, signedAt: null, timestamped: false };
  try {
    const ci = read(cms);
    if (oidOf(kid(ci, 0)) !== OID.signedData) return { ...out, problem: 'UNSUPPORTED' };
    const sd = kid(kid(ci, 1), 0), parts = kids(sd);
    const certs = parts.find((p) => p.tag === 0xa0) ? kids(parts.find((p) => p.tag === 0xa0)!).filter((c) => c.tag === 0x30).map((c) => parseCert(c.raw)) : [];
    const info = kid(parts.at(-1)!, 0), f = kids(info), sid = f[1];
    // the signer: by issuer and serial, else the first certificate
    const cert = (sid.tag === 0x30 ? certs.find((c) => same(c.issuer, kid(sid, 0).raw) && same(c.serial, unsigned(kid(sid, 1)))) : undefined) ?? certs[0] ?? null;
    out.cert = cert;
    if (!cert) return { ...out, problem: 'NO_CERT' };
    const hash = HASH[oidOf(kid(f[2], 0))], signedAttrs = f[3].tag === 0xa0 ? f[3] : null;
    const sigAlgOid = oidOf(kid(f[signedAttrs ? 4 : 3], 0)), signature = f[signedAttrs ? 5 : 4].body;
    const sigHash = SIG_HASH[sigAlgOid] ?? hash;
    if (!hash || !signedAttrs || !cert.alg || !(sigAlgOid in SIG_HASH || sigAlgOid === OID.rsa || sigAlgOid === OID.ecPublicKey)) return { ...out, problem: 'UNSUPPORTED' };
    const digest = new Uint8Array(await subtle().digest(hash, cat(...ranges) as Uint8Array<ArrayBuffer>));
    let claimed: Uint8Array | null = null;
    for (const a of kids(signedAttrs)) if (oidOf(kid(a, 0)) === OID.messageDigest) claimed = kid(kid(a, 1), 0).body;
    out.digestOk = !!claimed && same(claimed, digest);
    out.signatureOk = await verifyWith(cert, sigHash, retag(signedAttrs.raw, 0x31), signature);
    out.certValid = cert.notBefore <= at && at <= cert.notAfter;
    out.certSelfOk = cert.selfSigned && await verifyWith(cert, SIG_HASH[cert.sigAlg] ?? 'SHA-256', cert.tbs, cert.signature);
    const unsigned_ = f.find((x, i) => i > 4 && x.tag === 0xa1);
    if (unsigned_) for (const a of kids(unsigned_)) if (oidOf(kid(a, 0)) === OID.timeStampToken) { out.timestamped = true; out.signedAt = timeOfToken(kid(kid(a, 1), 0).raw); }
    out.ok = out.digestOk && out.signatureOk;
    return out;
  } catch { return { ...out, problem: 'MALFORMED' }; }
}

// --- the PDF side, pure bytes ---------------------------------------------------------------------------------------
export type SigEntry = { field: string; page: number; rect: number[]; name: string; reason: string; location: string; time: string; byteRange: number[]; subFilter: string; contents: Uint8Array };
/** The parts of `bytes` a signature covers, and whether it reaches the end of the file (nothing added after it). */
export function covered(bytes: Uint8Array, br: number[]) {
  const ranges = [bytes.subarray(br[0], br[0] + br[1]), bytes.subarray(br[2], br[2] + br[3])];
  return { ranges, whole: br[0] === 0 && br[2] + br[3] === bytes.length && br[2] >= br[0] + br[1] };
}
/** The PDF date string /M for `d`. */
export const pdfDate = (d: Date) => 'D:' + d.toISOString().replace(/[-:T]|\.\d+/g, '').replace(/Z$/, "Z00'00'");
/** A PDF date string as a Date (null when unreadable). */
export function fromPdfDate(s: string): Date | null {
  const m = /^D:(\d{4})(\d\d)?(\d\d)?(\d\d)?(\d\d)?(\d\d)?(Z|[+-]\d\d'?\d\d'?)?/.exec(s);
  if (!m) return null;
  let t = Date.UTC(+m[1], +(m[2] ?? 1) - 1, +(m[3] ?? 1), +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  if (m[7] && m[7] !== 'Z') t -= (m[7][0] === '-' ? -1 : 1) * (+m[7].slice(1, 3) * 60 + +m[7].slice(3).replace(/'/g, '').padEnd(2, '0').slice(0, 2)) * 60_000;
  return new Date(t);
}
/** Does the raw file hold certificate signatures? (A quick scan of the bytes; signature dictionaries are never compressed.) */
export const hasSignatures = (bytes: Uint8Array) => /\/ByteRange\s*\[/.test(new TextDecoder('latin1').decode(bytes.subarray(Math.max(0, bytes.length - 4_000_000))));
/** Would saving `after` in place of `before` break `before`'s signatures? (Anything but appending to the file does.) */
export const willBreakSignatures = (before: Uint8Array, after: Uint8Array) => hasSignatures(before) && !(after.length >= before.length && same(after.subarray(0, before.length), before));
export { hex };
