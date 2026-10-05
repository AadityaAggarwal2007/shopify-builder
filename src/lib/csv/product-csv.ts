// Shopify's own product CSV (Admin > Products > Export), read into products with variants and
// image links. Pure: no database, no network. Rules:
//   - rows share a Handle: the first row carries the product fields, every row may carry a variant
//     (Option1 Value set) and / or an image (Image Src set);
//   - a product with no option values gets one variant "Default Title";
//   - Published / Status decide ACTIVE vs DRAFT (Status wins);
//   - at most MAX_VARIANTS variants and MAX_IMAGES image links per product (the rest are reported);
//   - every problem is reported with the row number (1 = the first data row) and never thrown.
import Papa from 'papaparse';

export const MAX_VARIANTS = 100;
export const MAX_IMAGES = 20;
export const MAX_PRODUCTS = 2000;

export interface CsvVariant { options: string[]; sku: string; price: number; compareAt: number | null; imageSrc: string | null }
export interface CsvImage { src: string; position: number; alt: string }
export interface CsvProduct {
  handle: string; title: string; bodyHtml: string; vendor: string; productType: string; tags: string[];
  optionNames: string[]; variants: CsvVariant[]; images: CsvImage[]; active: boolean;
}
export interface CsvProblem { row: number; handle: string; message: string }
export interface CsvResult { products: CsvProduct[]; problems: CsvProblem[]; rows: number; columns: string[] }

const REQUIRED = ['Handle', 'Title'];

// Header names vary a little between exports ("Variant Price" vs "Variant price"): match loosely.
function pick(row: Record<string, string>, ...names: string[]): string {
  for (const n of names) {
    const key = Object.keys(row).find((k) => k.trim().toLowerCase() === n.toLowerCase());
    if (key !== undefined) return (row[key] ?? '').toString().trim();
  }
  return '';
}

export function slugify(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

function money(s: string): number | null {
  const digits = String(s).replace(/[^0-9.]/g, '');
  if (!/[0-9]/.test(digits)) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

export function parseProductCsv(text: string): CsvResult {
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: 'greedy' });
  const columns = (parsed.meta.fields || []).map((f) => f.trim());
  const problems: CsvProblem[] = [];
  const missing = REQUIRED.filter((r) => !columns.some((c) => c.toLowerCase() === r.toLowerCase()));
  if (missing.length) {
    problems.push({ row: 0, handle: '', message: `Missing columns: ${missing.join(', ')}. Export the products from Shopify (Products > Export) and upload that file.` });
    return { products: [], problems, rows: parsed.data.length, columns };
  }

  const byHandle = new Map<string, CsvProduct>();
  const order: string[] = [];
  parsed.data.forEach((row, i) => {
    const rowNo = i + 1;
    let handle = pick(row, 'Handle');
    const title = pick(row, 'Title');
    if (!handle && title) handle = slugify(title);
    if (!handle) {
      if (Object.values(row).some((v) => (v || '').trim())) problems.push({ row: rowNo, handle: '', message: 'No Handle (and no Title to make one from); row skipped' });
      return;
    }
    handle = slugify(handle) || handle;
    let p = byHandle.get(handle);
    if (!p) {
      if (!title) { problems.push({ row: rowNo, handle, message: 'First row of this handle has no Title; product skipped' }); return; }
      if (byHandle.size >= MAX_PRODUCTS) { problems.push({ row: rowNo, handle, message: `More than ${MAX_PRODUCTS} products; the rest are skipped` }); return; }
      const status = pick(row, 'Status').toLowerCase();
      const published = pick(row, 'Published').toLowerCase();
      p = {
        handle, title, bodyHtml: pick(row, 'Body (HTML)', 'Body HTML', 'Body'), vendor: pick(row, 'Vendor'),
        productType: pick(row, 'Type', 'Product Type', 'Product Category'), tags: pick(row, 'Tags').split(',').map((t) => t.trim()).filter(Boolean),
        optionNames: [], variants: [], images: [],
        active: status ? status === 'active' : published !== 'false',
      };
      for (const n of [1, 2, 3]) {
        const name = pick(row, `Option${n} Name`);
        if (name && name.toLowerCase() !== 'title') p.optionNames.push(name);
      }
      byHandle.set(handle, p);
      order.push(handle);
    }

    // Variant on this row?
    const values = [1, 2, 3].map((n) => pick(row, `Option${n} Value`)).slice(0, Math.max(1, p.optionNames.length));
    const priceText = pick(row, 'Variant Price');
    const hasVariant = values.some(Boolean) || !!priceText || !!pick(row, 'Variant SKU');
    if (hasVariant) {
      const price = money(priceText);
      if (p.variants.length >= MAX_VARIANTS) {
        problems.push({ row: rowNo, handle, message: `More than ${MAX_VARIANTS} variants; this one is skipped` });
      } else if (price === null) {
        problems.push({ row: rowNo, handle, message: 'Variant Price is missing or not a number; variant skipped' });
      } else {
        const options = p.optionNames.length ? p.optionNames.map((_, k) => values[k] || '') : ['Default Title'];
        if (p.optionNames.length && options.some((o) => !o)) {
          problems.push({ row: rowNo, handle, message: `A variant is missing a value for ${p.optionNames.filter((_, k) => !options[k]).join(' / ')}; variant skipped` });
        } else if (p.variants.some((v) => v.options.join('\u0001') === options.join('\u0001'))) {
          problems.push({ row: rowNo, handle, message: `Duplicate variant ${options.join(' / ')}; skipped` });
        } else {
          const vimg = pick(row, 'Variant Image');
          p.variants.push({ options, sku: pick(row, 'Variant SKU'), price, compareAt: money(pick(row, 'Variant Compare At Price')), imageSrc: /^https?:\/\//i.test(vimg) ? vimg : null });
        }
      }
    }

    // Image link on this row?
    const src = pick(row, 'Image Src');
    if (src) {
      if (!/^https?:\/\//i.test(src)) problems.push({ row: rowNo, handle, message: 'Image Src is not a link; ignored' });
      else if (p.images.some((im) => im.src === src)) { /* same link twice: fine */ }
      else if (p.images.length >= MAX_IMAGES) problems.push({ row: rowNo, handle, message: `More than ${MAX_IMAGES} images; this link is ignored` });
      else {
        const pos = Number(pick(row, 'Image Position')) || p.images.length + 1;
        p.images.push({ src, position: pos, alt: pick(row, 'Image Alt Text') });
      }
    }
  });

  const products = order.map((h) => byHandle.get(h)!).map((p) => {
    if (!p.variants.length) p.variants.push({ options: p.optionNames.length ? p.optionNames.map(() => '') : ['Default Title'], sku: '', price: 0, compareAt: null, imageSrc: null });
    if (p.optionNames.length && p.variants.some((v) => v.options.some((o) => !o))) {
      problems.push({ row: 0, handle: p.handle, message: 'No usable variant; a single variant at price 0 was made: fix the price in the grid' });
      p.optionNames = []; p.variants = [{ options: ['Default Title'], sku: '', price: 0, compareAt: null, imageSrc: null }];
    }
    p.images.sort((a, b) => a.position - b.position);
    return p;
  });
  return { products, problems, rows: parsed.data.length, columns };
}
