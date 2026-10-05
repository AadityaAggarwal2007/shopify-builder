// The "style sheet": what the tool keeps from a reference website. Structure, colours, fonts, tone,
// section order, collection ideas. NEVER the site's text or images (owner's rule, AGENTS.md rule 4).
// Pure: the prompt for the AI and the strict parse of its answer.
import type { SiteRead } from './read-site';

export const SECTION_TYPES = ['announcement-bar', 'marquee', 'hero-banner', 'slideshow', 'featured-collection', 'collection-list', 'product-grid', 'promo-banners', 'image-banner', 'image-with-text', 'before-after', 'trust-badges', 'multicolumn', 'rich-text', 'video', 'testimonials', 'faq', 'newsletter', 'logo-list', 'countdown', 'social-feed', 'blog'] as const;
// What each type means (shown in the screen and told to the AI).
export const SECTION_MEANING: Record<SectionType, string> = {
  'announcement-bar': 'the thin bar on top (one offer line)', 'marquee': 'a running / scrolling text bar with short phrases', 'hero-banner': 'one big banner', 'slideshow': '2-5 banners that slide',
  'featured-collection': 'products of one collection', 'collection-list': 'category tiles, each a collection', 'product-grid': 'many products (all / best sellers)', 'promo-banners': '2-4 banners side by side',
  'image-banner': 'one promo banner with a button', 'image-with-text': 'photo on one side, text on the other', 'before-after': 'a before / after image compare', 'trust-badges': 'icons with promises (free shipping, returns, secure payment)',
  'multicolumn': '3-4 columns of short text', 'rich-text': 'a heading + paragraph', 'video': 'a video', 'testimonials': 'customer reviews', 'faq': 'questions and answers', 'newsletter': 'email sign-up',
  'logo-list': 'a row of logos', 'countdown': 'an offer timer', 'social-feed': 'Instagram / social posts', 'blog': 'latest articles',
};
export type SectionType = typeof SECTION_TYPES[number];

export interface StyleSheet {
  brand: { name: string; tagline: string };
  palette: { primary: string; secondary: string; accent: string; background: string; text: string };
  fonts: { heading: string; body: string };
  tone: string;                                   // 2-3 sentences on how the store talks
  sections: { type: SectionType; title: string; note: string; count?: number; items?: string[] }[];   // home page, top to bottom; count = tiles / slides / items; items = NEW short lines (marquee, badges, columns)
  collections: { title: string; note: string }[];                    // ideas for the new store's collections
  offers: string[];                                                   // kinds of offers the reference uses (e.g. "free shipping above a threshold")
  policies: { shipping: string; refund: string };                     // how the reference's policies read (summary, not copy)
}

export const STYLE_SYSTEM = `You study an online store for a merchant who wants a NEW Shopify store that FEELS like it.
You must describe STRUCTURE, STYLE and TONE only. Never copy sentences, product names, brand names or slogans from the reference.
Answer with one JSON object and nothing else, exactly this shape:
{"brand":{"name":"","tagline":""},"palette":{"primary":"#hex","secondary":"#hex","accent":"#hex","background":"#hex","text":"#hex"},"fonts":{"heading":"","body":""},"tone":"","sections":[{"type":"hero-banner","title":"","note":"","count":1,"items":[""]}],"collections":[{"title":"","note":""}],"offers":[""],"policies":{"shipping":"","refund":""}}
Rules:
- brand.name = the MERCHANT'S own store name given to you (not the reference's); tagline = a NEW short line in the reference's spirit.
- palette: 5 hex colours that match the reference's look (from the colour list; pick the brand colour as primary, a light background, a dark text colour).
- fonts: name a heading and a body font from the reference's fonts when they are common web fonts; otherwise suggest a similar free Google font.
- tone: 2 or 3 sentences: formal or playful, Hinglish or English, how offers are worded, emoji or not.
- sections: ONE entry per section of the reference home page, in the order a visitor sees them (the list "REFERENCE HOME PAGE SECTIONS" below is complete: keep every section it shows, including the header's announcement bar and running text bar, every banner, every category tile row, the product grids, videos, badges; 4 to 24 entries). Types only from: ${SECTION_TYPES.map((t) => `${t} (${SECTION_MEANING[t]})`).join('; ')}. title = a NEW title for the merchant's store; note = what goes in it (one line); count = how many slides / tiles / items / products that section shows on the reference (a number); items = for a marquee, trust-badges, multicolumn or announcement-bar: NEW short lines in the merchant's own voice, as many as the reference shows (never its words).
- collections: 3 to 8 collection ideas named for the MERCHANT'S products (given), in the reference's style of naming.
- offers: the KINDS of offers the reference uses (free shipping threshold, bundle, first-order discount...), 0 to 5, no numbers copied.
- policies: one line each describing how the reference's shipping and refund policies read (strict or generous, days mentioned or not), for writing the merchant's own later.`;

