import { NextRequest, NextResponse } from 'next/server';
import { handle, HttpError, isUuid, requireAuth } from '@/lib/http';
import { getProject, touchProject } from '@/lib/projects';
import { query, queryOne, withTransaction } from '@/lib/db';
import { removeStored } from '@/lib/uploads';

type Ctx = { params: { id: string; pid: string } };

async function productOf(projectId: string, pid: string): Promise<{ id: string }> {
  if (!isUuid(pid)) throw new HttpError(404, 'Product not found');
  const row = await queryOne<{ id: string }>(`SELECT id FROM products WHERE id = $1 AND project_id = $2`, [pid, projectId]);
  if (!row) throw new HttpError(404, 'Product not found');
  return row;
}

// PATCH: title, body_html, vendor, product_type, tags, and variant prices / skus ({variants: [{id, price, compare_at, sku}]}).
export const PATCH = handle(async (request: NextRequest, { params }: Ctx) => {
  requireAuth(request);
  const project = await getProject(params.id);
  const p = await productOf(project.id, params.pid);
  const b = await request.json().catch(() => ({}));
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : null);
  const title = str(b.title, 255);
  if (title !== null && !title) throw new HttpError(400, 'Title cannot be empty');
  const tags = Array.isArray(b.tags) ? b.tags.map((t: unknown) => String(t).trim()).filter(Boolean).slice(0, 250) : null;
  await withTransaction(async (c) => {
    await c.query(`UPDATE products SET title = COALESCE($2, title), body_html = COALESCE($3, body_html), vendor = COALESCE($4, vendor), product_type = COALESCE($5, product_type), tags = COALESCE($6, tags),
      status = CASE WHEN status = 'pushed' THEN 'draft' ELSE status END, updated_at = now() WHERE id = $1`,
      [p.id, title, str(b.body_html, 60_000), str(b.vendor, 255), str(b.product_type, 255), tags]);
    if (Array.isArray(b.variants)) {
      for (const v of b.variants) {
        if (!isUuid(v?.id)) continue;
        const price = v.price === undefined ? null : Number(v.price);
        if (price !== null && !(Number.isFinite(price) && price >= 0 && price < 10_000_000)) throw new HttpError(400, 'Price must be a number');
        const cmp = v.compare_at === undefined ? undefined : (v.compare_at === null || v.compare_at === '' ? null : Number(v.compare_at));
        if (cmp !== undefined && cmp !== null && !(Number.isFinite(cmp) && cmp >= 0)) throw new HttpError(400, 'Compare-at price must be a number');
        await c.query(`UPDATE variants SET price = COALESCE($2, price), compare_at = CASE WHEN $4 THEN $3 ELSE compare_at END, sku = COALESCE($5, sku) WHERE id = $1 AND product_id = $6`,
          [v.id, price, cmp === undefined ? null : cmp, cmp !== undefined, str(v.sku, 255), p.id]);
      }
    }
  });
  await touchProject(project.id);
  return NextResponse.json({ ok: true });
});

export const DELETE = handle(async (request: NextRequest, { params }: Ctx) => {
  requireAuth(request);
  const project = await getProject(params.id);
  const p = await productOf(project.id, params.pid);
  const files = await query<{ path: string }>(`SELECT path FROM images WHERE product_id = $1 AND path <> ''`, [p.id]);
  await query(`DELETE FROM products WHERE id = $1`, [p.id]);
  for (const f of files.rows) await removeStored(f.path);
  await touchProject(project.id);
  return NextResponse.json({ ok: true });
});
