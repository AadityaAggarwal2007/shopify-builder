import { query, queryOne } from '@/lib/db';
import { askText, estimateCost } from '@/lib/ai/models';
import { storeAuth, markStoreOk } from '@/lib/stores';
import { menuUpsert, pageUpsert, shopPolicyUpdate } from '@/lib/shopify/admin';
import { cleanFacts, menuItems, PAGE_KINDS, pagesPrompt, PAGES_SYSTEM, parsePages, POLICY_TYPES, type StoreFacts } from './pages-ai';
import type { StyleSheet } from '@/lib/reference/style-sheet';

export async function saveFacts(projectId: string, input: unknown): Promise<StoreFacts> {
  const facts = cleanFacts(input);
  await query(`UPDATE projects SET store_facts = $2, updated_at = now() WHERE id = $1`, [projectId, JSON.stringify(facts)]);
  return facts;
}

export async function draftPages(projectId: string): Promise<{ handle: string; title: string }[]> {
  const p = await queryOne<{ store_facts: StoreFacts | null; style_sheet: StyleSheet | null }>(`SELECT store_facts, style_sheet FROM projects WHERE id = $1`, [projectId]);
  if (!p?.store_facts?.store_name) throw new Error('Fill in the store facts first (at least the store name)');
  const types = await query<{ product_type: string }>(`SELECT DISTINCT product_type FROM products WHERE project_id = $1 AND product_type <> '' LIMIT 15`, [projectId]);
  const a = await askText(PAGES_SYSTEM, pagesPrompt(p.store_facts, p.style_sheet, types.rows.map((r) => r.product_type)), { temperature: 0.5, maxTokens: 6000, json: true, timeoutMs: 120_000 });
  query(`INSERT INTO ai_runs (project_id, kind, model, prompt_tokens, output_tokens, cost_usd, ms, ok) VALUES ($1, 'page', $2, $3, $4, $5, $6, true)`,
    [projectId, a.model, a.promptTokens, a.outputTokens, estimateCost(a.model, a.promptTokens, a.outputTokens), a.ms]).catch(() => {});
  const pages = parsePages(a.text);
  for (const pg of pages) {
    const kind = PAGE_KINDS.find((k) => k.handle === pg.handle)!.kind;
    await query(`INSERT INTO pages (project_id, kind, handle, title, body_html, status) VALUES ($1, $2, $3, $4, $5, 'draft')
      ON CONFLICT (project_id, handle) DO UPDATE SET title = EXCLUDED.title, body_html = EXCLUDED.body_html, status = 'draft', error = NULL, updated_at = now()`, [projectId, kind, pg.handle, pg.title, pg.body_html]);
  }
  await query(`UPDATE projects SET updated_at = now() WHERE id = $1`, [projectId]);
  return pages.map((x) => ({ handle: x.handle, title: x.title }));
}

export interface PageLog { kind: string; handle?: string; ok: boolean; message: string }

export async function publishPages(projectId: string): Promise<{ ok: number; fail: number; log: PageLog[] }> {
  const project = await queryOne<{ store_id: string }>(`SELECT store_id FROM projects WHERE id = $1`, [projectId]);
  if (!project) throw new Error('Project not found');
  const store = await storeAuth(project.store_id);
  if (!store) throw new Error('Store not found');
  const run = await queryOne<{ id: string }>(`INSERT INTO publish_runs (project_id, step) VALUES ($1, 'pages') RETURNING id`, [projectId]);
  const log: PageLog[] = [];
  let ok = 0, fail = 0;
  const pages = await query<{ id: string; kind: string; handle: string; title: string; body_html: string }>(`SELECT id, kind, handle, title, body_html FROM pages WHERE project_id = $1 ORDER BY kind, handle`, [projectId]);
  for (const pg of pages.rows) {
    try {
      if (pg.kind === 'policy' && POLICY_TYPES[pg.handle]) {
        await shopPolicyUpdate(store, POLICY_TYPES[pg.handle], pg.body_html);
        await query(`UPDATE pages SET status = 'pushed', error = NULL, updated_at = now() WHERE id = $1`, [pg.id]);
        ok++; log.push({ kind: 'policy', handle: pg.handle, ok: true, message: pg.title });
      } else {
        const r = await pageUpsert(store, pg.handle, pg.title, pg.body_html);
        await query(`UPDATE pages SET status = 'pushed', shopify_id = $2, error = NULL, updated_at = now() WHERE id = $1`, [pg.id, r.id]);
        ok++; log.push({ kind: 'page', handle: pg.handle, ok: true, message: `${pg.title}${r.created ? ' (new)' : ' (updated)'}` });
      }
    } catch (err) {
      const message = (err as Error).message;
      await query(`UPDATE pages SET status = 'error', error = $2, updated_at = now() WHERE id = $1`, [pg.id, message.slice(0, 1000)]);
      fail++; log.push({ kind: pg.kind, handle: pg.handle, ok: false, message });
    }
  }
  // Menus
  try {
    const cols = await query<{ handle: string; title: string }>(`SELECT handle, title FROM collections WHERE project_id = $1 AND enabled AND status = 'pushed' ORDER BY title LIMIT 5`, [projectId]);
    const pushed = pages.rows.map((p) => p.handle);
    const menus = menuItems(cols.rows, pushed);
    const m1 = await menuUpsert(store, 'main-menu', 'Main menu', menus.main);
    const m2 = await menuUpsert(store, 'footer', 'Footer menu', menus.footer);
    ok += 2; log.push({ kind: 'menu', ok: true, message: `Main menu ${m1.created ? 'created' : 'updated'} (${menus.main.length} items); footer ${m2.created ? 'created' : 'updated'} (${menus.footer.length} items)` });
  } catch (err) {
    fail++; log.push({ kind: 'menu', ok: false, message: `Menus: ${(err as Error).message}` });
  }
  await markStoreOk(store.id);
  await query(`UPDATE publish_runs SET finished_at = now(), ok_count = $2, fail_count = $3, log = $4 WHERE id = $1`, [run!.id, ok, fail, JSON.stringify(log)]).catch(() => {});
  return { ok, fail, log };
}
