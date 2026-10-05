// A Shopify theme as a zip: read the files the filler needs, write a new zip with the changed ones.
// jszip, in memory. A theme zip is at most 60 MB; files other than the ones we change are copied
// byte for byte.
import JSZip from 'jszip';

export const MAX_THEME_ZIP = 60 * 1024 * 1024;

export interface ThemeFiles {
  settingsSchema: string | null;   // config/settings_schema.json
  settingsData: string | null;     // config/settings_data.json
  indexTemplate: string | null;    // templates/index.json (Online Store 2.0) or null (legacy liquid)
  sections: Record<string, string>; // sections/<name>.liquid -> the {% schema %} JSON text
  groups: Record<string, string>;   // sections/<name>.json (header-group / footer-group) -> JSON text
  templates: Record<string, string>; // templates/product.json, templates/collection.json when they exist (JSON templates)
  prefix: string;                  // folder prefix inside the zip ('' or 'my-theme/')
  fileCount: number;
}

// Theme zips exported by Shopify have the files at the root; zips made by hand often wrap them in
// one folder. Find the folder that holds config/settings_schema.json.
function findPrefix(zip: JSZip): string | null {
  for (const name of Object.keys(zip.files)) {
    const m = name.match(/^(.*?)config\/settings_schema\.json$/);
    if (m) return m[1];
  }
  return null;
}

export async function readThemeZip(buf: Buffer): Promise<{ zip: JSZip; files: ThemeFiles }> {
  if (buf.length > MAX_THEME_ZIP) throw new Error('Theme zip is bigger than 60 MB');
  let zip: JSZip;
  try { zip = await JSZip.loadAsync(buf); } catch { throw new Error('Not a zip file'); }
  const prefix = findPrefix(zip);
  if (prefix === null) throw new Error('This zip is not a Shopify theme (config/settings_schema.json not found)');
  const text = async (p: string) => { const f = zip.file(prefix + p); return f ? await f.async('string') : null; };
  const sections: Record<string, string> = {};
  const groups: Record<string, string> = {};
  const esc = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const name of Object.keys(zip.files)) {
    const g = name.match(new RegExp(`^${esc}sections/([a-z0-9_-]+)\\.json$`));
    if (g) { groups[g[1]] = await zip.file(name)!.async('string'); continue; }
    const m = name.match(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}sections/([a-z0-9_-]+)\\.liquid$`));
    if (!m) continue;
    const liquid = await zip.file(name)!.async('string');
    const schema = liquid.match(/{%-?\s*schema\s*-?%}([\s\S]*?){%-?\s*endschema\s*-?%}/);
    if (schema) sections[m[1]] = schema[1].trim();
  }
  const templates: Record<string, string> = {};
  for (const t of ['product', 'collection']) { const v = await text(`templates/${t}.json`); if (v) templates[t] = v; }
  return {
    zip,
    files: { settingsSchema: await text('config/settings_schema.json'), settingsData: await text('config/settings_data.json'), indexTemplate: await text('templates/index.json'), sections, groups, templates, prefix, fileCount: Object.keys(zip.files).length },
  };
}

export async function writeThemeZip(zip: JSZip, prefix: string, changed: Record<string, string>): Promise<Buffer> {
  for (const [path, content] of Object.entries(changed)) zip.file(prefix + path, content);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}
