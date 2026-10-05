// Reads a reference website without a browser: the HTML, up to 5 of its stylesheets, and (when it
// is a Shopify store) its public /products.json and /collections.json. Pulls out STRUCTURE only:
// title, nav, headings in order, Shopify section types in order, the most used colours, the font
// families, policy page summaries, collection names. Never copies text to reuse: the AI sees it to
// learn the tone, nothing is stored for output. 20 s per fetch, 1.5 MB per document.

export interface SiteRead {
  url: string; finalUrl: string; title: string; description: string; isShopify: boolean;
  nav: { text: string; href: string }[];
  headings: { tag: string; text: string }[];
  sectionTypes: string[];            // e.g. image-banner, featured-collection, multicolumn (Shopify themes)
  colors: { value: string; count: number }[];
  fonts: string[];
  imageCount: number;
  policies: { kind: string; text: string }[];   // first 1500 chars of each /policies/* page
  collections: { title: string; handle: string; count?: number }[];
  products: { title: string; type: string; vendor: string; price: string; tags: string[] }[];
  textSample: string;                // ~2500 chars of visible text, for the tone only
  errors: string[];
}

const MAX_BYTES = 1_500_000;
const UA = 'Mozilla/5.0 (compatible; ShopifyBuilder/1.0; +https://merchantbuild.in)';

export async function fetchText(url: string, timeoutMs = 20_000, accept = 'text/html,*/*'): Promise<{ text: string; finalUrl: string; status: number; contentType: string }> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal, redirect: 'follow', headers: { 'User-Agent': UA, Accept: accept, 'Accept-Language': 'en-IN,en;q=0.9' } });
    const buf = Buffer.from(await res.arrayBuffer());
    return { text: buf.subarray(0, MAX_BYTES).toString('utf8'), finalUrl: res.url || url, status: res.status, contentType: res.headers.get('content-type') || '' };
  } finally {
    clearTimeout(t);
  }
}

export function normalizeUrl(input: string): string | null {
  let s = (input || '').trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(u.hostname)) return null;
    if (['localhost', '127.0.0.1', '0.0.0.0'].includes(u.hostname) || /^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(u.hostname)) return null;
    u.hash = '';
    return u.toString();
  } catch {
    return null;
  }
}

