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

t('parseSections: every Shopify section in order with its place, counts, headings, running-bar items', () => {
  const html = `<html><body>
  <div id="shopify-section-sections--9__announcement-bar" class="shopify-section"><p>Free shipping above 999</p></div>
  <div id="shopify-section-sections--9__marquee_kWqHpT" class="shopify-section"><div class="marquee__content"><span>Premium quality</span> • <span>Unique</span> • <span>Comfy</span> • <span>Premium quality</span></div></div>
  <div id="shopify-section-sections--9__header" class="shopify-section"><a href="/">Home</a></div>
  <main>
  <div id="shopify-section-template--5__slideshow_AbC9" class="shopify-section"><img src="1.jpg"><img src="2.jpg"><img src="3.jpg"><a class="button" href="/collections/all">Shop</a><h2>Festive sale</h2></div>
  <div id="shopify-section-template--5__collection_list_q1" class="shopify-section"><h2>Shop by categories</h2>${['rings', 'jhumkas', 'bangles', 'sets', 'anklets', 'chains'].map((h) => `<a href="/collections/${h}"><img src="${h}.jpg">${h[0].toUpperCase() + h.slice(1)}</a>`).join('')}<a href="/collections/rings">Rings again</a></div>
  <div id="shopify-section-template--5__video_k7x2" class="shopify-section"><video src="a.mp4"></video></div>
  <div id="shopify-section-template--5__featured_collection_z9" class="shopify-section"><h2>All products</h2>${Array.from({ length: 12 }, (_, i) => `<a href="/products/p${i}">P${i}</a>`).join('')}</div>
  <div id="shopify-section-template--5__cart-drawer" class="shopify-section"></div>
  </main>
  <div id="shopify-section-sections--7__footer" class="shopify-section"><p>About us</p></div>
  <script>var x = '<div id="shopify-section-template--5__fake">';</script></body></html>`;
  const s = rs.parseSections(html);
  assert.deepStrictEqual(s.map((x) => `${x.place}:${x.type}`), ['header:announcement-bar', 'header:marquee', 'header:header', 'main:slideshow', 'main:collection-list', 'main:video', 'main:featured-collection', 'footer:footer'], 'cart drawer and script text skipped');
  assert.strictEqual(s[1].marquee, true);
  assert.deepStrictEqual(s[1].items, ['Premium quality', 'Unique', 'Comfy'], 'running bar phrases, repeats folded');
  assert.strictEqual(s[3].images, 3); assert.strictEqual(s[3].buttons, 1); assert.deepStrictEqual(s[3].headings, ['Festive sale']);
  assert.strictEqual(s[4].collections, 6, 'distinct category links, /collections/all never counts');
  assert.strictEqual(s[4].items.length, 7);
  assert.strictEqual(s[5].videos, 1);
  assert.strictEqual(s[6].products, 12);
  assert.ok(s[0].text.includes('Free shipping'));
  const plain = rs.parseSections('<html><body><section><h2>One</h2></section><section><h2>Two</h2><a href="/products/x">x</a></section></body></html>');
  assert.deepStrictEqual(plain.map((x) => x.type), ['section', 'section'], 'a non-Shopify page falls back to <section> elements');
  assert.strictEqual(plain[1].products, 1);
  const p = rs.parseHtml(html, 'https://x.example/');
  assert.strictEqual(p.sections.length, 8, 'parseHtml carries the sections');
});

