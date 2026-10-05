import { NextRequest, NextResponse } from 'next/server';
import { handle, isUuid, requireAuth } from '@/lib/http';
import { getProject, touchProject } from '@/lib/projects';
import { publishProducts } from '@/lib/publish/products';

export const maxDuration = 300;

// POST { product_ids?: [] }: push every product (or only these) + ticked collections, publish to the Online Store.
export const POST = handle(async (request: NextRequest, { params }: { params: { id: string } }) => {
  requireAuth(request);
  const project = await getProject(params.id);
  const b = await request.json().catch(() => ({}));
  const ids = Array.isArray(b.product_ids) ? b.product_ids.filter(isUuid) : [];
  const result = await publishProducts(project.id, { productIds: ids });
  await touchProject(project.id);
  return NextResponse.json(result);
});
