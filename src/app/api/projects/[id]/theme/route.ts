import { NextRequest, NextResponse } from 'next/server';
import { handle, requireAuth } from '@/lib/http';
import { getProject } from '@/lib/projects';
import { queryOne } from '@/lib/db';
import { themeSummaryFor } from '@/lib/theme/theme-run';

// GET: where the theme step stands (zip uploaded? plan made? built? pushed? preview url).
export const GET = handle(async (request: NextRequest, { params }: { params: { id: string } }) => {
  requireAuth(request);
  const project = await getProject(params.id);
  const row = await queryOne<{ theme_file: string | null; theme_plan: unknown; theme_built_at: string | null; shopify_theme_id: string | null; theme_preview_url: string | null; style_sheet: unknown }>(
    `SELECT theme_file, theme_plan, theme_built_at, shopify_theme_id, theme_preview_url, style_sheet FROM projects WHERE id = $1`, [project.id]);
  const summary = row?.theme_file ? await themeSummaryFor(project.id) : null;
  return NextResponse.json({
    has_zip: !!row?.theme_file, has_style: !!row?.style_sheet,
    theme: summary ? { name: summary.name, version: summary.version, sections: Object.keys(summary.sections), settings: summary.settings.length, index_sections: summary.indexOrder.length } : null,
    plan: row?.theme_plan || null, built_at: row?.theme_built_at || null, shopify_theme_id: row?.shopify_theme_id || null, preview_url: row?.theme_preview_url || null,
  });
});
