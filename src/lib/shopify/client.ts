// GraphQL Admin API client. One function, `shopifyGraphql`, with the rate-limit handling Shopify
// asks for: read extensions.cost.throttleStatus, wait when the bucket is low, retry on THROTTLED
// (HTTP 200 with errors[].extensions.code) and on 429 / 5xx, up to RETRIES times with jitter.
// `fetch` is injectable so the tests run with a fake.

export const API_VERSION = process.env.SHOPIFY_API_VERSION || '2026-01';
const RETRIES = 3;

export interface StoreAuth { shopDomain: string; token: string }

export interface GraphqlError { message: string; extensions?: { code?: string; [k: string]: unknown }; path?: (string | number)[] }
export interface ThrottleStatus { maximumAvailable: number; currentlyAvailable: number; restoreRate: number }
export interface GraphqlResult<T> { data: T; cost?: ThrottleStatus; requestedCost?: number }

export class ShopifyError extends Error {
  constructor(message: string, public kind: 'http' | 'graphql' | 'user' | 'throttled' | 'access', public details?: unknown, public status?: number) {
    super(message);
    this.name = 'ShopifyError';
  }
}

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ status: number; headers: { get(name: string): string | null }; text(): Promise<string> }>;
export type SleepLike = (ms: number) => Promise<void>;

const realSleep: SleepLike = (ms) => new Promise((r) => setTimeout(r, ms));

export interface ClientOptions { fetch?: FetchLike; sleep?: SleepLike; retries?: number }

export function endpoint(shopDomain: string): string {
  return `https://${shopDomain}/admin/api/${API_VERSION}/graphql.json`;
}

// Rough: the bucket refills at restoreRate points per second.
export function waitForPoints(status: ThrottleStatus | undefined, needed: number): number {
  if (!status || status.currentlyAvailable >= needed) return 0;
  const rate = status.restoreRate > 0 ? status.restoreRate : 50;
  return Math.ceil(((needed - status.currentlyAvailable) / rate) * 1000);
}

export async function shopifyGraphql<T = Record<string, unknown>>(
  store: StoreAuth,
  queryText: string,
  variables: Record<string, unknown> = {},
  opts: ClientOptions = {},
): Promise<GraphqlResult<T>> {
  const doFetch = opts.fetch || (globalThis.fetch as unknown as FetchLike);
  const sleep = opts.sleep || realSleep;
  const retries = opts.retries ?? RETRIES;
  let lastErr: ShopifyError | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(Math.min(8000, 500 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 250));
    let res: Awaited<ReturnType<FetchLike>>;
    try {
      res = await doFetch(endpoint(store.shopDomain), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': store.token },
        body: JSON.stringify({ query: queryText, variables }),
      });
    } catch (err) {
      lastErr = new ShopifyError(`Could not reach Shopify: ${(err as Error).message}`, 'http');
      continue;
    }

    const text = await res.text();
    if (res.status === 429 || res.status >= 500) {
      const retryAfter = Number(res.headers.get('retry-after') || 0);
      lastErr = new ShopifyError(`Shopify answered ${res.status}`, res.status === 429 ? 'throttled' : 'http', text.slice(0, 500), res.status);
      if (retryAfter > 0) await sleep(Math.min(10_000, retryAfter * 1000));
      continue;
    }
    if (res.status === 401 || res.status === 403) {
      throw new ShopifyError(res.status === 401 ? 'Shopify refused the access token (401). Reconnect the store.' : 'Shopify refused this action (403): the app lacks a scope or an exemption.', 'access', text.slice(0, 500), res.status);
    }
    if (res.status !== 200) {
      throw new ShopifyError(`Shopify answered ${res.status}: ${text.slice(0, 300)}`, 'http', text.slice(0, 500), res.status);
    }

    let json: { data?: T; errors?: GraphqlError[]; extensions?: { cost?: { requestedQueryCost?: number; throttleStatus?: ThrottleStatus } } };
    try {
      json = JSON.parse(text);
    } catch {
      throw new ShopifyError('Shopify sent something that is not JSON', 'http', text.slice(0, 300), 200);
    }
    const cost = json.extensions?.cost?.throttleStatus;
    const errors = json.errors || [];
    if (errors.length) {
      const throttled = errors.some((e) => e.extensions?.code === 'THROTTLED');
      if (throttled) {
        lastErr = new ShopifyError('Shopify rate limit (THROTTLED)', 'throttled', errors);
        await sleep(waitForPoints(cost, json.extensions?.cost?.requestedQueryCost || 100) || 1000);
        continue;
      }
      const denied = errors.some((e) => e.extensions?.code === 'ACCESS_DENIED');
      throw new ShopifyError(
        denied ? `Access denied: ${errors[0].message}` : errors.map((e) => e.message).join('; '),
        denied ? 'access' : 'graphql', errors, 200,
      );
    }
    if (!json.data) throw new ShopifyError('Shopify sent no data', 'graphql', json, 200);
    return { data: json.data, cost, requestedCost: json.extensions?.cost?.requestedQueryCost };
  }
  throw lastErr || new ShopifyError('Shopify did not answer', 'http');
}

// Mutations answer `{ userErrors: [{field, message}] }`: turn a non-empty list into one error.
export function assertNoUserErrors(where: string, errs: { field?: (string | null)[] | null; message: string }[] | null | undefined): void {
  if (!errs || !errs.length) return;
  const text = errs.map((e) => `${(e.field || []).filter(Boolean).join('.') || '-'}: ${e.message}`).join('; ');
  throw new ShopifyError(`${where}: ${text}`, 'user', errs);
}

// gid://shopify/Product/123 -> 123
export const gidNumber = (gid: string | null | undefined): string => (gid || '').split('/').pop() || '';
