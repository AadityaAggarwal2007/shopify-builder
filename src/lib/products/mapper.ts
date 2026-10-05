// From the tool's product rows to Shopify's ProductSetInput. Pure, tested in scripts/tests/mapper.js.
import type { ProductSetInput, ProductSetVariant } from '@/lib/shopify/admin';

export interface ProductRow {
  handle: string; title: string; body_html: string; vendor: string; product_type: string; tags: string[]; option_names: string[];
}
export interface VariantRow { options: string[]; sku: string; price: string | number; compare_at: string | number | null }
export interface ImageRow { id: string; path: string; position: number; alt: string }

export function imageUrl(base: string, path: string): string {
  return `${base.replace(/\/$/, '')}/uploads/${path.split('/').map(encodeURIComponent).join('/')}`;
}

function money(v: string | number | null | undefined): string | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : null;
}

export function toProductSetInput(
  p: ProductRow, variants: VariantRow[], images: ImageRow[], baseUrl: string, active: boolean,
): ProductSetInput {
  const names = p.option_names.filter(Boolean);
  const sorted = [...images].sort((a, b) => a.position - b.position);
  const files = sorted.map((im) => ({ originalSource: imageUrl(baseUrl, im.path), alt: im.alt || p.title, contentType: 'IMAGE' as const, filename: im.path.split('/').pop() }));
  const optionValues: Record<string, Set<string>> = {};
  for (const n of names) optionValues[n] = new Set();
  const vs: ProductSetVariant[] = (variants.length ? variants : [{ options: [], sku: '', price: 0, compare_at: null }]).map((v) => {
    const ov = names.length
      ? names.map((n, k) => { const val = (v.options[k] || '').trim() || '-'; optionValues[n].add(val); return { optionName: n, name: val }; })
      : [{ optionName: 'Title', name: 'Default Title' }];
    const out: ProductSetVariant = { optionValues: ov, price: money(v.price) || '0.00', sku: v.sku || undefined };
    const cmp = money(v.compare_at);
    if (cmp && Number(cmp) > Number(out.price)) out.compareAtPrice = cmp;
    return out;
  });
  const productOptions = names.length
    ? names.map((n, i) => ({ name: n, position: i + 1, values: Array.from(optionValues[n]).map((name) => ({ name })) }))
    : [{ name: 'Title', position: 1, values: [{ name: 'Default Title' }] }];
  return {
    handle: p.handle, title: p.title, descriptionHtml: p.body_html || '', vendor: p.vendor || undefined, productType: p.product_type || undefined,
    tags: p.tags.length ? p.tags : undefined, status: active ? 'ACTIVE' : 'DRAFT', productOptions, variants: vs, files: files.length ? files : undefined,
  };
}

// Collections the tool proposes from the products: one per Type, one per Tag used by 2+ products.
export interface ProposedCollection { handle: string; title: string; rule_kind: 'type' | 'tag'; rule_value: string; count: number }
export function proposeCollections(products: { product_type: string; tags: string[] }[]): ProposedCollection[] {
  const types = new Map<string, number>(), tags = new Map<string, number>();
  for (const p of products) {
    const t = p.product_type.trim();
    if (t) types.set(t, (types.get(t) || 0) + 1);
    for (const g of new Set(p.tags.map((x) => x.trim()).filter(Boolean))) tags.set(g, (tags.get(g) || 0) + 1);
  }
  const out: ProposedCollection[] = [];
  const seen = new Set<string>();
  const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  for (const [t, n] of Array.from(types).sort((a, b) => b[1] - a[1])) { const h = slug(t); if (h && !seen.has(h)) { seen.add(h); out.push({ handle: h, title: t, rule_kind: 'type', rule_value: t, count: n }); } }
  for (const [g, n] of Array.from(tags).sort((a, b) => b[1] - a[1])) { if (n < 2) continue; const h = slug(g); if (h && !seen.has(h)) { seen.add(h); out.push({ handle: h, title: g, rule_kind: 'tag', rule_value: g, count: n }); } }
  return out;
}
