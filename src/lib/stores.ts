import { query, queryOne } from './db';
import { open, seal, storeTokenAad } from './crypto';
import type { StoreAuth } from './shopify/client';
import { clientCredentialsToken } from './shopify/oauth';

export interface StoreRow { id: string; name: string; shop_domain: string; scopes: string; connected_via: string; last_ok_at: string | null; created_at: string; token_expires_at?: string | null }

export async function listStores(): Promise<StoreRow[]> {
  const r = await query<StoreRow>(`SELECT id, name, shop_domain, scopes, connected_via, last_ok_at, created_at, token_expires_at FROM stores ORDER BY created_at DESC`);
  return r.rows;
}

export async function saveStore(shopDomain: string, name: string, token: string, scopes: string, via: 'oauth' | 'token' | 'client_credentials', expiresAt: Date | null = null): Promise<StoreRow> {
  const enc = seal(token, storeTokenAad(shopDomain));
  const r = await queryOne<StoreRow>(
    `INSERT INTO stores (name, shop_domain, token_enc, scopes, connected_via, last_ok_at, token_expires_at)
     VALUES ($1, $2, $3, $4, $5, now(), $6)
     ON CONFLICT (shop_domain) DO UPDATE SET name = EXCLUDED.name, token_enc = EXCLUDED.token_enc, scopes = EXCLUDED.scopes,
       connected_via = EXCLUDED.connected_via, last_ok_at = now(), token_expires_at = EXCLUDED.token_expires_at, updated_at = now()
     RETURNING id, name, shop_domain, scopes, connected_via, last_ok_at, created_at, token_expires_at`,
    [name, shopDomain, enc, scopes, via, expiresAt],
  );
  return r!;
}

// The store with its token in the clear (server only, never sent to a screen). A client-credentials
// token that expires within 10 minutes is renewed first.
export async function storeAuth(storeId: string): Promise<(StoreAuth & { id: string; name: string }) | null> {
  const row = await queryOne<{ id: string; name: string; shop_domain: string; token_enc: string; connected_via: string; token_expires_at: string | null }>(
    `SELECT id, name, shop_domain, token_enc, connected_via, token_expires_at FROM stores WHERE id = $1`, [storeId]);
  if (!row) return null;
  let token = open(row.token_enc, storeTokenAad(row.shop_domain));
  if (row.connected_via === 'client_credentials' && row.token_expires_at && new Date(row.token_expires_at).getTime() - Date.now() < 10 * 60_000) {
    const clientId = process.env.SHOPIFY_CLIENT_ID || '', clientSecret = process.env.SHOPIFY_CLIENT_SECRET || '';
    if (!clientId || !clientSecret) throw new Error('SHOPIFY_CLIENT_ID / SECRET are not set: the store token cannot be renewed');
    const t = await clientCredentialsToken(row.shop_domain, clientId, clientSecret);
    await saveStore(row.shop_domain, row.name, t.accessToken, t.scope, 'client_credentials', new Date(Date.now() + Math.max(600, t.expiresInSec) * 1000));
    token = t.accessToken;
  }
  return { id: row.id, name: row.name, shopDomain: row.shop_domain, token };
}

export async function markStoreOk(storeId: string): Promise<void> {
  await query(`UPDATE stores SET last_ok_at = now() WHERE id = $1`, [storeId]);
}
