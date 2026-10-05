// Theme step, server side: keep the uploaded zip, plan with the AI, build the new zip, push it to the
// store as an unpublished theme (themeCreate from the zip's public URL), publish on the button.
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { query, queryOne } from '@/lib/db';
import { uploadsDir } from '@/lib/uploads';
import { baseUrl } from '@/lib/http';
import { askText, estimateCost } from '@/lib/ai/models';
import { storeAuth } from '@/lib/stores';
import { fileCreateFromUrl, themeCreateFromUrl, themePublish, themeStatus } from '@/lib/shopify/admin';
import { ShopifyError, gidNumber } from '@/lib/shopify/client';
import { readThemeZip, writeThemeZip } from './theme-zip';
import { summarize, type ThemeSummary } from './theme-schema';
import { applyGroup, applyPlan, applyTemplate, FONT_HANDLES, planPrompt, PLAN_SYSTEM, validatePlan, type PlanAssets, type ThemePlan } from './theme-plan';
import type { StyleSheet } from '@/lib/reference/style-sheet';

const zipPath = (projectId: string, built: boolean) => path.join(uploadsDir(), 'themes', `${projectId}${built ? '-built' : ''}.zip`);
const zipRel = (projectId: string, built: boolean) => `themes/${projectId}${built ? '-built' : ''}.zip`;

export async function saveThemeUpload(projectId: string, buf: Buffer): Promise<{ summary: ThemeSummary; fileCount: number }> {
  const { files } = await readThemeZip(buf);
  const summary = summarize(files);
  if (!files.indexTemplate) throw new Error('This theme has no templates/index.json (an old Liquid-only theme). Use an Online Store 2.0 theme (Dawn and every recent theme).');
  await mkdir(path.dirname(zipPath(projectId, false)), { recursive: true });
  await writeFile(zipPath(projectId, false), buf);
  await query(`UPDATE projects SET theme_file = $2, theme_plan = NULL, theme_built_at = NULL, theme_preview_url = NULL, shopify_theme_id = NULL, updated_at = now() WHERE id = $1`, [projectId, zipRel(projectId, false)]);
  return { summary, fileCount: files.fileCount };
}

export async function themeSummaryFor(projectId: string): Promise<ThemeSummary | null> {
  try { const buf = await readFile(zipPath(projectId, false)); return summarize((await readThemeZip(buf)).files); } catch { return null; }
}

export async function assetsFor(projectId: string): Promise<PlanAssets> {
  const banners = await query<{ alt: string }>(`SELECT alt FROM images WHERE project_id = $1 AND kind IN ('banner', 'logo') AND path <> '' ORDER BY position`, [projectId]);
  const collections = await query<{ handle: string; title: string }>(`SELECT handle, title FROM collections WHERE project_id = $1 AND enabled ORDER BY title`, [projectId]);
  const products = await query<{ handle: string; title: string }>(`SELECT handle, title FROM products WHERE project_id = $1 ORDER BY position LIMIT 40`, [projectId]);
  const cols = collections.rows.some((c) => c.handle === 'all') ? collections.rows : [...collections.rows, { handle: 'all', title: 'All products (every store has it)' }];
  return { banners: banners.rows.map((b) => ({ slot: b.alt.split('|')[0].trim().toLowerCase(), alt: b.alt.split('|')[1]?.trim() || '' })).filter((b) => b.slot), collections: cols, products: products.rows };
}

