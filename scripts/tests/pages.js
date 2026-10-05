// Pages step, pure parts: the AI's page answer, the facts form, the menus, the checklist (no network).
const assert = require('assert');
const { t, done, load } = require('./_load');
const pa = load('lib/pages/pages-ai');
const cl = load('lib/pages/checklist');

const body = (x) => `<p>${x} is a small store that ships across India with care and a smile every single day.</p>`;
const answer = (pages) => JSON.stringify({ pages });

t('parsePages: keeps the 7 known handles, defaults titles, cleans html, refuses short / too few', () => {
  const pages = pa.parsePages('```json\n' + answer([
    { handle: 'about-us', title: '  About Vastora ', body_html: body('Vastora') + '<script>alert(1)</script><div onclick="x()">hi</div><a href="javascript:evil()">l</a>' },
    { handle: 'contact', body_html: body('Contact') },
    { handle: 'faq', body_html: '<p>short</p>' },
    { handle: 'shipping-policy', body_html: body('Ship') },
    { handle: 'refund-policy', body_html: body('Refund') },
    { handle: 'made-up', body_html: body('Nope') },
  ]) + '\n```');
  assert.deepStrictEqual(pages.map((p) => p.handle), ['about-us', 'contact', 'shipping-policy', 'refund-policy'], 'faq too short, made-up dropped, order fixed');
  assert.strictEqual(pages[0].title, 'About Vastora');
  assert.strictEqual(pages[1].title, 'Contact us', 'default title');
  assert.ok(!/script|onclick|javascript:|<div/.test(pages[0].body_html), 'script, handlers, div and javascript: links gone');
  assert.ok(pages[0].body_html.includes('<a href="evil()">') || !pages[0].body_html.includes('javascript'));
  assert.throws(() => pa.parsePages(answer([{ handle: 'about-us', body_html: body('x') }])), /too few/);
  assert.throws(() => pa.parsePages('no json here'), /did not answer/);
  assert.throws(() => pa.parsePages('{ broken'), /not valid JSON/);
});

t('cleanFacts: strings trimmed and capped, cod defaults true, country defaults India', () => {
  const f = pa.cleanFacts({ store_name: '  Vastora ', email: 'a@b.in', phone: 12345, cod: false, country: '', about: 'x'.repeat(2000), ignored: 'y' });
  assert.strictEqual(f.store_name, 'Vastora'); assert.strictEqual(f.email, 'a@b.in'); assert.strictEqual(f.phone, '', 'a number is not a string');
  assert.strictEqual(f.cod, false); assert.strictEqual(f.country, 'India'); assert.strictEqual(f.about.length, 1500);
  assert.strictEqual(f.shipping_days, '5-7', 'defaults kept');
  assert.strictEqual(pa.cleanFacts(null).cod, true);
  assert.strictEqual(pa.cleanFacts(null).ignored, undefined);
});

t('menuItems: main = Home, Shop all, up to 5 collections, About, Contact; footer = Search, FAQ, the policies that exist', () => {
  const cols = Array.from({ length: 7 }, (_, i) => ({ handle: `c${i}`, title: `C${i}` }));
  const m = pa.menuItems(cols, ['about-us', 'faq', 'refund-policy', 'privacy-policy']);
  assert.deepStrictEqual(m.main.map((x) => x.url), ['/', '/collections/all', '/collections/c0', '/collections/c1', '/collections/c2', '/collections/c3', '/collections/c4', '/pages/about-us']);
  assert.deepStrictEqual(m.footer.map((x) => x.url), ['/search', '/pages/faq', '/policies/refund-policy', '/policies/privacy-policy']);
  assert.deepStrictEqual(pa.menuItems([], []).main.length, 2);
});

t('checklist: unique keys, every item has an admin path and a reason; the 4 policy handles map to policy types', () => {
  const keys = cl.CHECKLIST.map((i) => i.key);
  assert.strictEqual(new Set(keys).size, keys.length);
  assert.ok(cl.CHECKLIST.every((i) => i.path.startsWith('/') && i.why.length > 10 && i.title.length > 5));
  assert.ok(keys.includes('payments') && keys.includes('currency') && keys.includes('domain'));
  assert.deepStrictEqual(Object.keys(pa.POLICY_TYPES).sort(), pa.PAGE_KINDS.filter((k) => k.kind === 'policy').map((k) => k.handle).sort());
});

done('pages');
