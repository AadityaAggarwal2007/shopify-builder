// The Admin API calls the tool makes, as small typed functions over shopifyGraphql.
import { assertNoUserErrors, shopifyGraphql, type ClientOptions, type StoreAuth } from './client';

export interface ShopInfo { name: string; myshopifyDomain: string; primaryDomain: string; currency: string; email: string; plan: string }

export async function getShop(store: StoreAuth, opts?: ClientOptions): Promise<ShopInfo> {
  const r = await shopifyGraphql<{ shop: { name: string; myshopifyDomain: string; primaryDomain: { host: string }; currencyCode: string; email: string; plan: { displayName: string } } }>(store, `
    query BuilderShop { shop { name myshopifyDomain primaryDomain { host } currencyCode email plan { displayName } } }`, {}, opts);
  const s = r.data.shop;
  return { name: s.name, myshopifyDomain: s.myshopifyDomain, primaryDomain: s.primaryDomain?.host || '', currency: s.currencyCode, email: s.email || '', plan: s.plan?.displayName || '' };
}

// The Online Store sales channel's publication: products and collections made by the API are hidden
// until published to it (publishablePublish).
export async function onlineStorePublicationId(store: StoreAuth, opts?: ClientOptions): Promise<string | null> {
  const r = await shopifyGraphql<{ publications: { nodes: { id: string; name: string; app?: { handle?: string } | null }[] } }>(store, `
    query BuilderPublications { publications(first: 25) { nodes { id name app { handle } } } }`, {}, opts);
  const nodes = r.data.publications?.nodes || [];
  const hit = nodes.find((n) => n.app?.handle === 'online_store') || nodes.find((n) => /online store/i.test(n.name));
  return hit?.id || null;
}

export interface ProductSetFile { originalSource: string; alt?: string; contentType: 'IMAGE'; filename?: string }
export interface ProductSetVariant { optionValues: { optionName: string; name: string }[]; price: string; compareAtPrice?: string | null; sku?: string; file?: ProductSetFile }
export interface ProductSetInput {
  handle: string; title: string; descriptionHtml: string; vendor?: string; productType?: string; tags?: string[];
  status: 'ACTIVE' | 'DRAFT';
  productOptions?: { name: string; position: number; values: { name: string }[] }[];
  variants: ProductSetVariant[];
  files?: ProductSetFile[];
}

export interface ProductSetResult { id: string; handle: string; variantIds: string[] }

// Upsert by handle (productSet identifier, 2025-04+). Synchronous for up to 100 variants, which is
// every product this tool makes (the CSV reader caps them).
export async function productSet(store: StoreAuth, input: ProductSetInput, opts?: ClientOptions): Promise<ProductSetResult> {
  const r = await shopifyGraphql<{ productSet: { product: { id: string; handle: string; variants: { nodes: { id: string }[] } } | null; userErrors: { field: string[]; message: string }[] } }>(store, `
    mutation BuilderProductSet($input: ProductSetInput!, $identifier: ProductSetIdentifiers!) {
      productSet(input: $input, identifier: $identifier, synchronous: true) {
        product { id handle variants(first: 100) { nodes { id } } }
        userErrors { field message }
      }
    }`, { input, identifier: { handle: input.handle } }, opts);
  assertNoUserErrors(`productSet ${input.handle}`, r.data.productSet.userErrors);
  const p = r.data.productSet.product;
  if (!p) throw new Error(`productSet ${input.handle}: no product returned`);
  return { id: p.id, handle: p.handle, variantIds: p.variants.nodes.map((v) => v.id) };
}

export async function publishToOnlineStore(store: StoreAuth, ids: string[], publicationId: string, opts?: ClientOptions): Promise<void> {
  // publishablePublish takes one id; batch them in one request with aliases (10 at a time).
  for (let i = 0; i < ids.length; i += 10) {
    const batch = ids.slice(i, i + 10);
    const parts = batch.map((_, j) => `p${j}: publishablePublish(id: $id${j}, input: [{ publicationId: $pub }]) { userErrors { field message } }`);
    const vars: Record<string, unknown> = { pub: publicationId };
    const decl = batch.map((_, j) => `$id${j}: ID!`).join(', ');
    batch.forEach((id, j) => { vars[`id${j}`] = id; });
    const r = await shopifyGraphql<Record<string, { userErrors: { field: string[]; message: string }[] }>>(store, `
      mutation BuilderPublish($pub: ID!, ${decl}) { ${parts.join('\n')} }`, vars, opts);
    for (const key of Object.keys(r.data)) assertNoUserErrors(`publish ${key}`, r.data[key].userErrors);
  }
}

export interface CollectionInput { handle: string; title: string; rule?: { column: 'TYPE' | 'TAG' | 'VENDOR'; condition: string } }

// Find a collection by handle, create it when missing (the rule set is the legacy input; it is still
// accepted by 2026-01, see the plan). Returns the collection id.
export async function ensureCollection(store: StoreAuth, input: CollectionInput, opts?: ClientOptions): Promise<{ id: string; created: boolean }> {
  const found = await shopifyGraphql<{ collectionByHandle: { id: string } | null }>(store, `
    query BuilderCollection($handle: String!) { collectionByHandle(handle: $handle) { id } }`, { handle: input.handle }, opts);
  if (found.data.collectionByHandle?.id) return { id: found.data.collectionByHandle.id, created: false };
  const body: Record<string, unknown> = { handle: input.handle, title: input.title };
  if (input.rule) body.ruleSet = { appliedDisjunctively: false, rules: [{ column: input.rule.column, relation: 'EQUALS', condition: input.rule.condition }] };
  const r = await shopifyGraphql<{ collectionCreate: { collection: { id: string } | null; userErrors: { field: string[]; message: string }[] } }>(store, `
    mutation BuilderCollectionCreate($input: CollectionInput!) {
      collectionCreate(input: $input) { collection { id } userErrors { field message } }
    }`, { input: body }, opts);
  assertNoUserErrors(`collectionCreate ${input.handle}`, r.data.collectionCreate.userErrors);
  const id = r.data.collectionCreate.collection?.id;
  if (!id) throw new Error(`collectionCreate ${input.handle}: no id returned`);
  return { id, created: true };
}

