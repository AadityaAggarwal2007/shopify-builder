import { query, queryOne } from '@/lib/db';
import { askText, estimateCost } from '@/lib/ai/models';
import { readSite, type SiteRead } from './read-site';
import { parseStyleSheet, stylePrompt, STYLE_SYSTEM, type StyleSheet } from './style-sheet';

// Read the site, ask the AI for the style sheet, save both on the project.
export async function buildStyleSheet(projectId: string, url: string, more: { collectionUrl?: string; productUrl?: string } = {}): Promise<{ site: SiteRead; style: StyleSheet }> {
  const project = await queryOne<{ name: string; store_name: string }>(`SELECT p.name, s.name AS store_name FROM projects p JOIN stores s ON s.id = p.store_id WHERE p.id = $1`, [projectId]);
  if (!project) throw new Error('Project not found');
  const site = await readSite(url, more);
  const types = await query<{ product_type: string; title: string }>(`SELECT product_type, title FROM products WHERE project_id = $1 ORDER BY position LIMIT 60`, [projectId]);
  const merchant = { storeName: project.store_name || project.name, productTypes: Array.from(new Set(types.rows.map((r) => r.product_type).filter(Boolean))), sampleTitles: types.rows.map((r) => r.title) };
  const a = await askText(STYLE_SYSTEM, stylePrompt(site, merchant), { temperature: 0.4, maxTokens: 5000, json: true, timeoutMs: 120_000 });
  query(`INSERT INTO ai_runs (project_id, kind, model, prompt_tokens, output_tokens, cost_usd, ms, ok) VALUES ($1, 'style', $2, $3, $4, $5, $6, true)`,
    [projectId, a.model, a.promptTokens, a.outputTokens, estimateCost(a.model, a.promptTokens, a.outputTokens), a.ms]).catch(() => {});
  let style: StyleSheet;
  try { style = parseStyleSheet(a.text, merchant.storeName); } catch (err) { console.error(`[style sheet] ${(err as Error).message} (${a.model}, ${a.text.length} chars, finish ${a.finish}): ${a.text.slice(0, 200)}`); throw err; }
  // The stored read keeps structure only: no text sample, no policy text (rule 4).
  const stored = { ...site, textSample: '', policies: site.policies.map((p) => ({ kind: p.kind, text: '' })) };
  await query(`UPDATE projects SET reference_url = $2, reference_read = $3, reference_read_at = now(), style_sheet = $4, updated_at = now() WHERE id = $1`, [projectId, site.finalUrl, JSON.stringify(stored), JSON.stringify(style)]);
  return { site: stored, style };
}
