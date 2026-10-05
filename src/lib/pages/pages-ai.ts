// Pages, policies and menu for the new store: the AI drafts from the FACTS the owner typed and the
// style sheet's tone / policy notes. Pure: prompt + strict parse. Never the reference's text.
import type { StyleSheet } from '@/lib/reference/style-sheet';

export interface StoreFacts {
  store_name: string; email: string; phone: string; whatsapp: string; address: string; city: string; state: string; country: string;
  gst: string; shipping_days: string; shipping_charge: string; free_shipping_above: string; cod: boolean;
  return_window_days: string; returns_for: string;      // e.g. "damaged or wrong item only"
  about: string;                                        // 2-3 lines the owner writes about the brand
}
export const EMPTY_FACTS: StoreFacts = { store_name: '', email: '', phone: '', whatsapp: '', address: '', city: '', state: '', country: 'India', gst: '', shipping_days: '5-7', shipping_charge: '', free_shipping_above: '', cod: true, return_window_days: '7', returns_for: 'damaged, defective or wrong items', about: '' };

export const PAGE_KINDS = [
  { handle: 'about-us', kind: 'page', title: 'About us' },
  { handle: 'contact', kind: 'page', title: 'Contact us' },
  { handle: 'faq', kind: 'page', title: 'FAQs' },
  { handle: 'shipping-policy', kind: 'policy', title: 'Shipping policy' },
  { handle: 'refund-policy', kind: 'policy', title: 'Refund policy' },
  { handle: 'privacy-policy', kind: 'policy', title: 'Privacy policy' },
  { handle: 'terms-of-service', kind: 'policy', title: 'Terms of service' },
] as const;
export type PageHandle = typeof PAGE_KINDS[number]['handle'];
export const POLICY_TYPES: Record<string, string> = { 'shipping-policy': 'SHIPPING_POLICY', 'refund-policy': 'REFUND_POLICY', 'privacy-policy': 'PRIVACY_POLICY', 'terms-of-service': 'TERMS_OF_SERVICE' };

export const PAGES_SYSTEM = `You write the standard pages of a new Indian Shopify store, in English, from the FACTS given. Never invent a fact (no made-up days, charges, addresses, phone numbers, registration numbers, awards). Where a fact is missing, write around it without it. Match the TONE described. Keep each page honest, warm and short.
Answer with one JSON object only: {"pages":[{"handle":"about-us","title":"...","body_html":"..."},...]} with exactly these handles: about-us, contact, faq, shipping-policy, refund-policy, privacy-policy, terms-of-service.
body_html: simple HTML only (<h2>, <p>, <ul>, <li>, <strong>, <a href>). Lengths: about-us 120-200 words; contact 60-120 words with the contact details given; faq 6-8 questions (<h2> question, <p> answer) about delivery, payment, returns, sizes/variants, tracking, contact; shipping-policy 150-250 words (processing time, delivery days, charges, free shipping threshold, COD, tracking, delays honestly); refund-policy 150-250 words (what is returnable, window, how to request: email/WhatsApp, refund method and timing in plain terms, exclusions); privacy-policy 200-300 words (what data is collected, why, payment handled by Shopify's payment providers, cookies, contact); terms-of-service 200-300 words (orders, pricing, availability, errors, governing law India).`;

export function pagesPrompt(facts: StoreFacts, style: StyleSheet | null, productTypes: string[]): string {
  return [
    `FACTS:`,
    `Store name: ${facts.store_name}`, `Email: ${facts.email || '(none)'}`, `Phone: ${facts.phone || '(none)'}`, `WhatsApp: ${facts.whatsapp || '(none)'}`,
    `Address: ${[facts.address, facts.city, facts.state, facts.country].filter(Boolean).join(', ') || '(none)'}`, facts.gst ? `GST: ${facts.gst}` : '',
    `Products: ${productTypes.join(', ') || '(various)'}`,
    `Delivery time: ${facts.shipping_days || '(not given)'} days`, `Shipping charge: ${facts.shipping_charge || '(not given)'}`, `Free shipping above: ${facts.free_shipping_above || '(none)'}`,
    `Cash on delivery: ${facts.cod ? 'yes' : 'no'}`, `Return / replacement window: ${facts.return_window_days || '(not given)'} days, for: ${facts.returns_for || '(not given)'}`,
    `About the brand (owner's words): ${facts.about || '(none)'}`,
    '',
    style ? `TONE: ${style.tone}\nHow the reference's shipping policy reads: ${style.policies.shipping}\nHow the reference's refund policy reads: ${style.policies.refund}` : 'TONE: friendly, clear, Indian online store.',
  ].filter(Boolean).join('\n');
}

