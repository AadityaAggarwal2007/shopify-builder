import { NextRequest, NextResponse } from 'next/server';
import { handle, HttpError, requireAuth } from '@/lib/http';
import { getProject } from '@/lib/projects';
import { publishTheme } from '@/lib/theme/theme-run';

export const maxDuration = 180;

export const POST = handle(async (request: NextRequest, { params }: { params: { id: string } }) => {
  requireAuth(request);
  const project = await getProject(params.id);
  try { return NextResponse.json(await publishTheme(project.id) ?? { ok: true }); }
  catch (err) { throw new HttpError(400, (err as Error).message); }
});
