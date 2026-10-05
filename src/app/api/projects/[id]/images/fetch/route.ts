import { NextRequest, NextResponse } from 'next/server';
import { handle, requireAuth } from '@/lib/http';
import { getProject } from '@/lib/projects';
import { query } from '@/lib/db';
import { storeFromUrl } from '@/lib/uploads';

// POST: fetch up to 8 queued CSV image links (images.path = ''), store them, answer how many remain.
// A link that fails is marked by `alt` prefix "!" and source 'csv_failed' so it is not tried again
// (the screen shows it; the owner can drop a photo instead).
export const POST = handle(async (request: NextRequest, { params }: { params: { id: string } }) => {
  requireAuth(request);
  const project = await getProject(params.id);
  const pending = await query<{ id: string; source_url: string }>(`SELECT id, source_url FROM images WHERE project_id = $1 AND path = '' AND source = 'csv' ORDER BY created_at LIMIT 8`, [project.id]);
  let done = 0, failed = 0;
  await Promise.all(pending.rows.map(async (im) => {
    try {
      const s = await storeFromUrl(project.id, im.source_url);
      await query(`UPDATE images SET path = $2, width = $3, height = $4, bytes = $5 WHERE id = $1`, [im.id, s.path, s.width, s.height, s.bytes]);
      done++;
    } catch (err) {
      await query(`UPDATE images SET source = 'csv_failed', alt = $2 WHERE id = $1`, [im.id, `Could not fetch: ${(err as Error).message}`.slice(0, 200)]);
      failed++;
    }
  }));
  const left = await query<{ n: number }>(`SELECT count(*)::int AS n FROM images WHERE project_id = $1 AND path = '' AND source = 'csv'`, [project.id]);
  return NextResponse.json({ done, failed, remaining: left.rows[0].n });
});
