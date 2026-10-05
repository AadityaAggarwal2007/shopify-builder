import { NextRequest, NextResponse } from 'next/server';
import { handle, requireAuth } from '@/lib/http';
import { getProject } from '@/lib/projects';
import { query } from '@/lib/db';
import { describeOne } from '@/lib/ai/describe-run';

// POST { only_empty?: boolean }: describes up to 5 products per call (the screen calls again while
// `remaining` > 0). only_empty (default true) = products whose description is empty or short.
export const POST = handle(async (request: NextRequest, { params }: { params: { id: string } }) => {
  requireAuth(request);
  const project = await getProject(params.id);
  const b = await request.json().catch(() => ({}));
  const onlyEmpty = b.only_empty !== false;
  const cond = onlyEmpty ? `AND length(regexp_replace(body_html, '<[^>]+>', '', 'g')) < 40` : `AND ai_described_at IS NULL`;
  const todo = await query<{ id: string }>(`SELECT id FROM products WHERE project_id = $1 ${cond} ORDER BY position LIMIT 5`, [project.id]);
  let done = 0; const problems: string[] = [];
  for (const p of todo.rows) {
    try { await describeOne(project.id, p.id); done++; } catch (err) { problems.push((err as Error).message); if (problems.length >= 2) break; }
  }
  const left = await query<{ n: number }>(`SELECT count(*)::int AS n FROM products WHERE project_id = $1 ${cond}`, [project.id]);
  return NextResponse.json({ done, remaining: problems.length ? 0 : left.rows[0].n, problems });
});