export async function planTheme(projectId: string): Promise<ThemePlan> {
  const p = await queryOne<{ style_sheet: StyleSheet | null; name: string; store_name: string }>(`SELECT p.style_sheet, p.name, s.name AS store_name FROM projects p JOIN stores s ON s.id = p.store_id WHERE p.id = $1`, [projectId]);
  if (!p) throw new Error('Project not found');
  if (!p.style_sheet) throw new Error('Read a reference site first (step 2): the theme is filled from its style sheet');
  const theme = await themeSummaryFor(projectId);
  if (!theme) throw new Error('Upload the theme zip first');
  if (!Object.keys(theme.sections).length) throw new Error('No home page sections found in this theme');
  const assets = await assetsFor(projectId);
  const a = await askText(PLAN_SYSTEM, planPrompt(theme, p.style_sheet, assets, p.store_name || p.name), { temperature: 0.3, maxTokens: 9000, json: true });
  query(`INSERT INTO ai_runs (project_id, kind, model, prompt_tokens, output_tokens, cost_usd, ms, ok) VALUES ($1, 'theme', $2, $3, $4, $5, $6, true)`,
    [projectId, a.model, a.promptTokens, a.outputTokens, estimateCost(a.model, a.promptTokens, a.outputTokens), a.ms]).catch(() => {});
  let raw: unknown;
  try { const t = a.text.replace(/```json|```/g, '').trim(); raw = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); } catch { throw new Error('The AI did not answer with valid JSON; try again'); }
  const plan = validatePlan(raw, theme, assets);
  await query(`UPDATE projects SET theme_plan = $2, theme_built_at = NULL, updated_at = now() WHERE id = $1`, [projectId, JSON.stringify(plan)]);
  return plan;
}

// The owner's own edits from the theme editor: the same strict validation as the AI's answer, then saved.
export async function savePlan(projectId: string, raw: unknown): Promise<ThemePlan> {
  const theme = await themeSummaryFor(projectId);
  if (!theme) throw new Error('Upload the theme zip first');
  const plan = validatePlan(raw, theme, await assetsFor(projectId));
  await query(`UPDATE projects SET theme_plan = $2, theme_built_at = NULL, updated_at = now() WHERE id = $1`, [projectId, JSON.stringify(plan)]);
  return plan;
}

// What the editor needs: the theme's real settings / sections / groups and the pickers' choices.
export async function editorSchema(projectId: string): Promise<{ theme: ThemeSummary; assets: PlanAssets; fonts: Record<string, string> } | null> {
  const theme = await themeSummaryFor(projectId);
  if (!theme) return null;
  // Only the section schemas the groups and templates use or may add travel (allSections can be 100+ in a big theme).
  const used = new Set([...Object.values(theme.groups).flat().map((g) => g.type), ...Object.values(theme.templates).flatMap((t) => t.sections.map((s) => s.type)), ...Object.values(theme.templateSections).flat()]);
  const allSections = Object.fromEntries(Object.entries(theme.allSections).filter(([t]) => used.has(t)));
  return { theme: { ...theme, allSections, index: null, currentSettings: {} }, assets: await assetsFor(projectId), fonts: FONT_HANDLES };
}

