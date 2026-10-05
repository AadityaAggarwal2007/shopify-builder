// What a theme can be told: its global settings (config/settings_schema.json) and its sections
// (sections/*.liquid {% schema %}). Pure parsing into a compact summary the AI and the validator use.

export interface SettingDef { id: string; type: string; label: string; default?: unknown; options?: string[]; group: string }
export interface SectionDef {
  type: string; name: string; settings: SettingDef[];
  blocks: { type: string; name: string; settings: SettingDef[]; limit?: number }[];
  maxBlocks?: number; presets: boolean; enabledOnIndex: boolean;
  templates: string[] | null;          // enabled_on.templates (null = anywhere), disabled_on folded in by allowedOn
  disabledTemplates: string[];
  groupsOnly: boolean;                 // enabled_on.groups without 'template' = header / footer only
}
export interface TemplateSection { key: string; type: string; settings: Record<string, unknown>; blocks: { key: string; type: string }[]; disabled?: boolean }
export interface TemplateDef { sections: TemplateSection[]; order: string[] }
export interface ThemeSummary {
  name: string; version: string;
  settings: SettingDef[];                // global settings with an id
  sections: Record<string, SectionDef>;  // home page section types (with presets, allowed on index)
  allSections: Record<string, SectionDef>; // every section with a schema (the header / footer groups use them)
  groups: Record<string, GroupSection[]>;  // header-group / footer-group: the sections they hold, in order
  templates: Record<string, TemplateDef>;  // product / collection JSON templates: the sections they hold
  templateSections: Record<string, string[]>; // product / collection: the section types that may be ADDED there
  currentSettings: Record<string, unknown>;  // settings_data.json current
  indexOrder: string[];                  // templates/index.json order (section keys)
  index: IndexTemplate | null;
}
export interface IndexSection { type: string; settings?: Record<string, unknown>; blocks?: Record<string, { type: string; settings?: Record<string, unknown> }>; block_order?: string[]; disabled?: boolean }
export interface IndexTemplate { sections: Record<string, IndexSection>; order: string[]; [k: string]: unknown }

// Settings that carry translations ("t:settings_schema.colors.name") just keep the key as label.
const label = (v: unknown) => (typeof v === 'string' ? v.replace(/^t:/, '') : '');

function defs(list: unknown, group: string): SettingDef[] {
  if (!Array.isArray(list)) return [];
  const out: SettingDef[] = [];
  for (const s of list as Record<string, unknown>[]) {
    if (!s || typeof s.id !== 'string' || typeof s.type !== 'string') continue;   // headers / paragraphs
    const options = Array.isArray(s.options) ? (s.options as Record<string, unknown>[]).map((o) => String(o?.value ?? '')).filter(Boolean) : undefined;
    out.push({ id: s.id, type: s.type, label: label(s.label) || s.id, default: s.default, options, group });
  }
  return out;
}

export function parseSettingsSchema(text: string): { name: string; version: string; settings: SettingDef[] } {
  let j: unknown;
  try { j = JSON.parse(text); } catch { throw new Error('config/settings_schema.json is not valid JSON'); }
  if (!Array.isArray(j)) throw new Error('config/settings_schema.json should be a list');
  let name = '', version = '';
  const settings: SettingDef[] = [];
  for (const g of j as Record<string, unknown>[]) {
    if (g?.name === 'theme_info') { name = String(g.theme_name || ''); version = String(g.theme_version || ''); continue; }
    settings.push(...defs(g?.settings, label(g?.name) || 'settings'));
  }
  return { name, version, settings };
}

export function parseSectionSchema(type: string, text: string): SectionDef | null {
  let j: Record<string, unknown>;
  try { j = JSON.parse(text); } catch { return null; }
  const blocks = Array.isArray(j.blocks) ? (j.blocks as Record<string, unknown>[]).filter((b) => typeof b?.type === 'string' && b.type !== '@app').map((b) => ({ type: String(b.type), name: label(b.name) || String(b.type), settings: defs(b.settings, String(b.type)), limit: typeof b.limit === 'number' ? b.limit : undefined })) : [];
  const enabledOn = (j.enabled_on as { templates?: string[]; groups?: string[] } | undefined);
  const disabledOn = (j.disabled_on as { templates?: string[]; groups?: string[] } | undefined);
  const groupsOnly = Boolean((enabledOn?.groups && !enabledOn.groups.includes('*') && !enabledOn.groups.includes('template')) || (disabledOn?.groups && (disabledOn.groups.includes('*') || disabledOn.groups.includes('template'))));
  const def: SectionDef = { type, name: label(j.name) || type, settings: defs(j.settings, type), blocks, maxBlocks: typeof j.max_blocks === 'number' ? j.max_blocks : undefined, presets: Array.isArray(j.presets) && j.presets.length > 0, enabledOnIndex: true, templates: Array.isArray(enabledOn?.templates) ? enabledOn!.templates!.map(String) : null, disabledTemplates: Array.isArray(disabledOn?.templates) ? disabledOn!.templates!.map(String) : [], groupsOnly };
  def.enabledOnIndex = allowedOn(def, 'index');
  return def;
}

