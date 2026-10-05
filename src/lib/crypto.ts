// Store tokens at rest: AES-256-GCM with BUILDER_DATA_KEY (32 random bytes, base64 or 64 hex).
// Pattern from ShipTrack's refund crypto. No key = no store can be used (fail closed). The AAD binds
// a blob to its store row, so a blob copied onto another row does not open.
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'crypto';

export class CryptoError extends Error {
  constructor(public code: 'no_key' | 'bad_blob' | 'unknown_key' | 'auth_failed') {
    super(code);
    this.name = 'CryptoError';
  }
}

function parseKey(raw: string | undefined): Buffer | null {
  const s = (raw || '').trim();
  if (!s) return null;
  if (/^[0-9a-fA-F]{64}$/.test(s)) return Buffer.from(s, 'hex');
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(s)) return null;
  const b = Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  return b.length === 32 ? b : null;
}

interface Keyset { id: string; enc: Buffer }
const cache = new Map<string, Keyset | null>();
function keyset(): Keyset | null {
  const raw = process.env.BUILDER_DATA_KEY || '';
  if (!cache.has(raw)) {
    if (cache.size > 8) cache.clear();
    const master = parseKey(raw);
    cache.set(raw, master ? {
      id: createHash('sha256').update('builder-kid:').update(master).digest('hex').slice(0, 8),
      enc: Buffer.from(hkdfSync('sha256', master, Buffer.from('shopify-builder-v1'), 'store-token-v1', 32)),
    } : null);
  }
  return cache.get(raw) || null;
}

export const cryptoReady = (): boolean => keyset() !== null;

const b64u = (b: Buffer) => b.toString('base64url');
const unb64u = (s: string) => Buffer.from(s, 'base64url');

// Blob: v1.<keyId>.<iv>.<tag>.<ciphertext>, all base64url.
export function seal(plain: string, aad: string): string {
  const k = keyset();
  if (!k) throw new CryptoError('no_key');
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', k.enc, iv);
  c.setAAD(Buffer.from(aad, 'utf8'));
  const ct = Buffer.concat([c.update(Buffer.from(plain, 'utf8')), c.final()]);
  return `v1.${k.id}.${b64u(iv)}.${b64u(c.getAuthTag())}.${b64u(ct)}`;
}

export function open(blob: string, aad: string): string {
  const parts = typeof blob === 'string' ? blob.split('.') : [];
  if (parts.length !== 5 || parts[0] !== 'v1') throw new CryptoError('bad_blob');
  const k = keyset();
  if (!k) throw new CryptoError('no_key');
  if (k.id !== parts[1]) throw new CryptoError('unknown_key');
  const iv = unb64u(parts[2]), tag = unb64u(parts[3]), ct = unb64u(parts[4]);
  if (iv.length !== 12 || tag.length !== 16) throw new CryptoError('bad_blob');
  try {
    const d = createDecipheriv('aes-256-gcm', k.enc, iv);
    d.setAAD(Buffer.from(aad, 'utf8'));
    d.setAuthTag(tag);
    return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
  } catch {
    throw new CryptoError('auth_failed');
  }
}

export const storeTokenAad = (shopDomain: string) => `store-token:${shopDomain}`;
