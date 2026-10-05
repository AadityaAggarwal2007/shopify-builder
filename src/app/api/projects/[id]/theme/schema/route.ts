import { NextRequest, NextResponse } from 'next/server';
import { handle, HttpError, requireAuth } from '@/lib/http';
import { getProject } from '@/lib/projects';
import { editorSchema } from '@/lib/theme/theme-run';

// GET: the uploaded theme's real settings, home page section types and header / footer groups,
// plus the pickers' choices (banner slots, collections, products, fonts), for the theme editor.
export const GET = handle(async (request: NextRequest, { params }: { params: { id: string } }) => {
  requireAuth(request);
  const project = await getProject(params.id);
  const out = await editorSchema(project.id);
  if (!out) throw new HttpError(400, 'Upload the theme zip first');
  return NextResponse.json(out);
});
