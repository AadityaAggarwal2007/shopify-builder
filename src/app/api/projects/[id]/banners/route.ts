import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { handle, HttpError, isUuid, requireAuth } from '@/lib/http';
import { getProject, touchProject } from '@/lib/projects';
import { query, queryOne } from '@/lib/db';
import { removeStored, storeFromUrl, storeImage, uploadsDir, MAX_UPLOAD_BYTES } from '@/lib/uploads';
import { bannerPrompt, generateImage, IMAGE_COST_USD } from '@/lib/ai/images';
import type { StyleSheet } from '@/lib/reference/style-sheet';

export const maxDuration = 120;
type Ctx = { params: { id: string } };
export const SLOTS = ['logo', 'hero', 'hero_mobile', 'offer', 'about', 'collection_1', 'collection_2', 'collection_3', 'collection_4'];
const slotOk = (s: unknown): s is string => typeof s === 'string' && SLOTS.includes(s);

// Banners and the logo live in `images` with kind 'banner' / 'logo' and alt = "<slot>|<description>".
export const GET = handle(async (request: NextRequest, { params }: Ctx) => {
  requireAuth(request);
  const project = await getProject(params.id);
  const r = await query<{ id: string; path: string; alt: string; source: string; width: number | null; height: number | null; kind: string }>(
    `SELECT id, path, alt, source, width, height, kind FROM images WHERE project_id = $1 AND kind IN ('banner', 'logo') AND path <> '' ORDER BY position, created_at`, [project.id]);
  const products = await query<{ id: string; title: string; path: string }>(`SELECT p.id, p.title, i.path FROM products p JOIN LATERAL (SELECT path FROM images WHERE product_id = p.id AND path <> '' ORDER BY position LIMIT 1) i ON true WHERE p.project_id = $1 ORDER BY p.position LIMIT 60`, [project.id]);
  return NextResponse.json({ slots: SLOTS, banners: r.rows.map((b) => ({ ...b, slot: b.alt.split('|')[0], description: b.alt.split('|')[1] || '' })), products: products.rows });
});

async function replaceSlot(projectId: string, slot: string): Promise<void> {
  const old = await query<{ path: string }>(`DELETE FROM images WHERE project_id = $1 AND kind IN ('banner', 'logo') AND split_part(alt, '|', 1) = $2 RETURNING path`, [projectId, slot]);
  for (const o of old.rows) if (o.path) await removeStored(o.path);
}
async function saveBanner(projectId: string, slot: string, stored: { path: string; width: number; height: number; bytes: number }, source: string, description: string, sourceUrl: string | null): Promise<{ id: string }> {
  await replaceSlot(projectId, slot);
  const r = await queryOne<{ id: string }>(`INSERT INTO images (project_id, kind, path, source, source_url, width, height, bytes, position, alt) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [projectId, slot === 'logo' ? 'logo' : 'banner', stored.path, source, sourceUrl, stored.width, stored.height, stored.bytes, SLOTS.indexOf(slot), `${slot}|${description.slice(0, 120)}`]);
  await touchProject(projectId);
  return r!;
}

// POST: multipart {slot, file, description} = upload; JSON {slot, url, description} = link;
// JSON {slot, ai: true, prompt, product_id?, with_text?} = generate.
export const POST = handle(async (request: NextRequest, { params }: Ctx) => {
  requireAuth(request);
  const project = await getProject(params.id);
  const ct = request.headers.get('content-type') || '';
  if (ct.includes('multipart/form-data')) {
    const form = await request.formData();
    const slot = form.get('slot'), file = form.get('file'), description = String(form.get('description') || '');
    if (!slotOk(slot)) throw new HttpError(400, 'Which banner?');
    if (!(file instanceof File)) throw new HttpError(400, 'Choose an image');
    if (file.size > MAX_UPLOAD_BYTES) throw new HttpError(400, 'Image is bigger than 15 MB');
    try {
      const s = await storeImage(project.id, Buffer.from(await file.arrayBuffer()), file.type);
      return NextResponse.json(await saveBanner(project.id, slot, s, 'upload', description, null));
    } catch (err) { throw new HttpError(400, (err as Error).message); }
  }
  const b = await request.json().catch(() => ({}));
  if (!slotOk(b.slot)) throw new HttpError(400, 'Which banner?');
  const description = String(b.description || b.prompt || '');
  if (b.ai) {
    const style = await queryOne<{ style_sheet: StyleSheet | null }>(`SELECT style_sheet FROM projects WHERE id = $1`, [project.id]);
    let input: { buffer: Buffer; mime: string } | undefined;
    if (isUuid(b.product_id)) {
      const img = await queryOne<{ path: string }>(`SELECT path FROM images WHERE product_id = $1 AND path <> '' ORDER BY position LIMIT 1`, [b.product_id]);
      if (img) { const abs = path.join(uploadsDir(), img.path); input = { buffer: await readFile(abs), mime: img.path.endsWith('.png') ? 'image/png' : img.path.endsWith('.webp') ? 'image/webp' : 'image/jpeg' }; }
    }
    const prompt = bannerPrompt(b.slot, String(b.prompt || ''), style?.style_sheet || null, !!b.with_text);
    try {
      const r = await generateImage(prompt, input);
      query(`INSERT INTO ai_runs (project_id, kind, model, images, cost_usd, ms, ok) VALUES ($1, 'image', $2, 1, $3, $4, true)`, [project.id, r.model, IMAGE_COST_USD, r.ms]).catch(() => {});
      const s = await storeImage(project.id, r.buffer, r.mime);
      return NextResponse.json({ ...(await saveBanner(project.id, b.slot, s, 'ai', description, null)), prompt });
    } catch (err) {
      query(`INSERT INTO ai_runs (project_id, kind, model, images, cost_usd, ms, ok) VALUES ($1, 'image', 'image', 0, 0, 0, false)`, [project.id]).catch(() => {});
      throw new HttpError(400, (err as Error).message);
    }
  }
  if (typeof b.url === 'string' && b.url.trim()) {
    try { const s = await storeFromUrl(project.id, b.url.trim()); return NextResponse.json(await saveBanner(project.id, b.slot, s, 'link', description, b.url.trim())); }
    catch (err) { throw new HttpError(400, (err as Error).message); }
  }
  throw new HttpError(400, 'Send a file, a link, or ai: true');
});

// DELETE ?slot=
export const DELETE = handle(async (request: NextRequest, { params }: Ctx) => {
  requireAuth(request);
  const project = await getProject(params.id);
  const slot = request.nextUrl.searchParams.get('slot');
  if (!slotOk(slot)) throw new HttpError(400, 'Which banner?');
  await replaceSlot(project.id, slot);
  await touchProject(project.id);
  return NextResponse.json({ ok: true });
});
