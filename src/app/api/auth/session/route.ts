import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { cryptoReady } from '@/lib/crypto';
import { aiReady } from '@/lib/ai/models';

export async function GET(request: NextRequest) {
  const user = getAuthFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  return NextResponse.json({
    user,
    setup: { dataKey: cryptoReady(), ai: aiReady(), shopifyApp: !!(process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET) },
  });
}
