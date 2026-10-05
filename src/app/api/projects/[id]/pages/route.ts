import { NextRequest, NextResponse } from 'next/server';
import { handle, HttpError, requireAuth } from '@/lib/http';
import { getProject } from '@/lib/projects';
import { query, queryOne } from '@/lib/db';
import { draftPages, publishPages, saveFacts } from '@/lib/pages/pages-run';
import { cleanHtml, EMPTY_FACTS, PAGE_KINDS, type StoreFacts } from '@/lib/pages/pages-ai';

export const maxDuration = 180;
type Ctx = { params: { id: string } };

export const GET = handle(async (request: NextRequest, { params }: Ctx) => {
  requireAuth(request);
  const project = await getProject(params.id);
  const p = await queryOne<{ store_facts: StoreFacts | null; style_sheet: unknown }>(`SELECT store_facts, style_sheet FROM projects WHERE id = $1`, [project.id]);
  const pages = await query(`SELECT id, kind, handle, title, body_html, status, error, updated_at FROM pages WHERE project_id = $1`, [project.id]);
  const ordered = PAGE_KINDS.map((k) => pages.rows.find((r) => r.handle === k.handle)).filter(Boolean);
  return NextResponse.json({ facts: { ...EMPTY_FACTS, store_name: project.store_name || '', ...(p?.store_facts || {}) }, has_style: !!p?.style_sheet, pages: ordered, kinds: PAGE_KINDS });
});

// POST { action: 'facts', facts } | { action: 'draft' } | { action: 'publish' }
export const POST = handle(async (request: NextRequest, { params }: Ctx) => {
  requireAuth(request);
  const project = await getProject(params.id);
  const b = await request.json().catch(() => ({}));
  try {
    if (b.action === 'facts') return NextResponse.json({ facts: await saveFacts(project.id, b.facts) });
    if (b.action === 'draft') return NextResponse.json({ pages: await draftPages(project.id) });
    if (b.action === 'publish') return NextResponse.json(await publishPages(project.id));
  } catch (err) { throw new HttpError(400, (err as Error).message); }
  throw new HttpError(400, 'Unknown action');
});

// PATCH { handle, title?, body_html? }: the owner's edit of one page.
export const PATCH = handle(async (request: NextRequest, { params }: Ctx) => {
  requireAuth(request);
  const project = await getProject(params.id);
  const b = await request.json().catch(() => ({}));
  const def = PAGE_KINDS.find((k) => k.handle === b.handle);
  if (!def) throw new HttpError(400, 'Which page?');
  const title = typeof b.title === 'string' && b.title.trim() ? b.title.trim().slice(0, 120) : null;
  const body = typeof b.body_html === 'string' ? cleanHtml(b.body_html) : null;
  await query(`INSERT INTO pages (project_id, kind, handle, title, body_html, status) VALUES ($1, $2, $3, $4, $5, 'draft')
    ON CONFLICT (project_id, handle) DO UPDATE SET title = COALESCE($4, pages.title), body_html = COALESCE($5, pages.body_html), status = 'draft', updated_at = now()`,
    [project.id, def.kind, def.handle, title ?? def.title, body ?? '']);
  return NextResponse.json({ ok: true });
});
