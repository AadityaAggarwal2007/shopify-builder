import { NextRequest, NextResponse } from 'next/server';
import { handle, HttpError, isUuid, requireAuth } from '@/lib/http';
import { getProject, touchProject } from '@/lib/projects';
import { query, queryOne } from '@/lib/db';
import { removeStored, storeImage, MAX_UPLOAD_BYTES } from '@/lib/uploads';
import { MAX_IMAGES } from '@/lib/csv/product-csv';

type Ctx = { params: { id: string; pid: string } };

async function productOf(projectId: string, pid: string): Promise<string> {
  if (!isUuid(pid)) throw new HttpError(404, 'Product not found');
  const row = await queryOne<{ id: string }>(`SELECT id FROM products WHERE id = $1 AND project_id = $2`, [pid, projectId]);
  if (!row) throw new HttpError(404, 'Product not found');
  return row.id;
}

// POST multipart { files[] }: drag-dropped photos, appended after the existing ones.
export const POST = handle(async (request: NextRequest, { params }: Ctx) => {
  requireAuth(request);
  const project = await getProject(params.id);
  const productId = await productOf(project.id, params.pid);
  const form = await request.formData();
  const files = form.getAll('files').filter((f): f is File => f instanceof File);
  if (!files.length) throw new HttpError(400, 'No files');
  const have = await queryOne<{ n: number; max: number }>(`SELECT count(*)::int AS n, COALESCE(max(position), 0)::int AS max FROM images WHERE product_id = $1`, [productId]);
  let n = have?.n || 0, pos = have?.max || 0;
  const added: { id: string; path: string; position: number }[] = [];
  const problems: string[] = [];
  for (const f of files) {
    if (n >= MAX_IMAGES) { problems.push(`${f.name}: a product can have ${MAX_IMAGES} photos at most`); continue; }
    if (f.size > MAX_UPLOAD_BYTES) { problems.push(`${f.name}: bigger than 15 MB`); continue; }
    try {
      const s = await storeImage(project.id, Buffer.from(await f.arrayBuffer()), f.type);
      const r = await queryOne<{ id: string }>(`INSERT INTO images (project_id, product_id, kind, path, source, width, height, bytes, position) VALUES ($1, $2, 'product', $3, 'upload', $4, $5, $6, $7) RETURNING id`,
        [project.id, productId, s.path, s.width, s.height, s.bytes, ++pos]);
      added.push({ id: r!.id, path: s.path, position: pos }); n++;
    } catch (err) {
      problems.push(`${f.name}: ${(err as Error).message}`);
    }
  }
  if (added.length) await query(`UPDATE products SET status = CASE WHEN status = 'pushed' THEN 'draft' ELSE status END, updated_at = now() WHERE id = $1`, [productId]);
  await touchProject(project.id);
  return NextResponse.json({ added, problems });
});

// PATCH { order: [imageId, ...] }: new order (first = main photo). Or { id, alt }.
export const PATCH = handle(async (request: NextRequest, { params }: Ctx) => {
  requireAuth(request);
  const project = await getProject(params.id);
  const productId = await productOf(project.id, params.pid);
  const b = await request.json().catch(() => ({}));
  if (Array.isArray(b.order)) {
    const ids = b.order.filter(isUuid);
    for (let i = 0; i < ids.length; i++) await query(`UPDATE images SET position = $3 WHERE id = $1 AND product_id = $2`, [ids[i], productId, i + 1]);
  }
  if (isUuid(b.id) && typeof b.alt === 'string') await query(`UPDATE images SET alt = $3 WHERE id = $1 AND product_id = $2`, [b.id, productId, b.alt.trim().slice(0, 255)]);
  await query(`UPDATE products SET status = CASE WHEN status = 'pushed' THEN 'draft' ELSE status END, updated_at = now() WHERE id = $1`, [productId]);
  return NextResponse.json({ ok: true });
});

// DELETE ?image=<id>
export const DELETE = handle(async (request: NextRequest, { params }: Ctx) => {
  requireAuth(request);
  const project = await getProject(params.id);
  const productId = await productOf(project.id, params.pid);
  const imageId = request.nextUrl.searchParams.get('image') || '';
  if (!isUuid(imageId)) throw new HttpError(400, 'Which image?');
  const row = await queryOne<{ path: string }>(`DELETE FROM images WHERE id = $1 AND product_id = $2 RETURNING path`, [imageId, productId]);
  if (row?.path) await removeStored(row.path);
  await query(`UPDATE products SET status = CASE WHEN status = 'pushed' THEN 'draft' ELSE status END, updated_at = now() WHERE id = $1`, [productId]);
  return NextResponse.json({ ok: true });
});
