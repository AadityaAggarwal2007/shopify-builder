// The GraphQL client's retry / throttle behaviour with a fake fetch (src/lib/shopify/client.ts).
const assert = require('assert');
const { load, ta, done } = require('./_load');
const c = load('lib/shopify/client');

const store = { shopDomain: 'test.myshopify.com', token: 'shpat_x' };
const res = (status, body, headers = {}) => ({ status, headers: { get: (k) => headers[k.toLowerCase()] ?? null }, text: async () => typeof body === 'string' ? body : JSON.stringify(body) });
const fake = (answers) => { const calls = []; const f = async (url, init) => { calls.push({ url, init }); const a = answers.shift(); return typeof a === 'function' ? a() : a; }; return { f, calls }; };
const sleeps = []; const sleep = async (ms) => { sleeps.push(ms); };

(async () => {
  await ta('a 200 with data: one call, token header, API version in the URL', async () => {
    const { f, calls } = fake([res(200, { data: { shop: { name: 'X' } }, extensions: { cost: { requestedQueryCost: 1, throttleStatus: { maximumAvailable: 2000, currentlyAvailable: 1999, restoreRate: 100 } } } })]);
    const r = await c.shopifyGraphql(store, 'query { shop { name } }', {}, { fetch: f, sleep });
    assert.deepStrictEqual(r.data, { shop: { name: 'X' } });
    assert.strictEqual(r.cost.currentlyAvailable, 1999);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].url, `https://test.myshopify.com/admin/api/${c.API_VERSION}/graphql.json`);
    assert.strictEqual(calls[0].init.headers['X-Shopify-Access-Token'], 'shpat_x');
  });

  await ta('THROTTLED (HTTP 200): waits for the points and retries, then succeeds', async () => {
    sleeps.length = 0;
    const { f, calls } = fake([
      res(200, { errors: [{ message: 'Throttled', extensions: { code: 'THROTTLED' } }], extensions: { cost: { requestedQueryCost: 50, throttleStatus: { maximumAvailable: 2000, currentlyAvailable: 10, restoreRate: 100 } } } }),
      res(200, { data: { ok: true } }),
    ]);
    const r = await c.shopifyGraphql(store, 'mutation {}', {}, { fetch: f, sleep });
    assert.deepStrictEqual(r.data, { ok: true });
    assert.strictEqual(calls.length, 2);
    assert.strictEqual(sleeps[0], 400, 'waits (50-10)/100 s'); // waitForPoints
  });

  await ta('429 and 5xx retry up to the limit, then the last error is thrown', async () => {
    const { f, calls } = fake([res(429, 'slow down', { 'retry-after': '1' }), res(502, 'bad gateway'), res(503, 'down'), res(500, 'boom')]);
    await assert.rejects(c.shopifyGraphql(store, 'q', {}, { fetch: f, sleep, retries: 3 }), (e) => e instanceof c.ShopifyError && /500/.test(e.message));
    assert.strictEqual(calls.length, 4);
  });

  await ta('401 / 403 never retry and say what to do', async () => {
    const { f, calls } = fake([res(401, 'nope')]);
    await assert.rejects(c.shopifyGraphql(store, 'q', {}, { fetch: f, sleep }), (e) => e.kind === 'access' && /Reconnect/.test(e.message));
    assert.strictEqual(calls.length, 1);
  });

  await ta('ACCESS_DENIED inside a 200 = access error; other GraphQL errors = graphql error, no retry', async () => {
    const a = fake([res(200, { errors: [{ message: 'Access denied for themeFilesUpsert', extensions: { code: 'ACCESS_DENIED' } }] })]);
    await assert.rejects(c.shopifyGraphql(store, 'q', {}, { fetch: a.f, sleep }), (e) => e.kind === 'access');
    const b = fake([res(200, { errors: [{ message: 'Field x does not exist' }] })]);
    await assert.rejects(c.shopifyGraphql(store, 'q', {}, { fetch: b.f, sleep }), (e) => e.kind === 'graphql' && /Field x/.test(e.message));
    assert.strictEqual(b.calls.length, 1);
  });

  await ta('userErrors become one readable error; empty list passes', async () => {
    assert.doesNotThrow(() => c.assertNoUserErrors('x', []));
    assert.throws(() => c.assertNoUserErrors('productSet red', [{ field: ['input', 'title'], message: "can't be blank" }]), /productSet red: input.title: can't be blank/);
  });

  await ta('network failure retries', async () => {
    const { f, calls } = fake([() => { throw new Error('ECONNRESET'); }, res(200, { data: { ok: 1 } })]);
    const r = await c.shopifyGraphql(store, 'q', {}, { fetch: f, sleep });
    assert.strictEqual(r.data.ok, 1); assert.strictEqual(calls.length, 2);
  });

  done('client');
})().catch((e) => { console.error(e); process.exit(1); });