// Manual collection: add products that are not in it yet (duplicates are a userError, so check first).
export async function addProductsToCollection(store: StoreAuth, collectionId: string, productIds: string[], opts?: ClientOptions): Promise<void> {
  if (!productIds.length) return;
  const r = await shopifyGraphql<{ collectionAddProducts: { userErrors: { field: string[]; message: string }[] } }>(store, `
    mutation BuilderCollectionAdd($id: ID!, $productIds: [ID!]!) {
      collectionAddProducts(id: $id, productIds: $productIds) { userErrors { field message } }
    }`, { id: collectionId, productIds }, opts);
  const errs = (r.data.collectionAddProducts.userErrors || []).filter((e) => !/already/i.test(e.message));
  assertNoUserErrors(`collectionAddProducts`, errs);
}

// ── Files and themes (part 2) ────────────────────────────────
export interface FileCreated { id: string; filename: string; url: string | null; status: string }

// Upload a public image URL into Content > Files under a fixed filename (REPLACE: the same name
// again overwrites, so settings that point at it stay valid). Returns once Shopify reports it ready
// (polls up to ~20 s), with the file's CDN url when known.
export async function fileCreateFromUrl(store: StoreAuth, originalSource: string, filename: string, alt: string, opts?: ClientOptions): Promise<FileCreated> {
  const r = await shopifyGraphql<{ fileCreate: { files: { id: string; fileStatus: string; alt: string | null }[]; userErrors: { field: string[]; message: string }[] } }>(store, `
    mutation BuilderFileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) { files { id fileStatus alt } userErrors { field message } }
    }`, { files: [{ originalSource, contentType: 'IMAGE', alt, filename, duplicateResolutionMode: 'REPLACE' }] }, opts);
  assertNoUserErrors(`fileCreate ${filename}`, r.data.fileCreate.userErrors);
  const f = r.data.fileCreate.files[0];
  if (!f) throw new Error(`fileCreate ${filename}: nothing returned`);
  let status = f.fileStatus, url: string | null = null;
  for (let i = 0; i < 10 && status !== 'READY' && status !== 'FAILED'; i++) {
    await new Promise((res) => setTimeout(res, 2000));
    const q = await shopifyGraphql<{ node: { fileStatus: string; image?: { url: string } | null } | null }>(store, `
      query BuilderFile($id: ID!) { node(id: $id) { ... on MediaImage { fileStatus image { url } } } }`, { id: f.id }, opts);
    status = q.data.node?.fileStatus || status; url = q.data.node?.image?.url || null;
  }
  if (status === 'FAILED') throw new Error(`Shopify could not process the image ${filename}`);
  return { id: f.id, filename, url, status };
}

export interface ThemeInfo { id: string; name: string; role: string; processing: boolean }

export async function listThemes(store: StoreAuth, opts?: ClientOptions): Promise<ThemeInfo[]> {
  const r = await shopifyGraphql<{ themes: { nodes: { id: string; name: string; role: string; processing: boolean }[] } }>(store, `
    query BuilderThemes { themes(first: 30) { nodes { id name role processing } } }`, {}, opts);
  return r.data.themes.nodes;
}

// Create an unpublished theme from a public zip URL. Shopify unpacks it in the background.
export async function themeCreateFromUrl(store: StoreAuth, zipUrl: string, name: string, opts?: ClientOptions): Promise<ThemeInfo> {
  const r = await shopifyGraphql<{ themeCreate: { theme: { id: string; name: string; role: string; processing: boolean } | null; userErrors: { field: string[]; message: string }[] } }>(store, `
    mutation BuilderThemeCreate($source: URL!, $name: String!) {
      themeCreate(source: $source, name: $name, role: UNPUBLISHED) { theme { id name role processing } userErrors { field message } }
    }`, { source: zipUrl, name }, opts);
  assertNoUserErrors('themeCreate', r.data.themeCreate.userErrors);
  const t = r.data.themeCreate.theme;
  if (!t) throw new Error('themeCreate returned no theme');
  return t;
}

export async function themeStatus(store: StoreAuth, themeId: string, opts?: ClientOptions): Promise<ThemeInfo | null> {
  const r = await shopifyGraphql<{ theme: { id: string; name: string; role: string; processing: boolean } | null }>(store, `
    query BuilderTheme($id: ID!) { theme(id: $id) { id name role processing } }`, { id: themeId }, opts);
  return r.data.theme;
}

export async function themePublish(store: StoreAuth, themeId: string, opts?: ClientOptions): Promise<void> {
  const r = await shopifyGraphql<{ themePublish: { theme: { id: string } | null; userErrors: { field: string[]; message: string }[] } }>(store, `
    mutation BuilderThemePublish($id: ID!) { themePublish(id: $id) { theme { id } userErrors { field message } } }`, { id: themeId }, opts);
  assertNoUserErrors('themePublish', r.data.themePublish.userErrors);
}
