import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { baseUrl } from '@/lib/http';
import { authorizeUrl, newState, normalizeShop } from '@/lib/shopify/oauth';
import { cryptoReady } from '@/lib/crypto';

// GET /api/shopify/connect?shop=x&token=<login token>: the browser navigates here (no header), so the
// login token comes as a query param, then Shopify's consent page opens.
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const user = verifyToken(sp.get('token') || '');
  if (!user) return NextResponse.redirect(`${baseUrl()}/login`);
  const shop = normalizeShop(sp.get('shop') || '');
  if (!shop) return NextResponse.redirect(`${baseUrl()}/stores?error=${encodeURIComponent('Store address should look like mystore.myshopify.com')}`);
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  if (!clientId || !process.env.SHOPIFY_CLIENT_SECRET) return NextResponse.redirect(`${baseUrl()}/stores?error=${encodeURIComponent('SHOPIFY_CLIENT_ID / SECRET are not set on the server')}`);
  if (!cryptoReady()) return NextResponse.redirect(`${baseUrl()}/stores?error=${encodeURIComponent('BUILDER_DATA_KEY is not set on the server')}`);
  const state = newState(shop);
  return NextResponse.redirect(authorizeUrl(shop, clientId, `${baseUrl()}/api/shopify/callback`, state));
}