export interface DraftPage { handle: PageHandle; title: string; body_html: string }

export function cleanHtml(html: string): string {
  let s = String(html || '').replace(/```[a-z]*\n?/gi, '').trim();
  s = s.replace(/<(?!\/?(p|h2|h3|ul|ol|li|strong|em|br|a)\b)[^>]*>/gi, '');
  s = s.replace(/\son\w+="[^"]*"/gi, '').replace(/javascript:/gi, '');
  return s.slice(0, 12000);
}

export function parsePages(text: string): DraftPage[] {
  const raw = text.replace(/```json|```/g, '').trim();
  const start = raw.indexOf('{'), end = raw.lastIndexOf('}');
  if (start < 0) throw new Error('The AI did not answer with pages');
  let j: { pages?: unknown };
  try { j = JSON.parse(raw.slice(start, end + 1)); } catch { throw new Error('The AI answer was not valid JSON'); }
  const out: DraftPage[] = [];
  for (const def of PAGE_KINDS) {
    const p = (Array.isArray(j.pages) ? j.pages : []).find((x: Record<string, unknown>) => x?.handle === def.handle) as Record<string, unknown> | undefined;
    if (!p || typeof p.body_html !== 'string' || p.body_html.trim().length < 40) continue;
    out.push({ handle: def.handle, title: (typeof p.title === 'string' && p.title.trim()) ? p.title.trim().slice(0, 120) : def.title, body_html: cleanHtml(p.body_html) });
  }
  if (out.length < 4) throw new Error('The AI gave too few pages; try again');
  return out;
}

export function cleanFacts(input: unknown): StoreFacts {
  const j = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const s = (k: keyof StoreFacts, max = 200) => (typeof j[k] === 'string' ? (j[k] as string).trim().slice(0, max) : EMPTY_FACTS[k] as string);
  return { ...EMPTY_FACTS, store_name: s('store_name', 80), email: s('email', 120), phone: s('phone', 30), whatsapp: s('whatsapp', 30), address: s('address', 300), city: s('city', 80), state: s('state', 80), country: s('country', 60) || 'India', gst: s('gst', 30), shipping_days: s('shipping_days', 20), shipping_charge: s('shipping_charge', 60), free_shipping_above: s('free_shipping_above', 40), cod: j.cod !== false, return_window_days: s('return_window_days', 10), returns_for: s('returns_for', 160), about: s('about', 1500) };
}

// The menus: main menu from the collections + pages; footer from the policies.
export function menuItems(collections: { handle: string; title: string }[], pageHandles: string[]): { main: { title: string; url: string }[]; footer: { title: string; url: string }[] } {
  const main = [{ title: 'Home', url: '/' }, { title: 'Shop all', url: '/collections/all' }, ...collections.slice(0, 5).map((c) => ({ title: c.title, url: `/collections/${c.handle}` }))];
  if (pageHandles.includes('about-us')) main.push({ title: 'About us', url: '/pages/about-us' });
  if (pageHandles.includes('contact')) main.push({ title: 'Contact', url: '/pages/contact' });
  const footer = [{ title: 'Search', url: '/search' }];
  if (pageHandles.includes('faq')) footer.push({ title: 'FAQs', url: '/pages/faq' });
  for (const [h, t] of [['shipping-policy', 'Shipping policy'], ['refund-policy', 'Refund policy'], ['privacy-policy', 'Privacy policy'], ['terms-of-service', 'Terms of service']]) if (pageHandles.includes(h)) footer.push({ title: t, url: `/policies/${h}` });
  return { main, footer };
}