// May a section be ADDED to this template (index, product, collection)? Needs presets (else it is a main section).
export function allowedOn(d: SectionDef, template: string): boolean {
  if (!d.presets || d.groupsOnly) return false;
  if (d.templates && !d.templates.includes('*') && !d.templates.includes(template)) return false;
  if (d.disabledTemplates.includes('*') || d.disabledTemplates.includes(template)) return false;
  return true;
}

export function parseTemplate(text: string): TemplateDef | null {
  try {
    const j = JSON.parse(text.replace(/^\s*\/\*[\s\S]*?\*\/\s*/, ''));
    if (!j?.sections || !Array.isArray(j.order)) return null;
    const sections: TemplateSection[] = (j.order as string[]).map((key) => {
      const s = j.sections[key] || {};
      const blockOrder: string[] = Array.isArray(s.block_order) ? s.block_order : Object.keys(s.blocks || {});
      return { key, type: String(s.type || ''), settings: (s.settings || {}) as Record<string, unknown>, blocks: blockOrder.map((bk) => ({ key: bk, type: String(s.blocks?.[bk]?.type || '') })).filter((b) => b.type), ...(s.disabled ? { disabled: true } : {}) };
    }).filter((x) => x.type);
    return { sections, order: j.order as string[] };
  } catch {
    return null;
  }
}

export function parseIndexTemplate(text: string | null): IndexTemplate | null {
  if (!text) return null;
  try {
    const j = JSON.parse(text.replace(/^\s*\/\*[\s\S]*?\*\/\s*/, ''));   // Shopify writes a comment block on top
    if (!j || typeof j !== 'object' || !j.sections || !Array.isArray(j.order)) return null;
    return j as IndexTemplate;
  } catch {
    return null;
  }
}

export function parseSettingsData(text: string | null): Record<string, unknown> {
  if (!text) return {};
  try {
    const j = JSON.parse(text.replace(/^\s*\/\*[\s\S]*?\*\/\s*/, ''));
    return (j?.current && typeof j.current === 'object' ? j.current : {}) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export interface GroupSection { key: string; type: string; settings: Record<string, unknown> }

export function parseGroup(text: string): GroupSection[] {
  try {
    const j = JSON.parse(text.replace(/^\s*\/\*[\s\S]*?\*\/\s*/, ''));
    if (!j?.sections || !Array.isArray(j.order)) return [];
    return (j.order as string[]).map((key) => ({ key, type: String(j.sections[key]?.type || ''), settings: (j.sections[key]?.settings || {}) as Record<string, unknown> })).filter((x) => x.type);
  } catch {
    return [];
  }
}

export function summarize(files: { settingsSchema: string | null; settingsData: string | null; indexTemplate: string | null; sections: Record<string, string>; groups?: Record<string, string>; templates?: Record<string, string> }): ThemeSummary {
  if (!files.settingsSchema) throw new Error('config/settings_schema.json missing');
  const schema = parseSettingsSchema(files.settingsSchema);
  const sections: Record<string, SectionDef> = {};
  const allSections: Record<string, SectionDef> = {};
  for (const [type, text] of Object.entries(files.sections)) { const d = parseSectionSchema(type, text); if (!d) continue; allSections[type] = d; if (d.presets && d.enabledOnIndex) sections[type] = d; }
  const groups: ThemeSummary['groups'] = {};
  for (const [name, text] of Object.entries(files.groups || {})) if (/-group$/.test(name)) groups[name] = parseGroup(text);
  const templates: ThemeSummary['templates'] = {};
  const templateSections: ThemeSummary['templateSections'] = {};
  for (const [name, text] of Object.entries(files.templates || {})) {
    const t = parseTemplate(text);
    if (!t) continue;
    templates[name] = t;
    templateSections[name] = Object.values(allSections).filter((d) => allowedOn(d, name)).map((d) => d.type);
  }
  const index = parseIndexTemplate(files.indexTemplate);
  return { name: schema.name, version: schema.version, settings: schema.settings, sections, allSections, groups, templates, templateSections, currentSettings: parseSettingsData(files.settingsData), indexOrder: index ? index.order : [], index };
}
