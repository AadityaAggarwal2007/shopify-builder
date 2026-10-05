import { NextRequest, NextResponse } from 'next/server';
import { handle, HttpError, requireAuth } from '@/lib/http';
import { getProject } from '@/lib/projects';
import { saveThemeUpload } from '@/lib/theme/theme-run';
import { MAX_THEME_ZIP } from '@/lib/theme/theme-zip';

export const maxDuration = 120;

// POST multipart { file }: the theme zip the owner wants on the store.
export const POST = handle(async (request: NextRequest, { params }: { params: { id: string } }) => {
  requireAuth(request);
  const project = await getProject(params.id);
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw new HttpError(400, 'Choose the theme .zip');
  if (file.size > MAX_THEME_ZIP) throw new HttpError(400, 'Theme zip is bigger than 60 MB');
  try {
    const r = await saveThemeUpload(project.id, Buffer.from(await file.arrayBuffer()));
    return NextResponse.json({ name: r.summary.name, version: r.summary.version, sections: Object.keys(r.summary.sections), settings: r.summary.settings.length, files: r.fileCount });
  } catch (err) { throw new HttpError(400, (err as Error).message); }
});
