import { NextRequest, NextResponse } from 'next/server';
import { handle, HttpError, requireAuth } from '@/lib/http';
import { getProject } from '@/lib/projects';
import { query, queryOne } from '@/lib/db';
import { buildStyleSheet } from '@/lib/reference/reference-run';
import { cleanStyleSheet, type StyleSheet } from '@/lib/reference/style-sheet';
import { normalizeUrl } from '@/lib/reference/read-site';

export const maxDuration = 120;
type Ctx = { params: { id: string } };

export const GET = handle(async (request: NextRequest, { params }: Ctx) => {
  requireAuth(request);
  const project = await getProject(params.id);
  const row = await queryOne<{ reference_url: string | null; reference_read: unknown; reference_read_at: string | null; style_sheet: StyleSheet | null }>(
    `SELECT reference_url, reference_read, reference_read_at, style_sheet FROM projects WHERE id = $1`, [project.id]);
  return NextResponse.json(row);
});

// POST { url }: read the site and draft the style sheet (replaces the old one).
export const POST = handle(async (request: NextRequest, { params }: Ctx) => {
  requireAuth(request);
  const project = await getProject(params.id);
  const body = await request.json().catch(() => ({}));
  const url = normalizeUrl(String(body.url || ''));
  if (!url) throw new HttpError(400, 'Paste the website address, e.g. https://example.com');
  try {
    const r = await buildStyleSheet(project.id, url);
    return NextResponse.json({ style_sheet: r.style, reference_read: r.site });
  } catch (err) {
    throw new HttpError(400, (err as Error).message);
  }
});

// PATCH { style_sheet }: the owner's edits.
export const PATCH = handle(async (request: NextRequest, { params }: Ctx) => {
  requireAuth(request);
  const project = await getProject(params.id);
  const body = await request.json().catch(() => ({}));
  const current = await queryOne<{ style_sheet: StyleSheet | null }>(`SELECT style_sheet FROM projects WHERE id = $1`, [project.id]);
  if (!current?.style_sheet) throw new HttpError(409, 'Read a reference site first');
  let next: StyleSheet;
  try { next = cleanStyleSheet(body.style_sheet, current.style_sheet); } catch (err) { throw new HttpError(400, (err as Error).message); }
  await query(`UPDATE projects SET style_sheet = $2, updated_at = now() WHERE id = $1`, [project.id, JSON.stringify(next)]);
  return NextResponse.json({ style_sheet: next });
});
