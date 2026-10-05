import { NextRequest, NextResponse } from 'next/server';
import { baseUrl } from '@/lib/http';
import { exchangeCode, normalizeShop, takeState, verifyCallbackHmac } from '@/lib/shopify/oauth';
import { getShop } from '@/lib/shopify/admin';
import { saveStore } from '@/lib/stores';

// Shopify sends the merchant back here with code + shop + state + hmac.
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const back = (msg: string, ok = false) => NextResponse.redirect(`${baseUrl()}/stores?${ok ? 'connected' : 'error'}=${encodeURIComponent(msg)}`);
  const secret = process.env.SHOPIFY_CLIENT_SECRET || '';
  const clientId = process.env.SHOPIFY_CLIENT_ID || '';
  if (!secret || !clientId) return back('SHOPIFY_CLIENT_ID / SECRET are not set on the server');
  if (!verifyCallbackHmac(sp, secret)) return back('Shopify callback failed its signature check');
  const shop = normalizeShop(sp.get('shop') || '');
  if (!shop) return back('Shopify sent an unknown store');
  if (!takeState(sp.get('state') || '', shop)) return back('This connect link is old or was not started here. Press Connect again.');
  try {
    const { accessToken, scope } = await exchangeCode(shop, sp.get('code') || '', clientId, secret);
    const info = await getShop({ shopDomain: shop, token: accessToken });
    await saveStore(info.myshopifyDomain || shop, info.name || shop, accessToken, scope, 'oauth');
    return back(info.name || shop, true);
  } catch (err) {
    console.error('[shopify] callback failed:', (err as Error).message);
    return back((err as Error).message);
  }
}