export function stylePrompt(site: SiteRead, merchant: { storeName: string; productTypes: string[]; sampleTitles: string[] }): string {
  const lines = [
    `Merchant's store name: ${merchant.storeName}`,
    `Merchant's product types: ${merchant.productTypes.slice(0, 15).join(', ') || '(unknown)'}`,
    `Some of the merchant's product titles: ${merchant.sampleTitles.slice(0, 15).join(' | ') || '(none yet)'}`,
    '',
    `REFERENCE SITE: ${site.finalUrl}`,
    `Title: ${site.title}`, `Description: ${site.description}`,
    `Shopify store: ${site.isShopify ? 'yes' : 'no'}`,
    `Navigation: ${site.nav.map((n) => n.text).join(' | ')}`,
    site.sections.length ? `REFERENCE HOME PAGE SECTIONS, top to bottom (${site.sections.length}; describe EACH as one entry):\n${site.sections.map(sectionLine).join('\n')}` : `Headings in order: ${site.headings.map((h) => `${h.tag}: ${h.text}`).join(' | ')}`,
    `Most used colours: ${site.colors.slice(0, 25).map((c) => `${c.value} (${c.count})`).join(', ')}`,
    `Fonts: ${site.fonts.join(', ') || '(none found)'}`,
    site.collections.length ? `Reference collections: ${site.collections.map((c) => c.title).join(' | ')}` : '',
    site.products.length ? `Reference product types / tags: ${Array.from(new Set(site.products.flatMap((p) => [p.type, ...p.tags]).filter(Boolean))).slice(0, 30).join(', ')}` : '',
    site.policies.length ? `Policy pages (summarise the style, never copy):\n${site.policies.map((p) => `[${p.kind}] ${p.text.slice(0, 700)}`).join('\n')}` : '',
    `Visible text sample (tone only):\n${site.textSample.slice(0, 1800)}`,
  ].filter(Boolean);
  return lines.join('\n');
}

function sectionLine(s: SiteRead['sections'][number], i: number): string {
  const facts = [s.collections ? `${s.collections} category links` : '', s.products ? `${s.products} product links` : '', s.images ? `${s.images} images` : '', s.videos ? `${s.videos} video` : '', s.buttons ? `${s.buttons} buttons` : '', s.marquee ? 'RUNNING TEXT BAR' : ''].filter(Boolean).join(', ');
  return `#${i + 1} [${s.place}] ${s.type}${facts ? ` (${facts})` : ''}${s.headings.length ? ` headings: ${s.headings.map((h) => `"${h}"`).join(' / ')}` : ''}${s.items.length ? ` items: ${s.items.slice(0, 10).map((x) => `"${x}"`).join(', ')}` : ''}${s.text ? ` text: "${s.text.slice(0, 140)}"` : ''}`;
}

const HEX = /^#[0-9a-f]{6}$/i;
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const hex = (v: unknown, fallback: string) => (typeof v === 'string' && HEX.test(v.trim()) ? v.trim().toLowerCase() : fallback);

// Strict: unknown section types dropped, lists capped, colours must be hex. Throws when nothing usable.
export function parseStyleSheet(text: string, fallbackName: string): StyleSheet {
  const raw = text.replace(/```json|```/g, '').trim();
  const start = raw.indexOf('{'), end = raw.lastIndexOf('}');
  if (start < 0 || end < 0) throw new Error('The AI did not answer with a style sheet');
  let j: Record<string, unknown>;
  try { j = JSON.parse(raw.slice(start, end + 1)); } catch { throw new Error('The AI answer was not valid JSON'); }
  const brand = (j.brand || {}) as Record<string, unknown>, palette = (j.palette || {}) as Record<string, unknown>, fonts = (j.fonts || {}) as Record<string, unknown>, pol = (j.policies || {}) as Record<string, unknown>;
  const sections = (Array.isArray(j.sections) ? j.sections : []).map((s: Record<string, unknown>) => {
    const count = Math.round(Number(s?.count));
    const items = (Array.isArray(s?.items) ? s.items : []).map((x: unknown) => str(x, 60)).filter(Boolean).slice(0, 8);
    return { type: str(s?.type, 40) as SectionType, title: str(s?.title, 80), note: str(s?.note, 200), ...(count >= 1 && count <= 50 ? { count } : {}), ...(items.length ? { items } : {}) };
  }).filter((s) => (SECTION_TYPES as readonly string[]).includes(s.type)).slice(0, 24);
  const collections = (Array.isArray(j.collections) ? j.collections : []).map((c: Record<string, unknown>) => ({ title: str(c?.title, 60), note: str(c?.note, 160) })).filter((c) => c.title).slice(0, 10);
  const offers = (Array.isArray(j.offers) ? j.offers : []).map((o: unknown) => str(o, 120)).filter(Boolean).slice(0, 6);
  if (!sections.length) throw new Error('The AI gave no usable home page sections');
  return {
    brand: { name: str(brand.name, 60) || fallbackName, tagline: str(brand.tagline, 120) },
    palette: { primary: hex(palette.primary, '#1f2937'), secondary: hex(palette.secondary, '#6b7280'), accent: hex(palette.accent, '#d97706'), background: hex(palette.background, '#ffffff'), text: hex(palette.text, '#111827') },
    fonts: { heading: str(fonts.heading, 60) || 'Poppins', body: str(fonts.body, 60) || 'Inter' },
    tone: str(j.tone, 600),
    sections, collections, offers,
    policies: { shipping: str(pol.shipping, 300), refund: str(pol.refund, 300) },
  };
}

// Owner edits come back from the screen: same checks, nothing invented.
export function cleanStyleSheet(input: unknown, fallback: StyleSheet): StyleSheet {
  const j = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const merged = { ...fallback, ...j } as Record<string, unknown>;
  return parseStyleSheet(JSON.stringify(merged), fallback.brand.name);
}
