// "Publish products": every product of the project goes to the store with productSet (upsert by
// handle), the ticked collections are made, the products are added to the manual ones (the Type /
// Tag ones fill themselves), and everything is published to the Online Store. One publish_runs row
// with a per-item log; a failed product is marked 'error' with the message and the run goes on.
import { query, queryOne } from '@/lib/db';
import { storeAuth, markStoreOk } from '@/lib/stores';
import { addProductsToCollection, ensureCollection, onlineStorePublicationId, productSet, publishToOnlineStore } from '@/lib/shopify/admin';
import { ShopifyError, type ClientOptions } from '@/lib/shopify/client';
import { toProductSetInput, type ImageRow, type VariantRow } from '@/lib/products/mapper';
import { baseUrl } from '@/lib/http';

export interface RunLogItem { kind: 'product' | 'collection' | 'publish' | 'note'; handle?: string; ok: boolean; message: string }

const running = new Set<string>();

export async function publishProducts(projectId: string, opts: { productIds?: string[]; client?: ClientOptions } = {}): Promise<{ runId: string; ok: number; fail: number; log: RunLogItem[] }> {
  if (running.has(projectId)) throw new Error('A publish is already running for this project');
  running.add(projectId);
  const log: RunLogItem[] = [];
  let ok = 0, fail = 0;
  const run = await queryOne<{ id: string }>(`INSERT INTO publish_runs (project_id, step) VALUES ($1, 'products') RETURNING id`, [projectId]);
  const runId = run!.id;
  try {
    const project = await queryOne<{ store_id: string; publication_id: string | null }>(`SELECT store_id, publication_id FROM projects WHERE id = $1`, [projectId]);
    if (!project) throw new Error('Project not found');
    const store = await storeAuth(project.store_id);
    if (!store) throw new Error('Store not found');
    const base = baseUrl();
    if (!/^https:\/\//.test(base) && process.env.NODE_ENV === 'production') log.push({ kind: 'note', ok: false, message: `NEXT_PUBLIC_BASE_URL is ${base}: Shopify cannot download images from it` });

    let publicationId = project.publication_id;
    if (!publicationId) {
      publicationId = await onlineStorePublicationId(store, opts.client);
      if (publicationId) await query(`UPDATE projects SET publication_id = $2 WHERE id = $1`, [projectId, publicationId]);
      else log.push({ kind: 'note', ok: false, message: 'Online Store sales channel not found: products will stay unpublished (add the channel in Shopify, then publish again)' });
    }

    const where = opts.productIds?.length ? `AND p.id = ANY($2::uuid[])` : '';
    const params: unknown[] = opts.productIds?.length ? [projectId, opts.productIds] : [projectId];
    const products = await query<{ id: string; handle: string; title: string; body_html: string; vendor: string; product_type: string; tags: string[]; option_names: string[]; status: string; active: boolean }>(
      `SELECT p.id, p.handle, p.title, p.body_html, p.vendor, p.product_type, p.tags, p.option_names, p.status, true AS active FROM products p WHERE p.project_id = $1 ${where} ORDER BY p.position, p.created_at`, params);

    const pushedIds: string[] = [];
    const byHandle = new Map<string, string>();
    for (const p of products.rows) {
      try {
        const vr = await query<VariantRow & { id: string }>(`SELECT id, options, sku, price, compare_at FROM variants WHERE product_id = $1 ORDER BY position`, [p.id]);
        const ir = await query<ImageRow>(`SELECT id, path, position, alt FROM images WHERE product_id = $1 AND kind = 'product' ORDER BY position`, [p.id]);
        const input = toProductSetInput(p, vr.rows, ir.rows, base, true);
        const res = await productSet(store, input, opts.client);
        await query(`UPDATE products SET status = 'pushed', shopify_id = $2, error = NULL, pushed_at = now(), updated_at = now() WHERE id = $1`, [p.id, res.id]);
        for (let i = 0; i < vr.rows.length && i < res.variantIds.length; i++) await query(`UPDATE variants SET shopify_id = $2 WHERE id = $1`, [vr.rows[i].id, res.variantIds[i]]);
        pushedIds.push(res.id); byHandle.set(p.handle, res.id);
        ok++; log.push({ kind: 'product', handle: p.handle, ok: true, message: `${p.title}: ${vr.rows.length} variant(s), ${ir.rows.length} photo(s)` });
      } catch (err) {
        const message = err instanceof ShopifyError ? err.message : (err as Error).message;
        await query(`UPDATE products SET status = 'error', error = $2, updated_at = now() WHERE id = $1`, [p.id, message.slice(0, 1000)]);
        fail++; log.push({ kind: 'product', handle: p.handle, ok: false, message });
        if (err instanceof ShopifyError && err.kind === 'access') { log.push({ kind: 'note', ok: false, message: 'Stopped: Shopify refuses the token or a scope. Reconnect the store.' }); break; }
      }
    }

    // Collections
    const cols = await query<{ id: string; handle: string; title: string; rule_kind: string; rule_value: string }>(`SELECT id, handle, title, rule_kind, rule_value FROM collections WHERE project_id = $1 AND enabled ORDER BY title`, [projectId]);
    const collectionIds: string[] = [];
    for (const c of cols.rows) {
      try {
        const rule = c.rule_kind === 'type' ? { column: 'TYPE' as const, condition: c.rule_value } : c.rule_kind === 'tag' ? { column: 'TAG' as const, condition: c.rule_value } : undefined;
        const r = await ensureCollection(store, { handle: c.handle, title: c.title, rule }, opts.client);
        if (!rule) await addProductsToCollection(store, r.id, pushedIds, opts.client);
        await query(`UPDATE collections SET status = 'pushed', shopify_id = $2, error = NULL WHERE id = $1`, [c.id, r.id]);
        collectionIds.push(r.id);
        ok++; log.push({ kind: 'collection', handle: c.handle, ok: true, message: `${c.title}${r.created ? ' (new)' : ''}` });
      } catch (err) {
        const message = (err as Error).message;
        await query(`UPDATE collections SET status = 'error', error = $2 WHERE id = $1`, [c.id, message.slice(0, 1000)]);
        fail++; log.push({ kind: 'collection', handle: c.handle, ok: false, message });
      }
    }

    // Online Store
    if (publicationId && (pushedIds.length || collectionIds.length)) {
      try {
        await publishToOnlineStore(store, [...pushedIds, ...collectionIds], publicationId, opts.client);
        log.push({ kind: 'publish', ok: true, message: `${pushedIds.length} product(s) and ${collectionIds.length} collection(s) published to the Online Store` });
      } catch (err) {
        fail++; log.push({ kind: 'publish', ok: false, message: `Publishing to the Online Store failed: ${(err as Error).message}` });
      }
    }
    await markStoreOk(store.id);
  } catch (err) {
    fail++; log.push({ kind: 'note', ok: false, message: (err as Error).message });
  } finally {
    running.delete(projectId);
    await query(`UPDATE publish_runs SET finished_at = now(), ok_count = $2, fail_count = $3, log = $4 WHERE id = $1`, [runId, ok, fail, JSON.stringify(log)]).catch(() => {});
  }
  return { runId, ok, fail, log };
}
