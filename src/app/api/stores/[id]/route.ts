import { NextRequest, NextResponse } from 'next/server';
import { handle, HttpError, isUuid, requireAuth } from '@/lib/http';
import { query, queryOne } from '@/lib/db';
import { storeAuth } from '@/lib/stores';
import { getShop } from '@/lib/shopify/admin';

// GET = test the connection now. DELETE = forget the store (its projects go too; nothing in Shopify changes).
export const GET = handle(async (request: NextRequest, { params }: { params: { id: string } }) => {
  requireAuth(request);
  if (!isUuid(params.id)) throw new HttpError(404, 'Store not found');
  const store = await storeAuth(params.id);
  if (!store) throw new HttpError(404, 'Store not found');
  try {
    const info = await getShop(store);
    await query(`UPDATE stores SET last_ok_at = now() WHERE id = $1`, [store.id]);
    return NextResponse.json({ ok: true, shop: info });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message });
  }
});

export const DELETE = handle(async (request: NextRequest, { params }: { params: { id: string } }) => {
  requireAuth(request);
  if (!isUuid(params.id)) throw new HttpError(404, 'Store not found');
  const n = await queryOne<{ n: number }>(`SELECT count(*)::int AS n FROM projects WHERE store_id = $1`, [params.id]);
  if ((n?.n || 0) > 0) throw new HttpError(409, `This store has ${n!.n} project(s). Delete them first.`);
  await query(`DELETE FROM stores WHERE id = $1`, [params.id]);
  return NextResponse.json({ ok: true });
});
