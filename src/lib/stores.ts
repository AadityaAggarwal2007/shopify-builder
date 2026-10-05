import { query, queryOne } from './db';
import { open, seal, storeTokenAad } from './crypto';
import type { StoreAuth } from './shopify/client';

export interface StoreRow { id: string; name: string; shop_domain: string; scopes: string; connected_via: string; last_ok_at: string | null; created_at: string }

export async function listStores(): Promise<StoreRow[]> {
  const r = await query<StoreRow>(`SELECT id, name, shop_domain, scopes, connected_via, last_ok_at, created_at FROM stores ORDER BY created_at DESC`);
  return r.rows;
}

export async function saveStore(shopDomain: string, name: string, token: string, scopes: string, via: 'oauth' | 'token'): Promise<StoreRow> {
  const enc = seal(token, storeTokenAad(shopDomain));
  const r = await queryOne<StoreRow>(
    `INSERT INTO stores (name, shop_domain, token_enc, scopes, connected_via, last_ok_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (shop_domain) DO UPDATE SET name = EXCLUDED.name, token_enc = EXCLUDED.token_enc, scopes = EXCLUDED.scopes,
       connected_via = EXCLUDED.connected_via, last_ok_at = now(), updated_at = now()
     RETURNING id, name, shop_domain, scopes, connected_via, last_ok_at, created_at`,
    [name, shopDomain, enc, scopes, via],
  );
  return r!;
}

// The store with its token in the clear (server only, never sent to a screen).
export async function storeAuth(storeId: string): Promise<(StoreAuth & { id: string; name: string }) | null> {
  const row = await queryOne<{ id: string; name: string; shop_domain: string; token_enc: string }>(`SELECT id, name, shop_domain, token_enc FROM stores WHERE id = $1`, [storeId]);
  if (!row) return null;
  return { id: row.id, name: row.name, shopDomain: row.shop_domain, token: open(row.token_enc, storeTokenAad(row.shop_domain)) };
}

export async function markStoreOk(storeId: string): Promise<void> {
  await query(`UPDATE stores SET last_ok_at = now() WHERE id = $1`, [storeId]);
}
