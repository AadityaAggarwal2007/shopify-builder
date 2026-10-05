import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { handle, HttpError, requireAuth } from '@/lib/http';
import { getProject } from '@/lib/projects';
import { builtZipPath } from '@/lib/theme/theme-run';

// GET ?token=<login token>: the built zip, for the manual upload in Shopify admin.
export const GET = handle(async (request: NextRequest, { params }: { params: { id: string } }) => {
  const tok = request.nextUrl.searchParams.get('token');
  const req = tok ? new Request(request.url, { headers: { authorization: `Bearer ${tok}` } }) : request;
  requireAuth(req);
  const project = await getProject(params.id);
  let buf: Buffer;
  try { buf = await readFile(await builtZipPath(project.id)); } catch { throw new HttpError(404, 'Build the theme first'); }
  return new NextResponse(new Uint8Array(buf), { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${project.name.replace(/[^a-z0-9]+/gi, '-')}-theme.zip"` } });
});
