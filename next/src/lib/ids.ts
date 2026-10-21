// Digital IDs kept on this device (IndexedDB store `ids`): the certificate in the clear, the private key locked with a
// passphrase the person sets — PBKDF2-SHA-256 (600 000 rounds, random salt) → AES-GCM. Unlocking gives a WebCrypto key
// that signs and cannot be exported; the passphrase itself is never kept. Removing an ID deletes it; nothing is sent.
import { makeId, parseCert, type Cert, type IdSpec, type KeyAlg } from './engine/pades';
import { openPfx } from './engine/pfx';
import { dropId, idList, keepId } from './store';

export type DigitalId = { key: string; at: number; alg: KeyAlg; cert: Uint8Array; chain: Uint8Array[]; salt: Uint8Array; iv: Uint8Array; locked: Uint8Array };
export type Unlocked = { id: DigitalId; key: CryptoKey; cert: Cert };
const ROUNDS = 600_000;
const subtle = crypto.subtle;

async function wrapKey(passphrase: string, salt: Uint8Array) {
  const base = await subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as Uint8Array<ArrayBuffer>, iterations: ROUNDS }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function lock(alg: KeyAlg, cert: Uint8Array, chain: Uint8Array[], pkcs8: Uint8Array, passphrase: string): Promise<DigitalId> {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const locked = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, await wrapKey(passphrase, salt), pkcs8 as Uint8Array<ArrayBuffer>));
  const id: DigitalId = { key: crypto.randomUUID(), at: Date.now(), alg, cert, chain, salt, iv, locked };
  await keepId(id);
  return id;
}
export const importParams = (alg: KeyAlg) => alg === 'rsa' ? { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' } : { name: 'ECDSA', namedCurve: 'P-256' };

/** A new self-signed ID made on this device, kept locked with `passphrase`. */
export async function createId(spec: IdSpec, passphrase: string) {
  const { cert, key } = await makeId(spec);
  return lock(spec.alg, cert, [], key, passphrase);
}
/** An ID from a .pfx / .p12 file (its `password` opens it once and is forgotten), kept locked with `passphrase`. */
export async function importId(pfx: Uint8Array, password: string, passphrase: string) {
  const o = await openPfx(pfx, password);
  return lock(o.alg, o.cert, o.chain, o.key, passphrase);
}
/** The ID's signing key for this sitting; throws WRONG_PASSPHRASE. */
export async function unlockId(id: DigitalId, passphrase: string): Promise<Unlocked> {
  let pkcs8: ArrayBuffer;
  try { pkcs8 = await subtle.decrypt({ name: 'AES-GCM', iv: id.iv as Uint8Array<ArrayBuffer> }, await wrapKey(passphrase, id.salt), id.locked as Uint8Array<ArrayBuffer>); } catch { throw new Error('WRONG_PASSPHRASE'); }
  const key = await subtle.importKey('pkcs8', pkcs8, importParams(id.alg), false, ['sign']);
  return { id, key, cert: parseCert(id.cert) };
}
export const listIds = () => idList<DigitalId>();
export const removeId = dropId;
