import { NextRequest, NextResponse } from 'next/server';
import { handle, HttpError, requireAuth } from '@/lib/http';
import { getProject } from '@/lib/projects';
import { query } from '@/lib/db';
import { CHECKLIST } from '@/lib/pages/checklist';

type Ctx = { params: { id: string } };

export const GET = handle(async (request: NextRequest, { params }: Ctx) => {
  requireAuth(request);
  const project = await getProject(params.id);
  const done = await query<{ item: string; done_at: string }>(`SELECT item, done_at FROM checklist WHERE project_id = $1`, [project.id]);
  const admin = `https://admin.shopify.com/store/${(project.shop_domain || '').replace('.myshopify.com', '')}`;
  return NextResponse.json({ items: CHECKLIST.map((c) => ({ ...c, url: admin + c.path, done_at: done.rows.find((d) => d.item === c.key)?.done_at || null })) });
});

// PATCH { key, done }
export const PATCH = handle(async (request: NextRequest, { params }: Ctx) => {
  requireAuth(request);
  const project = await getProject(params.id);
  const b = await request.json().catch(() => ({}));
  if (!CHECKLIST.some((c) => c.key === b.key)) throw new HttpError(400, 'Which item?');
  if (b.done) await query(`INSERT INTO checklist (project_id, item, done_at) VALUES ($1, $2, now()) ON CONFLICT (project_id, item) DO UPDATE SET done_at = now()`, [project.id, b.key]);
  else await query(`DELETE FROM checklist WHERE project_id = $1 AND item = $2`, [project.id, b.key]);
  return NextResponse.json({ ok: true });
});