t('productFeatures: what a product page shows, from its text and markup', () => {
  const html = `<html><body><h1>16 pcs oxidised jhumkas</h1><div class="price"><span class="price__sale">Rs. 499</span> <s>Rs. 2,499</s> <span class="badge">Save 80%</span></div>
  <p>Tax included.</p><div class="jdgm-prev-badge">4.5 stars (120 reviews)</div><div class="offer">BUY 1 GET 1 FREE</div>
  <fieldset class="product-form__input"><legend>Colour</legend></fieldset><p class="urgency">Selling fast! Only 3 left</p><p>Your order will be delivered by 12 Oct</p>
  <button class="sticky-atc">Add to cart</button><h2>Frequently asked questions</h2><video src="v.mp4"></video>
  <ul><li>Free shipping</li><li>7 days return</li><li>Secure payment</li></ul><a href="https://wa.me/91999">Chat</a><h2>You may also like</h2></body></html>`;
  const f = rs.productFeatures(html);
  for (const k of ['compare_price', 'save_percent', 'tax_included', 'rating', 'reviews', 'offer_badge', 'variants', 'urgency', 'delivery_estimate', 'faq', 'video', 'trust_badges', 'whatsapp', 'sticky_cart', 'recommendations']) assert.ok(f.includes(k), `missing ${k}`);
  assert.ok(!f.includes('size_chart') && !f.includes('bundle') && !f.includes('wishlist'));
  assert.deepStrictEqual(rs.productFeatures('<html><body><h1>Plain</h1><p>Rs. 100</p></body></html>'), []);
  assert.ok(Object.keys(rs.PRODUCT_FEATURES).length >= 15);
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
  const rich = ss.parseStyleSheet(JSON.stringify({ sections: [{ type: 'marquee', title: 'Bar', note: 'runs', count: '4', items: ['Fast delivery', '', 'Easy returns', 7] }, { type: 'collection-list', title: 'Shop', note: 'tiles', count: 99 }] }), 'F');
  assert.deepStrictEqual(rich.sections[0], { type: 'marquee', title: 'Bar', note: 'runs', count: 4, items: ['Fast delivery', 'Easy returns'] });
  assert.deepStrictEqual(rich.sections[1], { type: 'collection-list', title: 'Shop', note: 'tiles' }, 'a count over 50 is dropped');
  assert.ok(ss.SECTION_TYPES.includes('trust-badges') && ss.SECTION_TYPES.includes('product-grid') && ss.SECTION_TYPES.includes('announcement-bar'));
  assert.deepStrictEqual(ok.productPage, { features: [], offerLine: '', sections: [] }, 'missing product page = empty');
  const pages = ss.parseStyleSheet(JSON.stringify({ sections: [{ type: 'hero-banner', title: 'x', note: 'y' }], productPage: { features: ['compare_price', 'nope', 'rating', 'rating'], offerLine: 'Buy 2 get 1', sections: [{ type: 'faq', title: 'Q', note: 'n', count: 4 }, { type: 'weird' }] }, collectionPage: { note: '4 per row, filters left', sections: [{ type: 'image-banner', title: 'B', note: 'top' }] } }), 'F');
  assert.deepStrictEqual(pages.productPage, { features: ['compare_price', 'rating'], offerLine: 'Buy 2 get 1', sections: [{ type: 'faq', title: 'Q', note: 'n', count: 4 }] });
  assert.deepStrictEqual(pages.collectionPage, { note: '4 per row, filters left', sections: [{ type: 'image-banner', title: 'B', note: 'top' }] });
  assert.deepStrictEqual(ok.collections, [{ title: 'Jhumkas', note: 'oxidised' }]);
  assert.throws(() => ss.parseStyleSheet('no json here', 'F'), /style sheet/);
  assert.throws(() => ss.parseStyleSheet('{"sections":[]}', 'F'), /no usable/);
  const edited = ss.cleanStyleSheet({ tone: 'playful', palette: { ...ok.palette, accent: '#000000' } }, ok);
  assert.strictEqual(edited.tone, 'playful'); assert.strictEqual(edited.palette.accent, '#000000'); assert.strictEqual(edited.brand.name, 'Mine');
});

t('stylePrompt never asks to copy and carries the merchant facts', () => {
  const site = { url: 'u', finalUrl: 'https://ref.example/', title: 'Ref', description: '', isShopify: true, nav: [{ text: 'Shop', href: '' }], headings: [], sectionTypes: ['image-banner'], sections: [{ place: 'header', type: 'marquee', headings: [], text: 'Premium quality', items: ['Premium quality', 'Comfy'], collections: 0, products: 0, images: 0, videos: 0, buttons: 0, marquee: true }, { place: 'main', type: 'collection-list', headings: ['Shop by categories'], text: '', items: [], collections: 6, products: 0, images: 6, videos: 0, buttons: 0, marquee: false }], colors: [{ value: '#112233', count: 9 }], fonts: ['Lato'], imageCount: 3, policies: [], collections: [{ title: 'Rings', handle: 'rings' }], products: [], textSample: 'hello', errors: [] };
  site.pages = { product: 'https://ref.example/products/x', collection: 'https://ref.example/collections/y' }; site.productPage = [{ place: 'main', type: 'main-product', headings: ['X'], text: '', items: [], collections: 0, products: 0, images: 4, videos: 0, buttons: 2, marquee: false }]; site.collectionPage = []; site.productFeatures = ['compare_price', 'rating']; site.productOptions = ['Colour']; site.variantCount = 3;
  const p = ss.stylePrompt(site, { storeName: 'My Store', productTypes: ['Bangles'], sampleTitles: ['Pink bangle set'] });
  assert.ok(p.includes('REFERENCE PRODUCT PAGE') && p.includes('compare_price, rating') && p.includes('options: Colour') && p.includes('main-product (4 images, 2 buttons)') && p.includes('REFERENCE COLLECTION PAGE'));
  assert.ok(/productPage\.features/.test(ss.STYLE_SYSTEM) && /collectionPage\.note/.test(ss.STYLE_SYSTEM));
  assert.ok(p.includes("Merchant's store name: My Store") && p.includes('Bangles') && p.includes('#112233') && p.includes('Lato'));
  assert.ok(p.includes('#1 [header] marquee (RUNNING TEXT BAR)') && p.includes('#2 [main] collection-list (6 category links, 6 images)') && p.includes('"Shop by categories"'), 'one line per reference section with its counts');
  assert.ok(/ONE entry per section/.test(ss.STYLE_SYSTEM) && /trust-badges/.test(ss.STYLE_SYSTEM));
  assert.ok(/Never copy/.test(ss.STYLE_SYSTEM));
});

done('reference');
