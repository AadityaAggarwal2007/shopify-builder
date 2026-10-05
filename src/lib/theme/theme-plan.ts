// The theme plan: what the AI proposes for the uploaded theme (global settings + the home page's
// sections), validated STRICTLY against the theme's own schema. Pure: no network, no database.
import type { SectionDef, SettingDef, ThemeSummary } from './theme-schema';
import type { StyleSheet } from '@/lib/reference/style-sheet';

export interface PlanBlock { type: string; settings: Record<string, unknown> }
export interface PlanSection { type: string; settings: Record<string, unknown>; blocks: PlanBlock[] }
export interface ThemePlan { settings: Record<string, unknown>; sections: PlanSection[]; groups: Record<string, Record<string, Record<string, unknown>>>; notes: string[] }  // groups: file -> section key -> settings

export interface PlanAssets {
  banners: { slot: string; alt: string }[];           // uploaded banners / logo by slot (hero, hero_mobile, offer, logo, collection_1 ...)
  collections: { handle: string; title: string }[];   // the project's collections that will exist in the store
  products: { handle: string; title: string }[];
}

// Shopify's font_picker takes a font handle; the common Google fonts the library carries.
export const FONT_HANDLES: Record<string, string> = {
  'poppins': 'poppins_n4', 'montserrat': 'montserrat_n4', 'playfair display': 'playfair_display_n4', 'inter': 'inter_n4', 'lato': 'lato_n4',
  'roboto': 'roboto_n4', 'nunito': 'nunito_n4', 'nunito sans': 'nunito_sans_n4', 'dm sans': 'dm_sans_n4', 'open sans': 'open_sans_n4', 'raleway': 'raleway_n4',
  'oswald': 'oswald_n4', 'josefin sans': 'josefin_sans_n4', 'work sans': 'work_sans_n4', 'cormorant garamond': 'cormorant_garamond_n4',
  'libre baskerville': 'libre_baskerville_n4', 'assistant': 'assistant_n4', 'quicksand': 'quicksand_n4', 'jost': 'jost_n4', 'karla': 'karla_n4',
  'mulish': 'mulish_n4', 'rubik': 'rubik_n4', 'cabin': 'cabin_n4', 'lora': 'lora_n4', 'merriweather': 'merriweather_n4', 'abril fatface': 'abril_fatface_n4',
  'dancing script': 'dancing_script_n4', 'pacifico': 'pacifico_n4', 'archivo': 'archivo_n4', 'figtree': 'figtree_n4', 'manrope': 'manrope_n4',
  'source sans pro': 'source_sans_pro_n4', 'pt sans': 'pt_sans_n4', 'pt serif': 'pt_serif_n4', 'noto serif': 'noto_serif_n4', 'noto sans': 'noto_sans_n4',
  'ubuntu': 'ubuntu_n4', 'fira sans': 'fira_sans_n4', 'cardo': 'cardo_n4', 'eb garamond': 'eb_garamond_n4', 'crimson text': 'crimson_text_n4',
  'bodoni moda': 'bodoni_moda_n4', 'prata': 'prata_n4', 'marcellus': 'marcellus_n4', 'cinzel': 'cinzel_n4', 'tenor sans': 'tenor_sans_n4',
};
export function fontHandle(name: string): string | null {
  const key = name.trim().toLowerCase().replace(/\s+/g, ' ');
  if (FONT_HANDLES[key]) return FONT_HANDLES[key];
  if (/^[a-z0-9_]+_n\d$/.test(key)) return key;    // already a handle
  return null;
}

const HEX = /^#[0-9a-f]{6}$/i;
const BANNER_TOKEN = /^banner:([a-z0-9_]+)$/i;

