import { NextRequest, NextResponse } from 'next/server';
import { handle, HttpError, requireAuth } from '@/lib/http';
import { getProject } from '@/lib/projects';
import { query, queryOne } from '@/lib/db';
import { removeStored } from '@/lib/uploads';

type Ctx = { params: { id: string } };

export const GET = handle(async (request: NextRequest, { params }: Ctx) => {
  requireAuth(request);
  const project = await getProject(params.id);
  const counts = await queryOne<{ products: number; pushed: number; errors: number; images: number; pending_images: number; described: number }>(`
    SELECT
      (SELECT count(*)::int FROM products WHERE project_id = $1) AS products,
      (SELECT count(*)::int FROM products WHERE project_id = $1 AND status = 'pushed') AS pushed,
      (SELECT count(*)::int FROM products WHERE project_id = $1 AND status = 'error') AS errors,
      (SELECT count(*)::int FROM images WHERE project_id = $1 AND kind = 'product' AND path <> '') AS images,
      (SELECT count(*)::int FROM images WHERE project_id = $1 AND path = '') AS pending_images,
      (SELECT count(*)::int FROM products WHERE project_id = $1 AND ai_described_at IS NOT NULL) AS described`, [project.id]);
  const lastRun = await queryOne(`SELECT id, step, started_at, finished_at, ok_count, fail_count FROM publish_runs WHERE project_id = $1 ORDER BY started_at DESC LIMIT 1`, [project.id]);
  return NextResponse.json({ project, counts, last_run: lastRun });
});

export const PATCH = handle(async (request: NextRequest, { params }: Ctx) => {
  requireAuth(request);
  const project = await getProject(params.id);
  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : null;
  if (name !== null && !name) throw new HttpError(400, 'Name cannot be empty');
  await query(`UPDATE projects SET name = COALESCE($2, name), updated_at = now() WHERE id = $1`, [project.id, name]);
  return NextResponse.json({ ok: true });
});

// Deletes the project in the TOOL only (its rows and files). Nothing in Shopify changes.
export const DELETE = handle(async (request: NextRequest, { params }: Ctx) => {
  requireAuth(request);
  const project = await getProject(params.id);
  const files = await query<{ path: string }>(`SELECT path FROM images WHERE project_id = $1 AND path <> ''`, [project.id]);
  await query(`DELETE FROM projects WHERE id = $1`, [project.id]);
  for (const f of files.rows) await removeStored(f.path);
  return NextResponse.json({ ok: true });
});
