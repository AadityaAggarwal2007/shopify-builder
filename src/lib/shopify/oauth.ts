// OAuth for a Dev Dashboard app with custom distribution (authorization code grant, offline token).
// Since 2026-01-01 the store admin's "Develop apps" custom app cannot be created any more, so this is
// how a NEW store is connected; a legacy `shpat_` token can still be pasted (connect/route.ts).
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

export const SCOPES = [
  'read_products', 'write_products',
  'read_publications', 'write_publications',
  'write_content',
  'write_legal_policies',
  'write_online_store_navigation',
  'read_themes', 'write_themes',
  'read_files', 'write_files',
  'write_shipping',
];

// Accepts any way of writing a store: admin.shopify.com/store/<handle>, https://x.myshopify.com/,
// x.myshopify.com, or just x. Returns null for anything that is not a myshopify host.
export function normalizeShop(input: string): string | null {
  let s = (input || '').trim().toLowerCase();
  if (!s) return null;
  const admin = s.match(/admin\.shopify\.com\/store\/([a-z0-9-]+)/);
  if (admin) s = `${admin[1]}.myshopify.com`;
  else {
    s = s.replace(/^https?:\/\//, '').replace(/[/?#].*$/, '');
    if (!s.includes('.')) s = `${s}.myshopify.com`;
  }
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(s) ? s : null;
}

export function authorizeUrl(shop: string, clientId: string, redirectUri: string, state: string): string {
  return `https://${shop}/admin/oauth/authorize?` + new URLSearchParams({
    client_id: clientId, scope: SCOPES.join(','), redirect_uri: redirectUri, state,
  }).toString();
}

// Shopify signs the callback's query string with the client secret: hex HMAC-SHA256 over the
// parameters (hmac and signature removed), sorted by key, serialised exactly as
// URLSearchParams.toString() does (form-encoding: the base64 '=' of `host` becomes %3D) with '+'
// written as %20. This is what Shopify's own @shopify/shopify-api does (ProcessedQuery.stringify);
// the prose in the docs ("only & and % are escaped") does not match real callbacks. Constant-time compare.
export function callbackMessage(searchParams: URLSearchParams): string {
  const params = new URLSearchParams();
  for (const [k, v] of searchParams.entries()) if (k !== 'hmac' && k !== 'signature') params.append(k, v);
  params.sort();
  return params.toString().replace(/\+/g, '%20');
}
export function verifyCallbackHmac(searchParams: URLSearchParams, clientSecret: string): boolean {
  const hmac = searchParams.get('hmac') || '';
  const expected = createHmac('sha256', clientSecret).update(callbackMessage(searchParams)).digest('hex');
  const a = Buffer.from(hmac), b = Buffer.from(expected);
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

// Nonces: one per started connect, in memory, 10 minutes. A callback whose state is unknown is refused.
const nonces = new Map<string, { shop: string; until: number }>();
export function newState(shop: string): string {
  const nonce = randomBytes(16).toString('hex');
  for (const [k, v] of nonces) if (v.until < Date.now()) nonces.delete(k);
  nonces.set(nonce, { shop, until: Date.now() + 10 * 60_000 });
  return nonce;
}
export function takeState(state: string, shop: string): boolean {
  const e = nonces.get(state);
  nonces.delete(state);
  return !!e && e.until >= Date.now() && e.shop === shop;
}

export async function exchangeCode(shop: string, code: string, clientId: string, clientSecret: string): Promise<{ accessToken: string; scope: string }> {
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  });
  if (!res.ok) throw new Error(`Token exchange failed (${res.status})`);
  const json = await res.json();
  if (!json.access_token) throw new Error('Token exchange returned no access token');
  return { accessToken: String(json.access_token), scope: String(json.scope || '') };
}
