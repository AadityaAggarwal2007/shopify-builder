// Theme schema parsing and the plan validator / applier on a small Dawn-like theme (no network).
const assert = require('assert');
const { load, t, done } = require('./_load');
const sch = load('lib/theme/theme-schema');
const plan = load('lib/theme/theme-plan');

const settingsSchema = JSON.stringify([
  { name: 'theme_info', theme_name: 'Dawn', theme_version: '15.0.0' },
  { name: 't:settings_schema.colors.name', settings: [
    { type: 'header', content: 'x' },
    { type: 'color', id: 'colors_accent_1', label: 't:accent', default: '#121212' },
    { type: 'color', id: 'colors_background_1', label: 'Background', default: '#ffffff' },
    { type: 'font_picker', id: 'type_header_font', label: 'Heading', default: 'assistant_n4' },
    { type: 'image_picker', id: 'logo', label: 'Logo' },
    { type: 'select', id: 'card_style', label: 'Card', options: [{ value: 'standard' }, { value: 'card' }], default: 'standard' },
    { type: 'range', id: 'buttons_radius', min: 0, max: 40, default: 0 },
  ] },
]);
const sections = {
  'image-banner': JSON.stringify({ name: 'Image banner', settings: [{ type: 'image_picker', id: 'image', label: 'Image' }, { type: 'select', id: 'image_height', options: [{ value: 'small' }, { value: 'large' }] }], blocks: [{ type: 'heading', name: 'Heading', limit: 1, settings: [{ type: 'inline_richtext', id: 'heading', default: 'x' }] }, { type: 'buttons', settings: [{ type: 'text', id: 'button_label_1' }, { type: 'url', id: 'button_link_1' }] }], max_blocks: 3, presets: [{ name: 'Image banner' }] }),
  'featured-collection': JSON.stringify({ name: 'Featured collection', settings: [{ type: 'inline_richtext', id: 'title' }, { type: 'collection', id: 'collection' }], presets: [{ name: 'x' }] }),
  'header': JSON.stringify({ name: 'Header', settings: [{ type: 'image_picker', id: 'logo', label: 'Logo' }, { type: 'range', id: 'logo_width', min: 50, max: 250, default: 100 }], enabled_on: { groups: ['header'] } }),
  'announcement-bar': JSON.stringify({ name: 'Announcement', settings: [{ type: 'text', id: 'text', label: 'Text' }], enabled_on: { groups: ['header'] } }),
  'main-product': JSON.stringify({ name: 'Product', settings: [], enabled_on: { templates: ['product'] }, presets: [{ name: 'x' }] }),
  'no-preset': JSON.stringify({ name: 'Internal', settings: [] }),
  'main-product': JSON.stringify({ name: 'Product information', settings: [{ type: 'checkbox', id: 'enable_sticky_info', default: false }, { type: 'checkbox', id: 'show_compare', default: true }], blocks: [{ type: 'title', limit: 1, settings: [] }, { type: 'text', settings: [{ type: 'text', id: 'text' }] }, { type: 'collapsible_tab', settings: [{ type: 'text', id: 'heading' }, { type: 'richtext', id: 'content' }] }], max_blocks: 6 }),
  'collapsible-content': JSON.stringify({ name: 'Collapsible content', settings: [{ type: 'text', id: 'heading' }], blocks: [{ type: 'collapsible_row', settings: [{ type: 'text', id: 'heading' }, { type: 'richtext', id: 'row_content' }] }], presets: [{ name: 'x' }] }),
  'product-only': JSON.stringify({ name: 'Product only', settings: [], enabled_on: { templates: ['product'] }, presets: [{ name: 'x' }] }),
};
const productTemplate = '/* c */\n' + JSON.stringify({ sections: { main: { type: 'main-product', settings: { show_compare: true }, blocks: { title: { type: 'title', settings: {} }, t1: { type: 'text', settings: { text: 'old' } } }, block_order: ['title', 't1'] }, rec: { type: 'product-recommendations', settings: {} } }, order: ['main', 'rec'] });
const indexTemplate = '/* comment */\n' + JSON.stringify({ sections: { old: { type: 'rich-text', settings: {} } }, order: ['old'] });
const settingsData = JSON.stringify({ current: { colors_accent_1: '#121212', other_setting: 5 }, presets: { Default: {} } });
const headerGroup = '/* c */\n' + JSON.stringify({ type: 'header', name: 'Header group', sections: { announcement: { type: 'announcement-bar', settings: { text: 'Old' } }, header: { type: 'header', settings: { logo_width: 120 } } }, order: ['announcement', 'header'] });
const theme = sch.summarize({ settingsSchema, settingsData, indexTemplate, sections, groups: { 'header-group': headerGroup, 'other': '{}' }, templates: { product: productTemplate, collection: '{ not json' } });

