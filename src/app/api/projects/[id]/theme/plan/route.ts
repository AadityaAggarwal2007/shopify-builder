import { NextRequest, NextResponse } from 'next/server';
import { handle, HttpError, requireAuth } from '@/lib/http';
import { getProject } from '@/lib/projects';
import { planTheme, savePlan } from '@/lib/theme/theme-run';

export const maxDuration = 180;

export const POST = handle(async (request: NextRequest, { params }: { params: { id: string } }) => {
  requireAuth(request);
  const project = await getProject(params.id);
  try { return NextResponse.json(await planTheme(project.id) ?? { ok: true }); }
  catch (err) { throw new HttpError(400, (err as Error).message); }
});

// The owner's edits from the theme editor: { plan } -> validated against the theme -> saved (Build again after).
export const PATCH = handle(async (request: NextRequest, { params }: { params: { id: string } }) => {
  requireAuth(request);
  const project = await getProject(params.id);
  const body = await request.json().catch(() => ({})) as { plan?: unknown };
  if (!body.plan || typeof body.plan !== 'object') throw new HttpError(400, 'plan missing');
  try { return NextResponse.json(await savePlan(project.id, body.plan)); }
  catch (err) { throw new HttpError(400, (err as Error).message); }
});
