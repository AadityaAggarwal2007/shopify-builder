import { NextRequest, NextResponse } from 'next/server';
import { handle, HttpError, isUuid, requireAuth } from '@/lib/http';
import { getProject } from '@/lib/projects';
import { query } from '@/lib/db';

export const GET = handle(async (request: NextRequest, { params }: { params: { id: string } }) => {
  requireAuth(request);
  const project = await getProject(params.id);
  const r = await query(`
    SELECT c.id, c.handle, c.title, c.rule_kind, c.rule_value, c.enabled, c.status, c.error, c.shopify_id,
      (SELECT count(*)::int FROM products p WHERE p.project_id = c.project_id AND ((c.rule_kind = 'type' AND p.product_type = c.rule_value) OR (c.rule_kind = 'tag' AND c.rule_value = ANY(p.tags)))) AS count
    FROM collections c WHERE c.project_id = $1 ORDER BY c.rule_kind, c.title`, [project.id]);
  return NextResponse.json({ collections: r.rows });
});

// PATCH { id, enabled } or { id, title }
export const PATCH = handle(async (request: NextRequest, { params }: { params: { id: string } }) => {
  requireAuth(request);
  const project = await getProject(params.id);
  const b = await request.json().catch(() => ({}));
  if (!isUuid(b.id)) throw new HttpError(400, 'Which collection?');
  const title = typeof b.title === 'string' ? b.title.trim().slice(0, 255) : null;
  if (title !== null && !title) throw new HttpError(400, 'Title cannot be empty');
  await query(`UPDATE collections SET enabled = COALESCE($3, enabled), title = COALESCE($4, title) WHERE id = $1 AND project_id = $2`,
    [b.id, project.id, typeof b.enabled === 'boolean' ? b.enabled : null, title]);
  return NextResponse.json({ ok: true });
});