t('summarize: theme info, global settings with ids only, home-page sections only', () => {
  assert.strictEqual(theme.name, 'Dawn'); assert.strictEqual(theme.version, '15.0.0');
  assert.deepStrictEqual(theme.settings.map((s) => s.id), ['colors_accent_1', 'colors_background_1', 'type_header_font', 'logo', 'card_style', 'buttons_radius']);
  assert.deepStrictEqual(theme.settings[4].options, ['standard', 'card']);
  assert.deepStrictEqual(Object.keys(theme.sections).sort(), ['collapsible-content', 'featured-collection', 'image-banner'], 'header (group), product-only and preset-less sections are left out');
  assert.deepStrictEqual(Object.keys(theme.templates), ['product'], 'a template that is not JSON is skipped');
  assert.deepStrictEqual(theme.templates.product.sections.map((x) => `${x.key}:${x.type}:${x.blocks.map((b) => b.type).join('+')}`), ['main:main-product:title+text', 'rec:product-recommendations:']);
  assert.deepStrictEqual(theme.templateSections.product.sort(), ['collapsible-content', 'featured-collection', 'image-banner', 'product-only'], 'what may be added on the product page: presets, allowed there');
  assert.ok(!theme.templateSections.product.includes('main-product'), 'a main section (no presets) is never added');
  assert.strictEqual(theme.sections['image-banner'].maxBlocks, 3);
  assert.strictEqual(theme.sections['image-banner'].blocks[0].limit, 1);
  assert.deepStrictEqual(theme.indexOrder, ['old']);
  assert.strictEqual(theme.currentSettings.other_setting, 5);
  assert.deepStrictEqual(Object.keys(theme.groups), ['header-group'], 'only *-group files are groups');
  assert.deepStrictEqual(theme.groups['header-group'].map((x) => `${x.key}:${x.type}`), ['announcement:announcement-bar', 'header:header']);
  assert.ok(theme.allSections.header && theme.allSections['announcement-bar'] && !theme.sections.header, 'group sections known, never offered for the home page');
});

const assets = { banners: [{ slot: 'hero', alt: 'festive banner' }], collections: [{ handle: 'jhumkas', title: 'Jhumkas' }], products: [{ handle: 'red-shirt', title: 'Red' }] };
const assetsWithLogo = { ...assets, banners: [...assets.banners, { slot: 'logo', alt: 'logo' }] };

t('groups: the plan may only set settings of sections the header / footer group holds; applyGroup writes them, keeps the rest', () => {
  const p = plan.validatePlan({ sections: [{ type: 'image-banner', settings: {} }], groups: {
    'header-group': { header: { logo: 'banner:logo', logo_width: 150, nope: 1 }, announcement: { text: 'Free shipping above Rs 999' }, ghost: { text: 'x' } },
    'footer-group': { footer: { text: 'x' } },
  } }, theme, assetsWithLogo);
  assert.deepStrictEqual(p.groups, { 'header-group': { header: { logo: 'banner:logo', logo_width: 150 }, announcement: { text: 'Free shipping above Rs 999' } } });
  assert.ok(p.notes.some((n) => /ghost/.test(n)) && p.notes.some((n) => /footer-group/.test(n)) && p.notes.some((n) => /nope/.test(n)));
  const out = JSON.parse(plan.applyGroup(headerGroup, p.groups['header-group'], { logo: 'shopify://shop_images/builder-logo.png' }));
  assert.deepStrictEqual(out.order, ['announcement', 'header'], 'order untouched');
  assert.deepStrictEqual(out.sections.header.settings, { logo_width: 150, logo: 'shopify://shop_images/builder-logo.png' });
  assert.strictEqual(out.sections.announcement.settings.text, 'Free shipping above Rs 999');
  assert.strictEqual(out.type, 'header', 'the group file keeps its own keys');
  const none = plan.validatePlan({ sections: [{ type: 'image-banner', settings: {} }] }, theme, assets);
  assert.deepStrictEqual(none.groups, {}, 'no groups in the answer = nothing changed');
  const pr = plan.planPrompt(theme, { brand: { name: 'S', tagline: '' }, palette: { primary: '#000000', secondary: '#111111', accent: '#222222', background: '#ffffff', text: '#000000' }, fonts: { heading: 'Poppins', body: 'Inter' }, tone: 't', sections: [], collections: [], offers: [], policies: { shipping: '', refund: '' } }, assetsWithLogo, 'S');
  assert.ok(pr.includes('GROUP header-group') && pr.includes('key header (type header)') && pr.includes('key announcement') && !pr.includes('logo_width'), 'the prompt names the group sections by key, image / text settings only');
});

