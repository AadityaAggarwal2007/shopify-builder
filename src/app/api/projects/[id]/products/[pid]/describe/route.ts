import { NextRequest, NextResponse } from 'next/server';
import { handle, HttpError, isUuid, requireAuth } from '@/lib/http';
import { getProject } from '@/lib/projects';
import { describeOne } from '@/lib/ai/describe-run';

export const POST = handle(async (request: NextRequest, { params }: { params: { id: string; pid: string } }) => {
  requireAuth(request);
  const project = await getProject(params.id);
  if (!isUuid(params.pid)) throw new HttpError(404, 'Product not found');
  const html = await describeOne(project.id, params.pid);
  return NextResponse.json({ body_html: html });
});
