// CSV rows -> Shopify ProductSetInput, and the proposed collections (src/lib/products/mapper.ts).
const assert = require('assert');
const { load, t, done } = require('./_load');
const m = load('lib/products/mapper');

const product = { handle: 'red-shirt', title: 'Red Shirt', body_html: '<p>x</p>', vendor: 'Vastora', product_type: 'Shirts', tags: ['summer'], option_names: ['Size', 'Color'] };
const variants = [
  { options: ['S', 'Red'], sku: 'RS-S', price: '499.00', compare_at: '699.00' },
  { options: ['M', 'Red'], sku: '', price: 499, compare_at: null },
  { options: ['M', 'Blue'], sku: 'RS-MB', price: '549', compare_at: '500' }, // compare-at below price: dropped
];
const images = [{ id: 'b', path: 'proj/b b.jpg', position: 2, alt: '' }, { id: 'a', path: 'proj/a.jpg', position: 1, alt: 'front' }];

t('productSet input: options, variants, files in order, status', () => {
  const inp = m.toProductSetInput(product, variants, images, 'https://builder.example.com/', true);
  assert.strictEqual(inp.handle, 'red-shirt');
  assert.strictEqual(inp.status, 'ACTIVE');
  assert.deepStrictEqual(inp.productOptions, [
    { name: 'Size', position: 1, values: [{ name: 'S' }, { name: 'M' }] },
    { name: 'Color', position: 2, values: [{ name: 'Red' }, { name: 'Blue' }] },
  ]);
  assert.strictEqual(inp.variants.length, 3);
  assert.deepStrictEqual(inp.variants[0], { optionValues: [{ optionName: 'Size', name: 'S' }, { optionName: 'Color', name: 'Red' }], price: '499.00', sku: 'RS-S', compareAtPrice: '699.00' });
  assert.strictEqual(inp.variants[1].sku, undefined);
  assert.strictEqual(inp.variants[2].compareAtPrice, undefined);
  assert.deepStrictEqual(inp.files.map((f) => f.originalSource), ['https://builder.example.com/uploads/proj/a.jpg', 'https://builder.example.com/uploads/proj/b%20b.jpg']);
  assert.strictEqual(inp.files[0].alt, 'front');
  assert.strictEqual(inp.files[1].alt, 'Red Shirt');
  assert.strictEqual(inp.tags[0], 'summer');
});

t('no options = Title / Default Title; no images = no files; no variants = one at 0', () => {
  const inp = m.toProductSetInput({ ...product, option_names: [], tags: [] }, [], [], 'http://localhost:3001', false);
  assert.strictEqual(inp.status, 'DRAFT');
  assert.deepStrictEqual(inp.productOptions, [{ name: 'Title', position: 1, values: [{ name: 'Default Title' }] }]);
  assert.deepStrictEqual(inp.variants, [{ optionValues: [{ optionName: 'Title', name: 'Default Title' }], price: '0.00', sku: undefined }]);
  assert.strictEqual(inp.files, undefined);
  assert.strictEqual(inp.tags, undefined);
});

t('proposed collections: every Type, Tags used twice or more, no duplicate handles', () => {
  const cols = m.proposeCollections([
    { product_type: 'Shirts', tags: ['summer', 'cotton'] },
    { product_type: 'Shirts', tags: ['summer'] },
    { product_type: 'Mugs', tags: ['gift'] },
    { product_type: 'Summer', tags: [] }, // same handle as the tag 'summer': the type wins
  ]);
  assert.deepStrictEqual(cols.map((c) => [c.handle, c.rule_kind, c.count]), [['shirts', 'type', 2], ['mugs', 'type', 1], ['summer', 'type', 1]]);
});

done('mapper');
