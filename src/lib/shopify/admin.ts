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
