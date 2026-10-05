import { NextRequest, NextResponse } from 'next/server';
import { handle, HttpError, requireAuth } from '@/lib/http';
import { getProject, touchProject } from '@/lib/projects';
import { withTransaction } from '@/lib/db';
import { parseProductCsv } from '@/lib/csv/product-csv';
import { proposeCollections } from '@/lib/products/mapper';

const MAX_CSV_BYTES = 5 * 1024 * 1024;

// POST multipart { file }: the Shopify product CSV. Products are upserted by handle: a product that
// is already in the project keeps its photos and its edits to the description when the CSV's is
// empty; variants are replaced by the CSV's. The CSV's image links are queued (images.path = '')
// and fetched by /images/fetch.
export const POST = handle(async (request: NextRequest, { params }: { params: { id: string } }) => {
  requireAuth(request);
  const project = await getProject(params.id);
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw new HttpError(400, 'Choose a CSV file');
  if (file.size > MAX_CSV_BYTES) throw new HttpError(400, 'CSV is bigger than 5 MB');
  const text = await file.text();
  const result = parseProductCsv(text);
  if (!result.products.length) {
    throw new HttpError(422, result.problems[0]?.message || 'No products found in this file', { problems: result.problems, columns: result.columns });
  }

  const stats = { created: 0, updated: 0, variants: 0, imageLinks: 0 };
  await withTransaction(async (c) => {
    const existing = await c.query<{ id: string; handle: string; body_html: string; position: number }>(`SELECT id, handle, body_html, position FROM products WHERE project_id = $1`, [project.id]);
    const byHandle = new Map(existing.rows.map((r) => [r.handle, r]));
    let position = existing.rows.reduce((m, r) => Math.max(m, r.position), 0);
    for (const p of result.products) {
      const old = byHandle.get(p.handle);
      let productId: string;
      if (old) {
        const body = p.bodyHtml || old.body_html;
        await c.query(`UPDATE products SET title = $2, body_html = $3, vendor = $4, product_type = $5, tags = $6, option_names = $7, updated_at = now() WHERE id = $1`,
          [old.id, p.title, body, p.vendor, p.productType, p.tags, p.optionNames]);
        await c.query(`DELETE FROM variants WHERE product_id = $1`, [old.id]);
        productId = old.id; stats.updated++;
      } else {
        const r = await c.query<{ id: string }>(`INSERT INTO products (project_id, handle, title, body_html, vendor, product_type, tags, option_names, position) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
          [project.id, p.handle, p.title, p.bodyHtml, p.vendor, p.productType, p.tags, p.optionNames, ++position]);
        productId = r.rows[0].id; stats.created++;
      }
      for (let i = 0; i < p.variants.length; i++) {
        const v = p.variants[i];
        await c.query(`INSERT INTO variants (product_id, position, options, sku, price, compare_at) VALUES ($1, $2, $3, $4, $5, $6)`, [productId, i, v.options, v.sku, v.price, v.compareAt]);
        stats.variants++;
      }
      // Image links: queue the ones this product does not have yet (by source_url).
      const have = await c.query<{ source_url: string | null; position: number }>(`SELECT source_url, position FROM images WHERE product_id = $1`, [productId]);
      const known = new Set(have.rows.map((r) => r.source_url).filter(Boolean));
      let pos = have.rows.reduce((m, r) => Math.max(m, r.position), 0);
      for (const im of p.images) {
        if (known.has(im.src)) continue;
        await c.query(`INSERT INTO images (project_id, product_id, kind, path, source, source_url, position, alt) VALUES ($1, $2, 'product', '', 'csv', $3, $4, $5)`, [project.id, productId, im.src, ++pos, im.alt]);
        stats.imageLinks++;
      }
    }
    // Proposed collections: add new ones, keep the owner's ticks on the old ones.
    const all = await c.query<{ product_type: string; tags: string[] }>(`SELECT product_type, tags FROM products WHERE project_id = $1`, [project.id]);
    for (const col of proposeCollections(all.rows)) {
      await c.query(`INSERT INTO collections (project_id, handle, title, rule_kind, rule_value) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (project_id, handle) DO UPDATE SET title = EXCLUDED.title, rule_kind = EXCLUDED.rule_kind, rule_value = EXCLUDED.rule_value`,
        [project.id, col.handle, col.title, col.rule_kind, col.rule_value]);
    }
  });
  await touchProject(project.id);
  return NextResponse.json({ ...stats, rows: result.rows, products: result.products.length, problems: result.problems });
});
