import { NextRequest, NextResponse } from 'next/server';
import { handle, HttpError, isUuid, requireAuth } from '@/lib/http';
import { listProjects } from '@/lib/projects';
import { query, queryOne } from '@/lib/db';

export const GET = handle(async (request: NextRequest) => {
  requireAuth(request);
  return NextResponse.json({ projects: await listProjects() });
});

export const POST = handle(async (request: NextRequest) => {
  requireAuth(request);
  const body = await request.json().catch(() => ({}));
  const name = String(body.name || '').trim().slice(0, 120);
  const storeId = String(body.store_id || '');
  if (!name) throw new HttpError(400, 'Give the project a name');
  if (!isUuid(storeId) || !(await queryOne(`SELECT 1 FROM stores WHERE id = $1`, [storeId]))) throw new HttpError(400, 'Pick a store');
  const r = await queryOne<{ id: string }>(`INSERT INTO projects (store_id, name) VALUES ($1, $2) RETURNING id`, [storeId, name]);
  await query(`SELECT 1`);
  return NextResponse.json({ id: r!.id });
});
