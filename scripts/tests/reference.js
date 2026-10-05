// The reference reader's HTML / CSS parsing and the style sheet's strict parse (no network).
const assert = require('assert');
const { load, t, done } = require('./_load');
const rs = load('lib/reference/read-site');
const ss = load('lib/reference/style-sheet');

t('normalizeUrl: adds https, refuses junk and private hosts', () => {
  assert.strictEqual(rs.normalizeUrl('example.com/path#x'), 'https://example.com/path');
  assert.strictEqual(rs.normalizeUrl('http://shop.example.in'), 'http://shop.example.in/');
  assert.strictEqual(rs.normalizeUrl('localhost:3001'), null);
  assert.strictEqual(rs.normalizeUrl('192.168.1.5'), null);
  assert.strictEqual(rs.normalizeUrl('not a url'), null);
});

t('parseHtml: title, nav, headings, Shopify section types, stylesheets, policy links', () => {
  const html = `<html><head><title>Glow &amp; Co</title><meta name="description" content="Pretty things"><link rel="stylesheet" href="/cdn/theme.css"><style>.a{color:#ff0000}</style></head>
  <body><header><nav><a href="/">Home</a><a href="/collections/all">Shop</a><a href="/pages/about">About</a><a href="/collections/all">Shop</a></nav></header>
  <main><div id="shopify-section-template--1__image_banner"><h1>Welcome</h1></div><div id="shopify-section-template--1__featured_collection_abc123"><h2>Best sellers</h2></div><div id="shopify-section-footer"></div>
  <img src="a.jpg"><img src="b.jpg"><a href="/policies/refund-policy">Refunds</a><a href="https://x.com/policies/shipping-policy">Ship</a></main><script src="https://cdn.shopify.com/x.js"></script></body></html>`;
  const p = rs.parseHtml(html, 'https://glow.example/');
  assert.strictEqual(p.title, 'Glow & Co');
  assert.strictEqual(p.description, 'Pretty things');
  assert.strictEqual(p.isShopify, true);
  assert.deepStrictEqual(p.nav.map((n) => n.text), ['Home', 'Shop', 'About']);
  assert.strictEqual(p.nav[1].href, 'https://glow.example/collections/all');
  assert.deepStrictEqual(p.headings, [{ tag: 'h1', text: 'Welcome' }, { tag: 'h2', text: 'Best sellers' }]);
  assert.deepStrictEqual(p.sectionTypes, ['image-banner', 'featured-collection']);
  assert.deepStrictEqual(p.stylesheets, ['https://glow.example/cdn/theme.css']);
  assert.ok(p.inlineCss.includes('#ff0000'));
  assert.deepStrictEqual(p.policyLinks, ['https://glow.example/policies/refund-policy', 'https://x.com/policies/shipping-policy']);
  assert.strictEqual(p.imageCount, 2);
  assert.ok(!p.textSample.includes('cdn.shopify'));
});

t('extractColorsAndFonts: hex short/long, rgb, frequency order; generic fonts dropped', () => {
  const r = rs.extractColorsAndFonts(`.a{color:#F00;background:#ff0000;border-color:rgb(255,0,0)} .b{color:#123456;font-family:"Playfair Display", serif} .c{font-family:Inter,sans-serif} .d{font-family:var(--font)}`);
  assert.deepStrictEqual(r.colors[0], { value: '#ff0000', count: 3 });
  assert.deepStrictEqual(r.colors[1], { value: '#123456', count: 1 });
  assert.deepStrictEqual(r.fonts, ['Playfair Display', 'Inter']);
});

t('parseStyleSheet: keeps known sections, hex colours, caps; refuses junk', () => {
  const ok = ss.parseStyleSheet('```json\n' + JSON.stringify({ brand: { name: 'Mine', tagline: 'Shine daily' }, palette: { primary: '#AB12cd', background: 'white' }, fonts: { heading: 'Poppins' }, tone: 'warm', sections: [{ type: 'hero-banner', title: 'Hi', note: 'big photo' }, { type: 'weird', title: 'x' }], collections: [{ title: 'Jhumkas', note: 'oxidised' }, { title: '' }], offers: ['free shipping above a threshold'], policies: { shipping: 's', refund: 'r' } }) + '\n```', 'Fallback');
  assert.strictEqual(ok.brand.name, 'Mine');
  assert.strictEqual(ok.palette.primary, '#ab12cd');
  assert.strictEqual(ok.palette.background, '#ffffff', 'non-hex falls back');
  assert.strictEqual(ok.fonts.body, 'Inter', 'missing font gets the default');
  assert.deepStrictEqual(ok.sections, [{ type: 'hero-banner', title: 'Hi', note: 'big photo' }]);
  assert.deepStrictEqual(ok.collections, [{ title: 'Jhumkas', note: 'oxidised' }]);
  assert.throws(() => ss.parseStyleSheet('no json here', 'F'), /style sheet/);
  assert.throws(() => ss.parseStyleSheet('{"sections":[]}', 'F'), /no usable/);
  const edited = ss.cleanStyleSheet({ tone: 'playful', palette: { ...ok.palette, accent: '#000000' } }, ok);
  assert.strictEqual(edited.tone, 'playful'); assert.strictEqual(edited.palette.accent, '#000000'); assert.strictEqual(edited.brand.name, 'Mine');
});

t('stylePrompt never asks to copy and carries the merchant facts', () => {
  const site = { url: 'u', finalUrl: 'https://ref.example/', title: 'Ref', description: '', isShopify: true, nav: [{ text: 'Shop', href: '' }], headings: [], sectionTypes: ['image-banner'], colors: [{ value: '#112233', count: 9 }], fonts: ['Lato'], imageCount: 3, policies: [], collections: [{ title: 'Rings', handle: 'rings' }], products: [], textSample: 'hello', errors: [] };
  const p = ss.stylePrompt(site, { storeName: 'My Store', productTypes: ['Bangles'], sampleTitles: ['Pink bangle set'] });
  assert.ok(p.includes("Merchant's store name: My Store") && p.includes('Bangles') && p.includes('#112233') && p.includes('Lato'));
  assert.ok(/Never copy/.test(ss.STYLE_SYSTEM));
});

done('reference');
