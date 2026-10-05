import { PRODUCT_FEATURES, type ProductFeature } from './product-features';
export { PRODUCT_FEATURES, type ProductFeature };
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
  sections: SiteSection[];           // EVERY section of the home page in order, header to footer, with what it holds
  colors: { value: string; count: number }[];
  fonts: string[];
  imageCount: number;
  policies: { kind: string; text: string }[];   // first 1500 chars of each /policies/* page
  collections: { title: string; handle: string; count?: number }[];
  products: { title: string; type: string; vendor: string; price: string; tags: string[] }[];
  textSample: string;                // ~2500 chars of visible text, for the tone only
  pages: { collection?: string; product?: string };   // the collection / product pages that were read
  collectionPage: SiteSection[];     // every section of one collection page, in order
  productPage: SiteSection[];        // every section of one product page, in order
  productFeatures: ProductFeature[]; // what the product page shows (compare price, rating, offer line, urgency ...)
  productOptions: string[];          // option names (Colour, Size ...) from the product's JSON
  variantCount: number;
  errors: string[];
}


const TRUST = /free shipping|secure (payment|checkout)|easy returns?|\d+[- ]days? (return|replacement)|cash on delivery|\bcod\b|24\s*[x\/]\s*7|money[- ]back|100% (original|genuine|authentic|secure)/gi;
export function productFeatures(html: string): ProductFeature[] {
  const h = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const text = stripTags(h);
  const has = (re: RegExp, on: string = text) => re.test(on);
  const out: ProductFeature[] = [];
  if (has(/<(s|del|strike)\b|compare[-_ ]?(at|price)|price__sale|price--on-sale|was[-_ ]price|old[-_ ]price/i, h)) out.push('compare_price');
  if (has(/save\s*(₹|rs\.?\s*)?\d+(\.\d+)?\s*%|\d+\s*%\s*off/i)) out.push('save_percent');
  if (has(/tax(es)?\s*(included|incl)/i)) out.push('tax_included');
  if (has(/\d(\.\d)?\s*(out of 5|\/\s*5\b)|\d(\.\d)?\s*stars?\b|jdgm-prev-badge|spr-badge|loox-rating|star[-_ ]rating|class=["'][^"']*\brating\b/i, h)) out.push('rating');
  if (has(/customer reviews|\d+\s*reviews?\b|jdgm-rev|spr-reviews|loox-reviews|review-widget|yotpo|write a review/i, h)) out.push('reviews');
  if (has(/buy\s*\d+\s*,?\s*get\s*\d+|\bbogo\b|b1g1|flat\s*\d+\s*%|free gift|combo offer|\d+\s*%\s*off on/i)) out.push('offer_badge');
  if (has(/variant-picker|product-form__input|swatch|data-option-index|data-option|option-value|options\[|name=["']options/i, h)) out.push('variants');
  if (has(/selling fast|only\s*\d+\s*left|hurry|low stock|\d+\s*(people|others)\s*(are\s*)?(viewing|looking)|sold in the last|left in stock|almost gone/i)) out.push('urgency');
  if (has(/estimated delivery|get it by|delivery by|order (within|in)\s|your order (will|would|arrives)|arrives? (by|between)|ships? (within|in)\s*\d|expected delivery|dispatch(ed)? (within|in)/i)) out.push('delivery_estimate');
  if (has(/size (chart|guide)/i)) out.push('size_chart');
  if (has(/\bfaqs?\b|frequently asked|questions? (&|and) answers/i)) out.push('faq');
  if (has(/<video\b|<iframe[^>]+(youtube|vimeo)|\.mp4\b/i, h)) out.push('video');
  if (new Set(Array.from(text.matchAll(TRUST)).map((m) => m[0].toLowerCase().replace(/\s+/g, ' '))).size >= 2) out.push('trust_badges');
  if (has(/wa\.me|api\.whatsapp|whatsapp/i, h)) out.push('whatsapp');
  if (has(/sticky[-_ ]?(add[-_ ]?to[-_ ]?cart|atc|cart|buy)|atc[-_ ]sticky|sticky[-_ ]bar/i, h)) out.push('sticky_cart');
  if (has(/you may also like|related products|recommended (for you|products)|product-recommendations|customers also|similar products|complete the look|pair it with|you might also/i, h)) out.push('recommendations');
  if (has(/frequently bought|\bbundle\b|buy together|complete the set/i)) out.push('bundle');
  if (has(/wishlist/i, h)) out.push('wishlist');
  return out;
}


// One section of the reference home page: its type and what it holds (counts, headings, the kind of text).
export interface SiteSection {
  place: 'header' | 'main' | 'footer';
  type: string;              // normalised section type (slideshow, collection-list, marquee ...) or 'section' when not a Shopify theme
  headings: string[];        // up to 4
  text: string;              // up to 220 characters of its visible text (for understanding only, never reused)
  items: string[];           // the running bar's phrases / the tiles' link texts, up to 12
  collections: number;       // distinct /collections/<handle> links (category tiles)
  products: number;          // distinct /products/<handle> links (product grid)
  images: number; videos: number; buttons: number;
  marquee: boolean;          // a running / scrolling text bar
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

const SKIP_SECTIONS = ['cart-drawer', 'cart-notification', 'cart-icon-bubble', 'predictive-search', 'cart', 'popup', 'popups', 'cookie', 'age-verification', 'search-drawer', 'mobile-menu', 'drawer', 'mini-cart'];
const normalType = (raw: string): string => {
  // featured_collection_AbC123 -> featured-collection: a trailing segment with digits, or a mixed-case
  // one (the editor's random ids), is Shopify's id, not the type.
  const parts = raw.split(/[_-]/);
  const isId = (seg: string) => /\d/.test(seg) || (/[A-Z]/.test(seg) && /[a-z]/.test(seg));
  while (parts.length > 1 && isId(parts[parts.length - 1])) parts.pop();
  return parts.join('-').toLowerCase();
};
const distinct = (re: RegExp, s: string, group = 1): string[] => Array.from(new Set(Array.from(s.matchAll(re)).map((m) => m[group].toLowerCase())));

// Every section of the home page in order: Shopify sections by their ids (header group, template, footer
// group), else the page's <section> elements. Each one is read for what it holds, never for reuse.
export function parseSections(html: string): SiteSection[] {
  const body = (html.match(/<body[\s\S]*$/i) || [html])[0].replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
  let marks = Array.from(body.matchAll(/id=["']shopify-section-([a-z0-9_-]+)["']/gi)).map((m) => ({ at: body.lastIndexOf('<', m.index || 0), id: m[1], shopify: true }));
  if (!marks.length) marks = Array.from(body.matchAll(/<section\b/gi)).map((m) => ({ at: m.index || 0, id: 'section', shopify: false }));
  const out: SiteSection[] = [];
  let seenMain = false;
  for (let i = 0; i < marks.length && out.length < 40; i++) {
    const { at, id, shopify } = marks[i];
    const slice = body.slice(at, i + 1 < marks.length ? marks[i + 1].at : undefined).slice(0, 300_000);
    const type = shopify ? normalType(id.replace(/^(template|sections)--[^_]+__/, '')) : 'section';
    if (SKIP_SECTIONS.includes(type) || SKIP_SECTIONS.some((s) => type.endsWith('-' + s))) continue;
    const isTemplate = /^template--/.test(id) || !shopify;
    if (isTemplate) seenMain = true;
    const place: SiteSection['place'] = isTemplate ? 'main' : (seenMain || /footer/.test(type) ? 'footer' : 'header');
    const headings = Array.from(slice.matchAll(/<(h[1-3])[^>]*>([\s\S]*?)<\/\1>/gi)).map((m) => stripTags(m[2]).slice(0, 100)).filter(Boolean).slice(0, 4);
    const text = stripTags(slice).slice(0, 220);
    const marquee = /class=["'][^"']*(marquee|ticker|scrolling[-_]text|running[-_]text|scroll[-_]text|text[-_]scroll)/i.test(slice) || /marquee|ticker|scrolling|running-text/.test(type);
    const linkTexts = Array.from(new Set(Array.from(slice.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi)).map((m) => stripTags(m[1]).slice(0, 50)).filter((t) => t && t.length > 1)));
    let items: string[] = [];
    if (marquee) {
      const inner = stripTags((slice.match(/<[^>]+class=["'][^"']*(?:marquee|ticker|scrolling|running)[^"']*["'][\s\S]*$/i) || [slice])[0]).slice(0, 2000);
      items = Array.from(new Set(inner.split(/\s*(?:[|•·★✦✧♥❤✓✔→›»—–]|\s{2,})\s*/).map((x) => x.trim()).filter((x) => x.length > 1 && x.length <= 60)));
    } else items = linkTexts;
    out.push({
      place, type, headings, text, items: items.slice(0, 12),
      collections: distinct(/href=["'][^"']*\/collections\/([a-z0-9-]+)(?:[/?#"']|$)/gi, slice).filter((h) => h !== 'all').length,
      products: distinct(/href=["'][^"']*\/products\/([a-z0-9-]+)(?:[/?#"']|$)/gi, slice).length,
      images: (slice.match(/<img\b/gi) || []).length,
      videos: Math.max((slice.match(/<video\b|<iframe[^>]+(youtube|vimeo)/gi) || []).length, (slice.match(/\.mp4\b/gi) || []).length),
      buttons: (slice.match(/<button\b|<a[^>]+class=["'][^"']*\b(btn|button)/gi) || []).length,
      marquee,
    });
  }
  return out;
}

export function parseHtml(html: string, baseUrl: string): Omit<SiteRead, 'url' | 'finalUrl' | 'policies' | 'collections' | 'products' | 'errors' | 'colors' | 'fonts' | 'pages' | 'collectionPage' | 'productPage' | 'productFeatures' | 'productOptions' | 'variantCount'> & { stylesheets: string[]; inlineCss: string; policyLinks: string[]; colorsRaw: string; } {
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
  const sections = parseSections(html);
  return { title, description, isShopify, nav, headings, sectionTypes, sections, stylesheets, inlineCss, policyLinks, imageCount, textSample, colorsRaw: '' };
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

export async function readSite(inputUrl: string, more: { collectionUrl?: string; productUrl?: string } = {}): Promise<SiteRead> {
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
  // One collection page and one product page: the ones the owner gave, else the first ones the store lists.
  const origin = new URL(page.finalUrl).origin;
  const homeLinks = Array.from(page.text.matchAll(/href=["']([^"']+)["']/gi)).map((m) => absolute(m[1], page.finalUrl));
  const pages: SiteRead['pages'] = {};
  const collectionUrl = normalizeUrl(more.collectionUrl || '') || (collections.find((c) => (c.count ?? 1) > 0 && c.handle) ? `${origin}/collections/${collections.find((c) => (c.count ?? 1) > 0 && c.handle)!.handle}` : homeLinks.find((l) => /\/collections\/(?!all\b)[a-z0-9-]+\/?$/i.test(l)));
  const productUrl = normalizeUrl(more.productUrl || '') || homeLinks.find((l) => /\/products\/[a-z0-9-]+\/?$/i.test(l)) || (parsed.isShopify && products.length ? undefined : undefined);
  let collectionPage: SiteSection[] = [], productPage: SiteSection[] = [], features: ProductFeature[] = [], productOptions: string[] = [], variantCount = 0;
  if (collectionUrl) {
    try { const r = await fetchText(collectionUrl, 15_000); if (r.status < 400) { collectionPage = parseSections(r.text); pages.collection = r.finalUrl; } else errors.push(`collection page answered ${r.status}`); } catch (e) { errors.push(`collection page: ${(e as Error).message}`); }
  }
  let productHref = productUrl;
  if (!productHref && parsed.isShopify) {
    // products.json carries handles: use the first.
    try { const r = await fetchText(`${origin}/products.json?limit=1`, 10_000, 'application/json'); const h = r.status < 400 ? JSON.parse(r.text).products?.[0]?.handle : null; if (h) productHref = `${origin}/products/${h}`; } catch { /* no product page then */ }
  }
  if (productHref) {
    try {
      const r = await fetchText(productHref, 15_000);
      if (r.status < 400) { productPage = parseSections(r.text); features = productFeatures(r.text); pages.product = r.finalUrl; } else errors.push(`product page answered ${r.status}`);
      const m = productHref.match(/\/products\/([a-z0-9-]+)/i);
      if (m && parsed.isShopify) {
        try { const j = await fetchText(`${origin}/products/${m[1]}.js`, 10_000, 'application/json'); const pj = j.status < 400 ? JSON.parse(j.text) : null; if (pj) { productOptions = (Array.isArray(pj.options) ? pj.options : []).map((o: unknown) => (typeof o === 'string' ? o : String((o as { name?: string })?.name || ''))).filter(Boolean).slice(0, 5); variantCount = Array.isArray(pj.variants) ? pj.variants.length : 0; } } catch { /* fine */ }
      }
    } catch (e) { errors.push(`product page: ${(e as Error).message}`); }
  }
  return { url, finalUrl: page.finalUrl, title: parsed.title, description: parsed.description, isShopify: parsed.isShopify, nav: parsed.nav, headings: parsed.headings, sectionTypes: parsed.sectionTypes, sections: parsed.sections, colors, fonts, imageCount: parsed.imageCount, policies, collections, products, textSample: parsed.textSample, pages, collectionPage, productPage, productFeatures: features, productOptions, variantCount, errors };
}
