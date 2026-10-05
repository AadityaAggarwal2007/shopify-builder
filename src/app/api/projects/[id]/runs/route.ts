import { NextRequest, NextResponse } from 'next/server';
import { handle, requireAuth } from '@/lib/http';
import { getProject } from '@/lib/projects';
import { query } from '@/lib/db';

export const GET = handle(async (request: NextRequest, { params }: { params: { id: string } }) => {
  requireAuth(request);
  const project = await getProject(params.id);
  const r = await query(`SELECT id, step, started_at, finished_at, ok_count, fail_count, log FROM publish_runs WHERE project_id = $1 ORDER BY started_at DESC LIMIT 10`, [project.id]);
  return NextResponse.json({ runs: r.rows });
});
