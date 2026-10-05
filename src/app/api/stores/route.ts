import { NextRequest, NextResponse } from 'next/server';
import { handle, HttpError, requireAuth } from '@/lib/http';
import { listStores, saveStore } from '@/lib/stores';
import { normalizeShop } from '@/lib/shopify/oauth';
import { getShop } from '@/lib/shopify/admin';
import { ShopifyError } from '@/lib/shopify/client';
import { cryptoReady } from '@/lib/crypto';

export const GET = handle(async (request: NextRequest) => {
  requireAuth(request);
  return NextResponse.json({ stores: await listStores() });
});

// Paste a legacy custom-app token (shpat_...). The token is tested with a `shop` query before it is saved.
export const POST = handle(async (request: NextRequest) => {
  requireAuth(request);
  if (!cryptoReady()) throw new HttpError(503, 'BUILDER_DATA_KEY is not set on the server');
  const body = await request.json().catch(() => ({}));
  const shop = normalizeShop(String(body.shop || ''));
  const token = String(body.token || '').trim();
  if (!shop) throw new HttpError(400, 'Store address should look like mystore.myshopify.com');
  if (!/^shp[a-z]{2}_[0-9a-f]{20,}$/i.test(token)) throw new HttpError(400, 'That does not look like an Admin API access token (shpat_...)');
  try {
    const info = await getShop({ shopDomain: shop, token });
    const row = await saveStore(info.myshopifyDomain || shop, info.name || shop, token, '', 'token');
    return NextResponse.json({ store: row, shop: info });
  } catch (err) {
    if (err instanceof ShopifyError) throw new HttpError(400, `Shopify refused the token: ${err.message}`);
    throw err;
  }
});
