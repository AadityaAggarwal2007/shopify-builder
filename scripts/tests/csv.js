// The Shopify product CSV reader (src/lib/csv/product-csv.ts).
const assert = require('assert');
const { load, t, done } = require('./_load');
const csv = load('lib/csv/product-csv');

const HEAD = 'Handle,Title,Body (HTML),Vendor,Type,Tags,Published,Option1 Name,Option1 Value,Option2 Name,Option2 Value,Variant SKU,Variant Price,Variant Compare At Price,Image Src,Image Position,Image Alt Text,Status';
const sample = [
  HEAD,
  'red-shirt,Red Shirt,"<p>Soft cotton, <b>bold</b> red.</p>",Vastora,Shirts,"summer, cotton",TRUE,Size,S,Color,Red,RS-S,499,699,https://cdn.example.com/a.jpg,1,front,active',
  'red-shirt,,,,,,,,M,,Red,RS-M,499,,https://cdn.example.com/b.jpg,2,,',
  'red-shirt,,,,,,,,L,,Red,RS-L,549,,,,,',
  'mug,Coffee Mug,,Vastora,Mugs,,TRUE,,,,,MUG1,299,,https://cdn.example.com/m.jpg,1,,draft',
  'bad-price,No Price,,Vastora,Mugs,,TRUE,,,,,X,abc,,,,,',
  ',,,Stray row with only a vendor,,,,,,,,,,,,,,',
].join('\n');

t('reads products, variants, images, tags, status', () => {
  const r = csv.parseProductCsv(sample);
  assert.strictEqual(r.products.length, 3);
  const shirt = r.products[0];
  assert.strictEqual(shirt.handle, 'red-shirt');
  assert.strictEqual(shirt.title, 'Red Shirt');
  assert.deepStrictEqual(shirt.optionNames, ['Size', 'Color']);
  assert.strictEqual(shirt.variants.length, 3);
  assert.deepStrictEqual(shirt.variants[1], { options: ['M', 'Red'], sku: 'RS-M', price: 499, compareAt: null, imageSrc: null });
  assert.strictEqual(shirt.variants[0].compareAt, 699);
  assert.deepStrictEqual(shirt.images.map((i) => i.src), ['https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.jpg']);
  assert.strictEqual(shirt.images[0].alt, 'front');
  assert.deepStrictEqual(shirt.tags, ['summer', 'cotton']);
  assert.strictEqual(shirt.active, true);
  assert.ok(shirt.bodyHtml.includes('<b>bold</b>'));
  const mug = r.products[1];
  assert.deepStrictEqual(mug.optionNames, []);
  assert.deepStrictEqual(mug.variants[0].options, ['Default Title']);
  assert.strictEqual(mug.active, false, 'Status draft wins over Published TRUE');
});

t('problems carry the row number and never throw', () => {
  const r = csv.parseProductCsv(sample);
  const bad = r.problems.find((p) => p.handle === 'bad-price');
  assert.ok(bad && bad.row === 5 && /Variant Price/.test(bad.message), JSON.stringify(r.problems));
  assert.ok(r.problems.some((p) => p.row === 6 && /No Handle/.test(p.message)));
  // bad-price still exists as a product with one variant at 0 (the owner fixes it in the grid)
  const bp = r.products.find((p) => p.handle === 'bad-price');
  assert.ok(bp && bp.variants.length === 1 && bp.variants[0].price === 0);
});

t('missing Handle / Title columns = one clear problem, no products', () => {
  const r = csv.parseProductCsv('Name,Price\nShirt,499');
  assert.strictEqual(r.products.length, 0);
  assert.ok(/Missing columns: Handle, Title/.test(r.problems[0].message));
});

t('a handle is made from the title and slugified; duplicates and non-link images are reported', () => {
  const r = csv.parseProductCsv([HEAD,
    ',Blue Kurta Set!,,V,Kurtas,,TRUE,Size,M,,,K1,999,,/local/path.jpg,1,,active',
    'blue-kurta-set,,,,,,,,M,,,K1b,999,,,,,'].join('\n'));
  assert.strictEqual(r.products[0].handle, 'blue-kurta-set');
  assert.strictEqual(r.products[0].variants.length, 1);
  assert.ok(r.problems.some((p) => /Duplicate variant/.test(p.message)));
  assert.ok(r.problems.some((p) => /not a link/.test(p.message)));
});

t('caps: variants and images per product', () => {
  const rows = [HEAD, 'big,Big,,V,T,,TRUE,Size,s0,,,,10,,https://x/0.jpg,1,,active'];
  for (let i = 1; i < csv.MAX_VARIANTS + 3; i++) rows.push(`big,,,,,,,,s${i},,,,10,,https://x/${i}.jpg,${i + 1},,`);
  const r = csv.parseProductCsv(rows.join('\n'));
  assert.strictEqual(r.products[0].variants.length, csv.MAX_VARIANTS);
  assert.strictEqual(r.products[0].images.length, csv.MAX_IMAGES);
  assert.ok(r.problems.filter((p) => /More than/.test(p.message)).length >= 2);
});

t('loose header match (Variant price lower-case, spaces) and quoted line breaks', () => {
  const r = csv.parseProductCsv('handle , title,Body (HTML),variant price\nx,X,"<p>line one\nline two</p>",12.5');
  assert.strictEqual(r.products.length, 1);
  assert.strictEqual(r.products[0].variants[0].price, 12.5);
  assert.ok(r.products[0].bodyHtml.includes('line two'));
});

done('csv');