// Uploads the plan's images to Shopify Files (fixed names), writes the new zip, returns its public URL.
export async function buildTheme(projectId: string): Promise<{ zipUrl: string; uploaded: string[]; warnings: string[] }> {
  const p = await queryOne<{ store_id: string; theme_plan: ThemePlan | null }>(`SELECT store_id, theme_plan FROM projects WHERE id = $1`, [projectId]);
  if (!p?.theme_plan) throw new Error('Make the plan first');
  const buf = await readFile(zipPath(projectId, false)).catch(() => { throw new Error('Upload the theme zip first'); });
  const { zip, files } = await readThemeZip(buf);
  const theme = summarize(files);
  const store = await storeAuth(p.store_id);
  if (!store) throw new Error('Store not found');
  const warnings: string[] = [];
  const uploaded: string[] = [];
  const imageUrls: Record<string, string> = {};
  const slotsUsed = new Set<string>();
  const collect = (o: Record<string, unknown>) => { for (const v of Object.values(o)) if (typeof v === 'string' && v.startsWith('banner:')) slotsUsed.add(v.slice(7)); };
  collect(p.theme_plan.settings);
  for (const s of p.theme_plan.sections) { collect(s.settings); for (const b of s.blocks) collect(b.settings); }
  for (const byKey of Object.values(p.theme_plan.groups || {})) for (const settings of Object.values(byKey)) collect(settings);
  for (const t of Object.values(p.theme_plan.templates || {})) {
    for (const ex of Object.values(t.existing || {})) { collect(ex.settings || {}); for (const b of ex.blocks || []) collect(b.settings); }
    for (const s of t.add || []) { collect(s.settings); for (const b of s.blocks) collect(b.settings); }
  }
  if (slotsUsed.size) {
    const imgs = await query<{ path: string; alt: string }>(`SELECT path, alt FROM images WHERE project_id = $1 AND kind IN ('banner', 'logo') AND path <> ''`, [projectId]);
    for (const slot of slotsUsed) {
      const img = imgs.rows.find((i) => i.alt.split('|')[0].trim().toLowerCase() === slot);
      if (!img) { warnings.push(`no image for slot ${slot}`); continue; }
      const ext = (img.path.split('.').pop() || 'jpg').toLowerCase();
      const filename = `builder-${projectId.slice(0, 8)}-${slot}.${ext}`;
      try {
        await fileCreateFromUrl(store, `${baseUrl()}/uploads/${img.path}`, filename, img.alt.split('|')[1]?.trim() || slot);
        imageUrls[slot] = `shopify://shop_images/${filename}`; uploaded.push(filename);
      } catch (err) { warnings.push(`${slot}: ${(err as Error).message}`); }
    }
  }
  const out = applyPlan(theme, p.theme_plan, files.settingsData, imageUrls);
  const changed: Record<string, string> = { 'config/settings_data.json': out.settingsData, 'templates/index.json': out.indexJson };
  for (const [file, byKey] of Object.entries(p.theme_plan.groups || {})) {
    if (!files.groups[file]) continue;
    try { changed[`sections/${file}.json`] = applyGroup(files.groups[file], byKey, imageUrls); } catch (err) { warnings.push(`${file}: ${(err as Error).message}`); }
  }
  for (const [name, t] of Object.entries(p.theme_plan.templates || {})) {
    if (!files.templates[name]) continue;
    try { changed[`templates/${name}.json`] = applyTemplate(files.templates[name], t, imageUrls); } catch (err) { warnings.push(`templates/${name}.json: ${(err as Error).message}`); }
  }
  const built = await writeThemeZip(zip, files.prefix, changed);
  await writeFile(zipPath(projectId, true), built);
  await query(`UPDATE projects SET theme_built_at = now(), updated_at = now() WHERE id = $1`, [projectId]);
  return { zipUrl: `${baseUrl()}/uploads/${zipRel(projectId, true)}`, uploaded, warnings };
}

export async function pushTheme(projectId: string): Promise<{ themeId: string; previewUrl: string; processing: boolean }> {
  const p = await queryOne<{ store_id: string; theme_built_at: string | null; name: string }>(`SELECT store_id, theme_built_at, name FROM projects WHERE id = $1`, [projectId]);
  if (!p?.theme_built_at) throw new Error('Build the theme first');
  const store = await storeAuth(p.store_id);
  if (!store) throw new Error('Store not found');
  const zipUrl = `${baseUrl()}/uploads/${zipRel(projectId, true)}`;
  let theme;
  try {
    theme = await themeCreateFromUrl(store, zipUrl, `Builder ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`);
  } catch (err) {
    if (err instanceof ShopifyError && err.kind === 'access') throw new Error(`Shopify refused the theme upload for this app (write_themes exemption not granted yet). Download the built zip and add it in Shopify admin: Online Store > Themes > Add theme > Upload zip. Zip: ${zipUrl}`);
    throw err;
  }
  for (let i = 0; i < 15 && theme.processing; i++) { await new Promise((r) => setTimeout(r, 3000)); theme = (await themeStatus(store, theme.id)) || theme; }
  const previewUrl = `https://${store.shopDomain}/?preview_theme_id=${gidNumber(theme.id)}`;
  await query(`UPDATE projects SET shopify_theme_id = $2, theme_preview_url = $3, updated_at = now() WHERE id = $1`, [projectId, theme.id, previewUrl]);
  return { themeId: theme.id, previewUrl, processing: theme.processing };
}

export async function publishTheme(projectId: string): Promise<void> {
  const p = await queryOne<{ store_id: string; shopify_theme_id: string | null }>(`SELECT store_id, shopify_theme_id FROM projects WHERE id = $1`, [projectId]);
  if (!p?.shopify_theme_id) throw new Error('Push the theme to the store first');
  const store = await storeAuth(p.store_id);
  if (!store) throw new Error('Store not found');
  await themePublish(store, p.shopify_theme_id);
}

export async function builtZipPath(projectId: string): Promise<string> { return zipPath(projectId, true); }
