import { NextRequest, NextResponse } from 'next/server';
import { handle, HttpError, requireAuth } from '@/lib/http';
import { saveStore } from '@/lib/stores';
import { clientCredentialsToken, normalizeShop } from '@/lib/shopify/oauth';
import { getShop } from '@/lib/shopify/admin';
import { cryptoReady } from '@/lib/crypto';

// POST { shop }: "Connect directly": the Dev Dashboard app's client credentials give a token for a
// store of the same organization (the app must be installed on it). No callback, no signature.
export const POST = handle(async (request: NextRequest) => {
  requireAuth(request);
  if (!cryptoReady()) throw new HttpError(503, 'BUILDER_DATA_KEY is not set on the server');
  const clientId = process.env.SHOPIFY_CLIENT_ID || '', clientSecret = process.env.SHOPIFY_CLIENT_SECRET || '';
  if (!clientId || !clientSecret) throw new HttpError(503, 'SHOPIFY_CLIENT_ID / SECRET are not set on the server');
  const body = await request.json().catch(() => ({}));
  const shop = normalizeShop(String(body.shop || ''));
  if (!shop) throw new HttpError(400, 'Store address should look like mystore.myshopify.com');
  try {
    const t = await clientCredentialsToken(shop, clientId, clientSecret);
    const info = await getShop({ shopDomain: shop, token: t.accessToken });
    const row = await saveStore(info.myshopifyDomain || shop, info.name || shop, t.accessToken, t.scope, 'client_credentials', new Date(Date.now() + Math.max(600, t.expiresInSec) * 1000));
    return NextResponse.json({ store: row, shop: info, scope: t.scope });
  } catch (err) {
    throw new HttpError(400, (err as Error).message);
  }
});