t('validatePlan: keeps only real ids / types / options; images by slot; collections by handle; notes the rest', () => {
  const raw = {
    settings: { colors_accent_1: '#108474', colors_background_1: 'white', type_header_font: 'Playfair Display', logo: 'banner:logo', card_style: 'card', buttons_radius: '12', made_up: 1 },
    sections: [
      { type: 'image-banner', settings: { image: 'banner:hero', image_height: 'huge', nope: 1 }, blocks: [{ type: 'heading', settings: { heading: 'Shop the vibe' } }, { type: 'heading', settings: { heading: 'second' } }, { type: 'buttons', settings: { button_label_1: 'Shop now', button_link_1: '/collections/all' } }, { type: 'video', settings: {} }] },
      { type: 'featured-collection', settings: { title: 'Best sellers', collection: 'shopify://collections/jhumkas' } },
      { type: 'featured-collection', settings: { collection: 'unknown-handle' } },
      { type: 'main-product', settings: {} },
    ],
  };
  const p = plan.validatePlan(raw, theme, assets);
  assert.deepStrictEqual(p.settings, { colors_accent_1: '#108474', type_header_font: 'playfair_display_n4', card_style: 'card', buttons_radius: 12 });
  assert.strictEqual(p.sections.length, 3, 'main-product dropped');
  assert.deepStrictEqual(p.sections[0].settings, { image: 'banner:hero' });
  assert.deepStrictEqual(p.sections[0].blocks.map((b) => b.type), ['heading', 'buttons'], 'heading limit 1, unknown block dropped');
  assert.deepStrictEqual(p.sections[1].settings, { title: 'Best sellers', collection: 'jhumkas' });
  assert.deepStrictEqual(p.sections[2].settings, {});
  assert.ok(p.notes.some((n) => /colors_background_1/.test(n)) && p.notes.some((n) => /made_up/.test(n)) && p.notes.some((n) => /logo/.test(n)) && p.notes.some((n) => /unknown-handle/.test(n)) && p.notes.some((n) => /main-product/.test(n)));
  assert.throws(() => plan.validatePlan({ sections: [{ type: 'nope' }] }, theme, assets), /no section/);
});

t('templates: existing product sections get settings + appended blocks within limits, new sections below; applyTemplate writes them', () => {
  const p = plan.validatePlan({ sections: [{ type: 'image-banner', settings: {} }], templates: {
    product: { existing: { main: { settings: { enable_sticky_info: true, nope: 1 }, blocks: [{ type: 'title', settings: {} }, { type: 'text', settings: { text: 'Buy 2 get 1 free' } }, { type: 'collapsible_tab', settings: { heading: 'Shipping', content: 'Free above 999' } }, { type: 'video', settings: {} }] }, ghost: { settings: {} } },
      add: [{ type: 'collapsible-content', settings: { heading: 'FAQs' }, blocks: [{ type: 'collapsible_row', settings: { heading: 'Q1', row_content: 'A1' } }] }, { type: 'product-only', settings: {} }, { type: 'main-product', settings: {} }] },
    collection: { existing: {}, add: [{ type: 'image-banner', settings: {} }] },
  } }, theme, assets);
  const t = p.templates.product;
  assert.deepStrictEqual(Object.keys(t.existing), ['main']);
  assert.deepStrictEqual(t.existing.main.settings, { enable_sticky_info: true });
  assert.deepStrictEqual(t.existing.main.blocks.map((b) => b.type), ['text', 'collapsible_tab'], 'title at its limit (one exists), video not a block type');
  assert.strictEqual(t.existing.main.blocks[1].settings.content, '<p>Free above 999</p>');
  assert.deepStrictEqual(t.add.map((s) => s.type), ['collapsible-content', 'product-only'], 'main-product cannot be added');
  assert.strictEqual(p.templates.collection, undefined, 'a template the theme does not have is dropped');
  assert.ok(p.notes.some((n) => /ghost/.test(n)) && p.notes.some((n) => /collection/.test(n)) && p.notes.some((n) => /nope/.test(n)));
  const out = JSON.parse(plan.applyTemplate(productTemplate, t, {}));
  assert.deepStrictEqual(out.order, ['main', 'rec', 'builder_1_collapsible_content', 'builder_2_product_only']);
  assert.deepStrictEqual(out.sections.main.settings, { show_compare: true, enable_sticky_info: true });
  assert.deepStrictEqual(out.sections.main.block_order, ['title', 't1', 'builder_text_1', 'builder_collapsible_tab_2']);
  assert.strictEqual(out.sections.main.blocks.t1.settings.text, 'old', 'existing blocks untouched');
  assert.strictEqual(out.sections.main.blocks.builder_text_1.settings.text, 'Buy 2 get 1 free');
  assert.deepStrictEqual(out.sections.builder_1_collapsible_content.block_order, ['collapsible_row_1']);
  assert.strictEqual(out.sections.rec.type, 'product-recommendations', 'other sections kept');
  const pr = plan.planPrompt(theme, { brand: { name: 'S', tagline: '' }, palette: { primary: '#000000', secondary: '#111111', accent: '#222222', background: '#ffffff', text: '#000000' }, fonts: { heading: 'Poppins', body: 'Inter' }, tone: 't', sections: [], collections: [], offers: [], policies: { shipping: '', refund: '' } }, assets, 'S');
  assert.ok(pr.includes('TEMPLATE product') && pr.includes('key main (type main-product)') && pr.includes('has blocks: title, text') && pr.includes('you may ADD on the product page') && pr.includes('product-only'));
});