// One setting value checked against its definition. Returns undefined to drop it.
export function checkValue(def: SettingDef, raw: unknown, assets: PlanAssets, notes: string[]): unknown {
  const s = typeof raw === 'string' ? raw.trim() : raw;
  switch (def.type) {
    case 'color': return typeof s === 'string' && HEX.test(s) ? s.toLowerCase() : (notes.push(`${def.id}: not a hex colour, kept the theme's`), undefined);
    case 'color_background': return typeof s === 'string' && s.length < 200 ? s : undefined;
    case 'font_picker': { const h = typeof s === 'string' ? fontHandle(s) : null; if (!h) notes.push(`${def.id}: font "${String(s)}" is not in Shopify's library, kept the theme's`); return h || undefined; }
    case 'image_picker': {
      if (typeof s !== 'string') return undefined;
      const m = s.match(BANNER_TOKEN);
      if (m) { const b = assets.banners.find((x) => x.slot === m[1].toLowerCase()); if (b) return `banner:${b.slot}`; notes.push(`${def.id}: no uploaded image for "${m[1]}", left empty`); return undefined; }
      return s.startsWith('shopify://shop_images/') ? s : undefined;
    }
    case 'text': case 'textarea': case 'inline_richtext': return typeof s === 'string' ? s.slice(0, 500) : undefined;
    case 'richtext': { if (typeof s !== 'string') return undefined; const v = s.slice(0, 2000); return /^<(p|h\d|ul|ol)/i.test(v) ? v : `<p>${v.replace(/<[^>]+>/g, '')}</p>`; }
    case 'html': case 'liquid': return undefined;   // never code from the AI
    case 'checkbox': return typeof s === 'boolean' ? s : (s === 'true' ? true : s === 'false' ? false : undefined);
    case 'select': case 'radio': return typeof s === 'string' && def.options?.includes(s) ? s : (notes.push(`${def.id}: "${String(s)}" is not one of ${(def.options || []).join('/')}`), undefined);
    case 'range': case 'number': { const n = Number(s); return Number.isFinite(n) ? n : undefined; }
    case 'url': return typeof s === 'string' && /^(\/|https?:\/\/|shopify:\/\/)/.test(s) && s.length < 300 ? s : undefined;
    case 'collection': { const h = typeof s === 'string' ? s.replace(/^shopify:\/\/collections\//, '') : ''; return assets.collections.some((c) => c.handle === h) ? h : (h && notes.push(`collection "${h}" is not in this project`), undefined); }
    case 'collection_list': { const list = (Array.isArray(s) ? s : typeof s === 'string' ? s.split(',') : []).map((x) => String(x).trim().replace(/^shopify:\/\/collections\//, '')).filter((h) => assets.collections.some((c) => c.handle === h)); return list.length ? list : undefined; }
    case 'product': { const h = typeof s === 'string' ? s.replace(/^shopify:\/\/products\//, '') : ''; return assets.products.some((p) => p.handle === h) ? h : undefined; }
    case 'product_list': { const list = (Array.isArray(s) ? s : typeof s === 'string' ? s.split(',') : []).map((x) => String(x).trim().replace(/^shopify:\/\/products\//, '')).filter((h) => assets.products.some((p) => p.handle === h)); return list.length ? list : undefined; }
    case 'link_list': return typeof s === 'string' && /^[a-z0-9-]+$/.test(s) ? s : undefined;
    case 'color_scheme': return typeof s === 'string' && s.length < 40 ? s : undefined;
    default: return undefined;   // video, article, blog, page, metaobject, color_scheme_group ...: left to the theme
  }
}

function checkSettings(defs: SettingDef[], raw: unknown, assets: PlanAssets, notes: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!raw || typeof raw !== 'object') return out;
  const byId = new Map(defs.map((d) => [d.id, d]));
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    const def = byId.get(id);
    if (!def) { notes.push(`${id}: not a setting of this theme, dropped`); continue; }
    const value = checkValue(def, v, assets, notes);
    if (value !== undefined) out[id] = value;
  }
  return out;
}

// The AI's answer -> a plan the theme accepts. Unknown sections / settings are dropped and noted.
export function validatePlan(raw: unknown, theme: ThemeSummary, assets: PlanAssets): ThemePlan {
  const notes: string[] = [];
  const j = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const settings = checkSettings(theme.settings, j.settings, assets, notes);
  const sections: PlanSection[] = [];
  for (const s of (Array.isArray(j.sections) ? j.sections : []) as Record<string, unknown>[]) {
    const type = typeof s?.type === 'string' ? s.type : '';
    const def: SectionDef | undefined = theme.sections[type];
    if (!def) { notes.push(`section "${type}": not in this theme, dropped`); continue; }
    const blocks: PlanBlock[] = [];
    for (const b of (Array.isArray(s.blocks) ? s.blocks : []) as Record<string, unknown>[]) {
      const bdef = def.blocks.find((x) => x.type === b?.type);
      if (!bdef) { if (b?.type) notes.push(`${type}: block "${String(b.type)}" not allowed, dropped`); continue; }
      if (bdef.limit && blocks.filter((x) => x.type === bdef.type).length >= bdef.limit) continue;
      if (def.maxBlocks && blocks.length >= def.maxBlocks) break;
      blocks.push({ type: bdef.type, settings: checkSettings(bdef.settings, b.settings, assets, notes) });
    }
    sections.push({ type, settings: checkSettings(def.settings, s.settings, assets, notes), blocks });
    if (sections.length >= 24) break;
  }
  if (!sections.length) throw new Error('The AI proposed no section this theme has');
  // Header / footer groups: only settings of sections that already exist in the group, by key.
  const groups: ThemePlan['groups'] = {};
  const rawGroups = (j.groups && typeof j.groups === 'object' ? j.groups : {}) as Record<string, Record<string, unknown>>;
  for (const [file, byKey] of Object.entries(rawGroups)) {
    const held = theme.groups[file];
    if (!held || !byKey || typeof byKey !== 'object') { notes.push(`group "${file}": not in this theme, dropped`); continue; }
    for (const [key, raw] of Object.entries(byKey)) {
      const sec = held.find((x) => x.key === key);
      const def = sec ? theme.allSections[sec.type] : undefined;
      if (!sec || !def) { notes.push(`${file}/${key}: no such section, dropped`); continue; }
      const checked = checkSettings(def.settings, raw, assets, notes);
      if (Object.keys(checked).length) (groups[file] ||= {})[key] = checked;
    }
  }
  for (const n of (Array.isArray(j.notes) ? j.notes : []).slice(0, 10)) if (typeof n === 'string' && n.trim()) notes.push(`AI: ${n.trim().slice(0, 160)}`);
  return { settings, sections, groups, notes };
}

// ── The prompt ────────────────────────────────────────────────
const RELEVANT_GLOBAL = new Set(['color', 'font_picker', 'image_picker', 'text', 'select', 'checkbox', 'range', 'color_scheme', 'color_background']);
const GLOBAL_ID_HINT = /colou?r|font|logo|brand|button|heading|background|accent|border|radius|scheme|text/i;

function describeSettings(defs: SettingDef[], max: number): string {
  return defs.slice(0, max).map((d) => `${d.id} (${d.type}${d.options ? ': ' + d.options.join('|') : ''}${d.default !== undefined && typeof d.default !== 'object' ? ', now ' + JSON.stringify(d.default) : ''})`).join(', ');
}

export const PLAN_SYSTEM = `You fill a Shopify theme's settings for a merchant so the home page looks like a given style sheet. You get the theme's REAL setting ids and section types; use ONLY those ids and types, exactly as written. Output one JSON object, nothing else:
{"settings":{"<global setting id>":<value>},"sections":[{"type":"<section type>","settings":{"<id>":<value>},"blocks":[{"type":"<block type>","settings":{"<id>":<value>}}]}],"groups":{"<group file>":{"<section key>":{"<id>":<value>}}},"notes":["<a style-sheet section this theme cannot show, and why>"]}
Values: colours as "#rrggbb"; fonts as the font NAME (e.g. "Poppins"); images as "banner:<slot>" using only the slots listed; collections as the handle listed; products as the handle listed; text in English, short, the merchant's own (never the reference's words); booleans as true/false; select options exactly as listed.
Sections: ONE theme section per style-sheet section, in the style sheet's order (up to 20; skip a style-sheet section only when this theme has no section type for it, and say so in a "notes" list). Map each to the closest theme section type: hero-banner -> image banner; slideshow -> slideshow with one slide block per listed hero slot (count slides); featured-collection -> featured collection with one listed collection; collection-list -> a collection list with as many collection blocks as the style sheet's count, one listed collection each (reuse collections if there are fewer); product-grid -> a featured collection / product grid with the collection "all" and the count as products to show; promo-banners -> a multi-image banner / collage / image grid with one banner slot per image; image-banner -> image banner with a banner slot; image-with-text -> image with text with a banner slot; before-after -> a compare / before-after section if the theme has one, else image with text; trust-badges -> an icon / multicolumn / text-columns section with one block per item, each block's text from the style sheet's items; multicolumn -> multicolumn with one block per item; rich-text -> rich text; video -> a video section only if the theme has one; marquee -> a scrolling / marquee / ticker text section with one block per item if the theme has one; announcement-bar -> NOT a home section: its items go into the header group's announcement bar; testimonials -> testimonials / reviews section or multicolumn; faq -> collapsible content with 3-4 blocks; newsletter -> newsletter; logo-list / countdown / social-feed / blog -> only if the theme has such a section. Use the style sheet's count and items; text in the merchant's own voice. Add the blocks a section needs (headings, text, buttons, columns, collection blocks) with their settings; a collection list / collection block MUST carry its collection setting with a listed handle, one different collection per block, and a featured-collection section its collection too. groups: the header / footer sections the theme already has, by their key: set the logo (an image_picker named logo -> "banner:logo" when that slot exists), the announcement bar text to one short offer line in the merchant tone, the footer text / newsletter heading; change nothing else there. Leave a setting out rather than guess. Never invent an id.`;

export function planPrompt(theme: ThemeSummary, style: StyleSheet, assets: PlanAssets, storeName: string): string {
  const globals = theme.settings.filter((d) => RELEVANT_GLOBAL.has(d.type) && (d.type !== 'text' || GLOBAL_ID_HINT.test(d.id)) && (d.type !== 'range' || GLOBAL_ID_HINT.test(d.id)) && (d.type !== 'checkbox' || GLOBAL_ID_HINT.test(d.id)));
  const sectionLines = Object.values(theme.sections).map((s) => {
    const blocks = s.blocks.map((b) => `${b.type}[${describeSettings(b.settings, 12)}]`).join('; ');
    return `- ${s.type} ("${s.name}"): settings ${describeSettings(s.settings, 18)}${blocks ? ` | blocks: ${blocks}` : ''}`;
  });
  return [
    `Merchant store: ${storeName}`,
    `STYLE SHEET: ${JSON.stringify(style)}`,
    `IMAGE SLOTS available: ${assets.banners.map((b) => `banner:${b.slot}${b.alt ? ` (${b.alt})` : ''}`).join(', ') || '(none uploaded yet: leave image settings out)'}`,
    `COLLECTIONS (handle: title): ${assets.collections.map((c) => `${c.handle}: ${c.title}`).join('; ') || '(none)'}`,
    `PRODUCTS (handle: title), first few: ${assets.products.slice(0, 12).map((p) => `${p.handle}: ${p.title}`).join('; ') || '(none)'}`,
    '',
    `THEME: ${theme.name} ${theme.version}`,
    `GLOBAL SETTINGS you may set: ${describeSettings(globals, 80)}`,
    `SECTION TYPES you may use on the home page:`, ...sectionLines.slice(0, 80),
    ...groupLines(theme),
  ].join('\n');
}

const GROUP_SETTING_TYPES = ['image_picker', 'text', 'richtext', 'inline_richtext', 'textarea', 'color', 'checkbox', 'select', 'url'];

function groupLines(theme: ThemeSummary): string[] {
  const out: string[] = [];
  for (const [file, held] of Object.entries(theme.groups)) {
    if (!held.length) continue;
    out.push(`GROUP ${file} (existing sections, settings only; refer to them by key):`);
    for (const sec of held) {
      const def = theme.allSections[sec.type];
      if (!def) continue;
      const relevant = def.settings.filter((d) => GROUP_SETTING_TYPES.includes(d.type)).slice(0, 25);
      out.push(`- key ${sec.key} (type ${sec.type}): ${describeSettings(relevant, 25)}`);
    }
  }
  return out;
}

// ── Applying the plan to the theme files ─────────────────────
export function applyGroup(groupText: string, changes: Record<string, Record<string, unknown>>, imageUrls: Record<string, string>): string {
  const j = JSON.parse(groupText.replace(/^\s*\/\*[\s\S]*?\*\/\s*/, ''));
  const resolve = (v: unknown): unknown => (typeof v === 'string' && v.startsWith('banner:') ? imageUrls[v.slice(7)] : v);
  for (const [key, settings] of Object.entries(changes)) {
    if (!j.sections?.[key]) continue;
    const next = Object.entries(settings).map(([k, v]) => [k, resolve(v)] as const).filter(([, v]) => v !== undefined);
    j.sections[key].settings = { ...(j.sections[key].settings || {}), ...Object.fromEntries(next) };
  }
  return JSON.stringify(j, null, 2);
}

export function applyPlan(theme: ThemeSummary, plan: ThemePlan, settingsDataText: string | null, imageUrls: Record<string, string>): { settingsData: string; indexJson: string } {
  // settings_data.json: keep everything, overwrite `current` keys the plan sets.
  let data: Record<string, unknown> = {};
  try { data = settingsDataText ? JSON.parse(settingsDataText.replace(/^\s*\/\*[\s\S]*?\*\/\s*/, '')) : {}; } catch { data = {}; }
  const current = ((data.current && typeof data.current === 'object') ? data.current : {}) as Record<string, unknown>;
  const resolve = (v: unknown): unknown => (typeof v === 'string' && v.startsWith('banner:') ? imageUrls[v.slice(7)] : v);
  const resolved = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, resolve(v)]).filter(([, v]) => v !== undefined));
  data.current = { ...current, ...resolved(plan.settings) };

  const sections: Record<string, unknown> = {};
  const order: string[] = [];
  plan.sections.forEach((s, i) => {
    const key = `builder_${i + 1}_${s.type.replace(/[^a-z0-9]/g, '_')}`;
    const blocks: Record<string, unknown> = {};
    const blockOrder: string[] = [];
    s.blocks.forEach((b, j) => { const bk = `${b.type.replace(/[^a-z0-9]/g, '_')}_${j + 1}`; blocks[bk] = { type: b.type, settings: resolved(b.settings) }; blockOrder.push(bk); });
    sections[key] = { type: s.type, settings: resolved(s.settings), ...(blockOrder.length ? { blocks, block_order: blockOrder } : {}) };
    order.push(key);
  });
  const indexJson = JSON.stringify({ sections, order }, null, 2);
  return { settingsData: JSON.stringify(data, null, 2), indexJson };
}
