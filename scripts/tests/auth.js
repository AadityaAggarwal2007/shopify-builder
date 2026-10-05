// Login tokens, the env login, the store-token encryption and the OAuth helpers.
const assert = require('assert');
const { load, t, done } = require('./_load');
process.env.AUTH_TOKEN_SECRET = 'x'.repeat(40);
process.env.ADMIN_USERNAME = 'jatin';
process.env.ADMIN_PASSWORD = 'correct horse';
process.env.BUILDER_DATA_KEY = Buffer.alloc(32, 7).toString('base64');
const auth = load('lib/auth');
const crypto = load('lib/crypto');
const oauth = load('lib/shopify/oauth');

t('login: right pair only, constant-time compare, token round trip', () => {
  assert.strictEqual(auth.checkLogin('nobody', 'correct horse'), null);
  assert.strictEqual(auth.checkLogin('jatin', 'wrong'), null);
  assert.deepStrictEqual(auth.checkLogin(' jatin ', 'correct horse'), { username: 'jatin' });
  const tok = auth.generateToken('jatin');
  assert.deepStrictEqual(auth.verifyToken(tok), { username: 'jatin' });
  assert.strictEqual(auth.verifyToken(tok + 'x'), null, 'tampered signature');
  assert.strictEqual(auth.verifyToken(tok, Date.now() + 8 * 86400_000), null, 'expired after 7 days');
  const header = { headers: { get: (k) => (k === 'authorization' ? `Bearer ${tok}` : null) } };
  assert.deepStrictEqual(auth.getAuthFromRequest(header), { username: 'jatin' });
});

t('a token for another username, or with the secret missing, is refused', () => {
  const old = process.env.ADMIN_USERNAME;
  const tok = auth.generateToken('jatin');
  process.env.ADMIN_USERNAME = 'someone-else';
  assert.strictEqual(auth.verifyToken(tok), null);
  process.env.ADMIN_USERNAME = old;
  const s = process.env.AUTH_TOKEN_SECRET; process.env.AUTH_TOKEN_SECRET = 'short';
  assert.throws(() => auth.generateToken('jatin'), /AUTH_TOKEN_SECRET/);
  assert.strictEqual(auth.verifyToken(tok), null);
  process.env.AUTH_TOKEN_SECRET = s;
});

t('store token: sealed blob opens only with its own AAD; no key = fail closed', () => {
  assert.ok(crypto.cryptoReady());
  const blob = crypto.seal('shpat_secret', crypto.storeTokenAad('a.myshopify.com'));
  assert.ok(blob.startsWith('v1.') && !blob.includes('shpat_secret'));
  assert.strictEqual(crypto.open(blob, crypto.storeTokenAad('a.myshopify.com')), 'shpat_secret');
  assert.throws(() => crypto.open(blob, crypto.storeTokenAad('b.myshopify.com')), (e) => e.code === 'auth_failed');
  assert.throws(() => crypto.open('garbage', 'x'), (e) => e.code === 'bad_blob');
  const k = process.env.BUILDER_DATA_KEY; process.env.BUILDER_DATA_KEY = '';
  assert.strictEqual(crypto.cryptoReady(), false);
  assert.throws(() => crypto.seal('x', 'y'), (e) => e.code === 'no_key');
  process.env.BUILDER_DATA_KEY = k;
});

t('normalizeShop accepts every way of writing a store', () => {
  for (const [inp, want] of [
    ['https://admin.shopify.com/store/rzqjxj-qq/products', 'rzqjxj-qq.myshopify.com'],
    ['https://roopvastra.myshopify.com/', 'roopvastra.myshopify.com'],
    ['Roopvastra.MYSHOPIFY.com', 'roopvastra.myshopify.com'],
    ['roopvastra', 'roopvastra.myshopify.com'],
    ['vastora.in', null], ['', null], ['a b', null],
  ]) assert.strictEqual(oauth.normalizeShop(inp), want, inp);
});

t('callback HMAC and the one-time state', () => {
  const secret = 'shhh';
  // Real shape: host is base64 and ends with '=' (raw in the signed message), timestamp, code, state.
  const params = new URLSearchParams({ code: 'c', host: 'YWRtaW4uc2hvcGlmeS5jb20vc3RvcmUveA==', shop: 'x.myshopify.com', state: 's', timestamp: '1' });
  assert.strictEqual(oauth.callbackMessage(params), 'code=c&host=YWRtaW4uc2hvcGlmeS5jb20vc3RvcmUveA==&shop=x.myshopify.com&state=s&timestamp=1');
  const hmac = require('crypto').createHmac('sha256', secret).update(oauth.callbackMessage(params)).digest('hex');
  params.set('hmac', hmac);
  assert.strictEqual(oauth.verifyCallbackHmac(params, secret), true);
  params.set('hmac', hmac.replace(/^./, (ch) => (ch === 'a' ? 'b' : 'a')));
  assert.strictEqual(oauth.verifyCallbackHmac(params, secret), false);
  const st = oauth.newState('x.myshopify.com');
  assert.strictEqual(oauth.takeState(st, 'y.myshopify.com'), false, 'another shop');
  assert.strictEqual(oauth.takeState(st, 'x.myshopify.com'), false, 'used up by the wrong-shop try');
  const st2 = oauth.newState('x.myshopify.com');
  assert.strictEqual(oauth.takeState(st2, 'x.myshopify.com'), true);
  assert.strictEqual(oauth.takeState(st2, 'x.myshopify.com'), false, 'one use only');
  assert.ok(oauth.authorizeUrl('x.myshopify.com', 'cid', 'https://b/cb', 'st').includes('scope=' + encodeURIComponent(oauth.SCOPES.join(','))));
});

done('auth');