t('applyPlan: settings_data keeps the rest, index.json has the new sections in order, banner tokens resolved', () => {
  const p = plan.validatePlan({ settings: { colors_accent_1: '#108474', logo: 'banner:hero' }, sections: [{ type: 'image-banner', settings: { image: 'banner:hero' }, blocks: [{ type: 'heading', settings: { heading: 'Hi' } }] }, { type: 'featured-collection', settings: { collection: 'jhumkas' } }] }, theme, assets);
  const out = plan.applyPlan(theme, p, settingsData, { hero: 'shopify://shop_images/builder-hero.jpg' });
  const data = JSON.parse(out.settingsData);
  assert.strictEqual(data.current.colors_accent_1, '#108474');
  assert.strictEqual(data.current.other_setting, 5, 'untouched setting kept');
  assert.strictEqual(data.current.logo, 'shopify://shop_images/builder-hero.jpg');
  assert.ok(data.presets, 'presets kept');
  const idx = JSON.parse(out.indexJson);
  assert.deepStrictEqual(idx.order, ['builder_1_image_banner', 'builder_2_featured_collection']);
  assert.strictEqual(idx.sections.builder_1_image_banner.settings.image, 'shopify://shop_images/builder-hero.jpg');
  assert.deepStrictEqual(idx.sections.builder_1_image_banner.block_order, ['heading_1']);
  assert.strictEqual(idx.sections.builder_1_image_banner.blocks.heading_1.settings.heading, 'Hi');
  assert.strictEqual(idx.sections.old, undefined, 'the old home page sections are replaced');
});

t('planPrompt lists only real ids and the slots; fontHandle maps names', () => {
  const style = { brand: { name: 'S', tagline: '' }, palette: { primary: '#000000', secondary: '#111111', accent: '#222222', background: '#ffffff', text: '#000000' }, fonts: { heading: 'Poppins', body: 'Inter' }, tone: 't', sections: [{ type: 'hero-banner', title: 'x', note: 'y' }], collections: [], offers: [], policies: { shipping: '', refund: '' } };
  const pr = plan.planPrompt(theme, style, assets, 'S');
  assert.ok(pr.includes('colors_accent_1 (color') && pr.includes('image-banner') && pr.includes('banner:hero') && pr.includes('jhumkas: Jhumkas'));
  assert.ok(!pr.slice(pr.indexOf('SECTION TYPES you may use on the home page'), pr.indexOf('GROUP ')).includes('main-product'), 'product-only sections are not offered for the home page');
  assert.strictEqual(plan.fontHandle('Playfair Display'), 'playfair_display_n4');
  assert.strictEqual(plan.fontHandle('poppins_n6'), 'poppins_n6');
  assert.strictEqual(plan.fontHandle('Comic Sans'), null);
});

done('theme');
