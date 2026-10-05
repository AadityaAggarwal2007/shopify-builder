// What a product page can show; detected in code (read-site.ts), confirmed by the AI (style-sheet.ts),
// filled into the theme's product template (theme-plan.ts) and shown on the Reference screen. Pure data.
export const PRODUCT_FEATURES = {
  compare_price: 'Compare-at (struck-through) price', save_percent: '"Save X%" / "X% off" tag', tax_included: '"Tax included" line', rating: 'Star rating under the title',
  reviews: 'Customer reviews', offer_badge: 'Offer line (Buy 1 Get 1, flat off)', variants: 'Colour / size / type options', urgency: '"Selling fast" / "only N left"',
  delivery_estimate: 'Delivery date estimate', size_chart: 'Size chart / guide', faq: 'Questions and answers', video: 'Video', trust_badges: 'Free shipping / returns / secure payment icons',
  whatsapp: 'WhatsApp / chat button', sticky_cart: 'Sticky add-to-cart bar', recommendations: 'Related / you may also like', bundle: 'Bundle / frequently bought together', wishlist: 'Wishlist',
} as const;
export type ProductFeature = keyof typeof PRODUCT_FEATURES;
