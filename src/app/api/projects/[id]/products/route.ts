import { NextRequest, NextResponse } from 'next/server';
import { handle, requireAuth } from '@/lib/http';
import { getProject } from '@/lib/projects';
import { query } from '@/lib/db';

export interface ProductOut {
  id: string; handle: string; title: string; body_html: string; vendor: string; product_type: string; tags: string[]; option_names: string[];
  status: string; error: string | null; shopify_id: string | null; pushed_at: string | null; ai_described_at: string | null;
  variants: { id: string; options: string[]; sku: string; price: string; compare_at: string | null }[];
  images: { id: string; path: string; position: number; alt: string; source: string; source_url: string | null }[];
}

export const GET = handle(async (request: NextRequest, { params }: { params: { id: string } }) => {
  requireAuth(request);
  const project = await getProject(params.id);
  const products = await query<ProductOut>(`
    SELECT p.id, p.handle, p.title, p.body_html, p.vendor, p.product_type, p.tags, p.option_names, p.status, p.error, p.shopify_id, p.pushed_at, p.ai_described_at,
      COALESCE((SELECT json_agg(json_build_object('id', v.id, 'options', v.options, 'sku', v.sku, 'price', v.price::text, 'compare_at', v.compare_at::text) ORDER BY v.position) FROM variants v WHERE v.product_id = p.id), '[]') AS variants,
      COALESCE((SELECT json_agg(json_build_object('id', i.id, 'path', i.path, 'position', i.position, 'alt', i.alt, 'source', i.source, 'source_url', i.source_url) ORDER BY i.position) FROM images i WHERE i.product_id = p.id), '[]') AS images
    FROM products p WHERE p.project_id = $1 ORDER BY p.position, p.created_at`, [project.id]);
  return NextResponse.json({ products: products.rows });
});