const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
const stripTags = (s: string) => decode(s.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

export function parseHtml(html: string, baseUrl: string): Omit<SiteRead, 'url' | 'finalUrl' | 'policies' | 'collections' | 'products' | 'errors' | 'colors' | 'fonts'> & { stylesheets: string[]; inlineCss: string; policyLinks: string[]; colorsRaw: string; } {
  const title = stripTags((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').slice(0, 200);
  const description = decode((html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) || html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i) || [])[1] || '').slice(0, 300);
  const isShopify = /cdn\.shopify\.com|Shopify\.theme|shopify-section/i.test(html);

  // Navigation: links inside <nav> / <header>, deduplicated, at most 25.
  const navHtml = (html.match(/<nav[\s\S]*?<\/nav>/gi) || []).join(' ') || (html.match(/<header[\s\S]*?<\/header>/i) || [''])[0];
  const nav: { text: string; href: string }[] = [];
  const seenNav = new Set<string>();
  for (const m of navHtml.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const text = stripTags(m[2]).slice(0, 60); const href = m[1];
    if (!text || seenNav.has(text.toLowerCase()) || /^(javascript:|#$)/.test(href)) continue;
    seenNav.add(text.toLowerCase()); nav.push({ text, href: absolute(href, baseUrl) });
    if (nav.length >= 25) break;
  }

  const headings: { tag: string; text: string }[] = [];
  for (const m of html.matchAll(/<(h[1-3])[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const text = stripTags(m[2]).slice(0, 120);
    if (text) headings.push({ tag: m[1].toLowerCase(), text });
    if (headings.length >= 40) break;
  }

  // Shopify section ids: shopify-section-template--123__image_banner or shopify-section-header.
  const sectionTypes: string[] = [];
  for (const m of html.matchAll(/id=["']shopify-section-(?:template--[^"'_]+__)?([a-z0-9_-]+)["']/gi)) {
    // featured_collection_AbC123 -> featured-collection: trailing segments with digits are Shopify's ids.
    const parts = m[1].toLowerCase().split(/[_-]/);
    while (parts.length > 1 && /\d/.test(parts[parts.length - 1])) parts.pop();
    const t = parts.join('-');
    if (!['header', 'footer', 'announcement-bar', 'cart-drawer', 'cart-notification', 'cart-icon-bubble'].includes(t)) sectionTypes.push(t);
    if (sectionTypes.length >= 30) break;
  }

  const stylesheets: string[] = [];
  for (const m of html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi)) {
    const href = (m[0].match(/href=["']([^"']+)["']/) || [])[1];
    if (href) stylesheets.push(absolute(href, baseUrl));
    if (stylesheets.length >= 5) break;
  }
  const inlineCss = (html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) || []).join('\n').slice(0, 400_000);
  const policyLinks = Array.from(new Set(Array.from(html.matchAll(/href=["']([^"']*\/policies\/[a-z-]+)["']/gi)).map((m) => absolute(m[1], baseUrl)))).slice(0, 6);
  const imageCount = (html.match(/<img\b/gi) || []).length;
  const textSample = stripTags((html.match(/<main[\s\S]*?<\/main>/i) || html.match(/<body[\s\S]*?<\/body>/i) || [html])[0]).slice(0, 2500);
  return { title, description, isShopify, nav, headings, sectionTypes, stylesheets, inlineCss, policyLinks, imageCount, textSample, colorsRaw: '' };
}

function absolute(href: string, base: string): string {
  try { return new URL(href, base).toString(); } catch { return href; }
}

// Colours: hex / rgb values by frequency, greys and near-white / near-black folded out of the top list
// but kept with their counts; fonts: font-family names, generic families dropped.
export function extractColorsAndFonts(css: string): { colors: { value: string; count: number }[]; fonts: string[] } {
  const counts = new Map<string, number>();
  for (const m of css.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
    let h = m[1].toLowerCase();
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    counts.set(`#${h}`, (counts.get(`#${h}`) || 0) + 1);
  }
  for (const m of css.matchAll(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/gi)) {
    const h = `#${[m[1], m[2], m[3]].map((n) => Math.min(255, Number(n)).toString(16).padStart(2, '0')).join('')}`;
    counts.set(h, (counts.get(h) || 0) + 1);
  }
  const colors = Array.from(counts.entries()).map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count).slice(0, 40);
  const fonts = new Set<string>();
  for (const m of css.matchAll(/font-family\s*:\s*([^;}!]+)/gi)) {
    for (const f of m[1].split(',')) {
      const name = f.trim().replace(/^["']|["']$/g, '').trim();
      if (!name || /^(inherit|initial|unset|serif|sans-serif|monospace|system-ui|cursive|fantasy|-apple-system|BlinkMacSystemFont|Segoe UI|Roboto|Helvetica( Neue)?|Arial|ui-sans-serif|ui-serif|var\(.*)$/i.test(name)) continue;
      fonts.add(name);
      if (fonts.size >= 12) break;
    }
  }
  return { colors, fonts: Array.from(fonts) };
}

export async function readSite(inputUrl: string): Promise<SiteRead> {
  const url = normalizeUrl(inputUrl);
  if (!url) throw new Error('That does not look like a website address');
  const errors: string[] = [];
  const page = await fetchText(url);
  if (page.status >= 400) throw new Error(`The site answered ${page.status}`);
  if (!/html/i.test(page.contentType) && !/<html/i.test(page.text)) throw new Error('That address is not a web page');
  const parsed = parseHtml(page.text, page.finalUrl);

  let css = parsed.inlineCss;
  await Promise.all(parsed.stylesheets.map(async (href) => {
    try { const r = await fetchText(href, 15_000, 'text/css,*/*'); if (r.status < 400) css += '\n' + r.text.slice(0, 400_000); } catch (e) { errors.push(`stylesheet: ${(e as Error).message}`); }
  }));
  const { colors, fonts } = extractColorsAndFonts(css);

  const policies: { kind: string; text: string }[] = [];
  await Promise.all(parsed.policyLinks.map(async (href) => {
    try {
      const r = await fetchText(href, 15_000);
      if (r.status < 400) policies.push({ kind: (href.match(/\/policies\/([a-z-]+)/) || [])[1] || 'policy', text: stripTags((r.text.match(/<main[\s\S]*?<\/main>/i) || [r.text])[0]).slice(0, 1500) });
    } catch (e) { errors.push(`policy: ${(e as Error).message}`); }
  }));

  const collections: SiteRead['collections'] = [];
  const products: SiteRead['products'] = [];
  if (parsed.isShopify) {
    const origin = new URL(page.finalUrl).origin;
    try {
      const r = await fetchText(`${origin}/collections.json?limit=50`, 15_000, 'application/json');
      if (r.status < 400) for (const c of (JSON.parse(r.text).collections || []).slice(0, 50)) collections.push({ title: String(c.title || ''), handle: String(c.handle || ''), count: typeof c.products_count === 'number' ? c.products_count : undefined });
      else errors.push(`collections.json answered ${r.status}`);
    } catch (e) { errors.push(`collections.json: ${(e as Error).message}`); }
    try {
      const r = await fetchText(`${origin}/products.json?limit=50`, 15_000, 'application/json');
      if (r.status < 400) for (const p of (JSON.parse(r.text).products || []).slice(0, 50)) products.push({ title: String(p.title || '').slice(0, 120), type: String(p.product_type || ''), vendor: String(p.vendor || ''), price: String(p.variants?.[0]?.price || ''), tags: Array.isArray(p.tags) ? p.tags.slice(0, 8).map(String) : [] });
      else errors.push(`products.json answered ${r.status}`);
    } catch (e) { errors.push(`products.json: ${(e as Error).message}`); }
  }
  return { url, finalUrl: page.finalUrl, title: parsed.title, description: parsed.description, isShopify: parsed.isShopify, nav: parsed.nav, headings: parsed.headings, sectionTypes: parsed.sectionTypes, colors, fonts, imageCount: parsed.imageCount, policies, collections, products, textSample: parsed.textSample, errors };
}
