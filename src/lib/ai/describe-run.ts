import { query, queryOne } from '@/lib/db';
import { describeProduct } from './describe';

// One product: read its facts, ask, save. Returns the HTML.
export async function describeOne(projectId: string, productId: string): Promise<string> {
  const p = await queryOne<{ id: string; title: string; product_type: string; tags: string[]; option_names: string[]; body_html: string }>(
    `SELECT id, title, product_type, tags, option_names, body_html FROM products WHERE id = $1 AND project_id = $2`, [productId, projectId]);
  if (!p) throw new Error('Product not found');
  const vs = await query<{ options: string[] }>(`SELECT options FROM variants WHERE product_id = $1 ORDER BY position`, [p.id]);
  const optionValues = p.option_names.map((_, k) => Array.from(new Set(vs.rows.map((v) => v.options[k]).filter(Boolean))).join(', '));
  const html = await describeProduct(projectId, { title: p.title, productType: p.product_type, tags: p.tags, optionNames: p.option_names, optionValues, currentHtml: p.body_html });
  await query(`UPDATE products SET body_html = $2, ai_described_at = now(), status = CASE WHEN status = 'pushed' THEN 'draft' ELSE status END, updated_at = now() WHERE id = $1`, [p.id, html]);
  return html;
}
