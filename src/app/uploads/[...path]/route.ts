import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { uploadsDir } from '@/lib/uploads';

// Serves the stored images (nginx does this in production with an alias; this is for local runs and
// a fallback). Public on purpose: Shopify downloads them. Names are random and unguessable.
const TYPES: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };

export async function GET(_req: NextRequest, { params }: { params: { path: string[] } }) {
  const rel = (params.path || []).join('/');
  if (!/^[A-Za-z0-9_\-]+\/[A-Za-z0-9_\-]+\.(jpg|jpeg|png|webp|gif)$/.test(rel)) return new NextResponse('Not found', { status: 404 });
  const abs = path.join(uploadsDir(), rel);
  if (!abs.startsWith(uploadsDir())) return new NextResponse('Not found', { status: 404 });
  try {
    const buf = await readFile(abs);
    return new NextResponse(buf, { headers: { 'Content-Type': TYPES[rel.split('.').pop()!], 'Cache-Control': 'public, max-age=86400' } });
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
}
