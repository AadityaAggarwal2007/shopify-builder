// What the Admin API cannot set: the owner does these in Shopify admin; the tool keeps the ticks.
export interface ChecklistItem { key: string; title: string; why: string; path: string }
export const CHECKLIST: ChecklistItem[] = [
  { key: 'currency', title: 'Store currency = INR', why: 'A new store often starts in another currency. Change it before the first sale.', path: '/settings/general' },
  { key: 'store_details', title: 'Store name, email, address', why: 'Shown on invoices, emails and policies.', path: '/settings/general' },
  { key: 'payments', title: 'Payments: activate Razorpay / PayU / Cashfree, and COD', why: 'No payment method = nobody can buy. The API cannot set this.', path: '/settings/payments' },
  { key: 'checkout', title: 'Checkout: phone required, address fields, marketing opt-in', why: 'Delivery partners need the phone number.', path: '/settings/checkout' },
  { key: 'shipping', title: 'Shipping: an India zone with your rate (or free above an amount)', why: 'Without a rate the checkout says "no shipping".', path: '/settings/shipping' },
  { key: 'taxes', title: 'Taxes: GST on / off as your CA says', why: 'The API cannot set taxes.', path: '/settings/taxes' },
  { key: 'domain', title: 'Domain: connect your .in / .com', why: 'Until then the store is on myshopify.com.', path: '/settings/domains' },
  { key: 'password', title: 'Remove the storefront password (Private mode off)', why: 'Otherwise visitors see "Opening soon".', path: '/online_store/preferences' },
  { key: 'legal', title: 'Read the 4 policies once', why: 'The AI wrote them from your facts; check the numbers.', path: '/settings/legal' },
  { key: 'notifications', title: 'Order emails: sender name and logo', why: 'Customers get these from the first order.', path: '/settings/notifications' },
  { key: 'app_reviews', title: 'Reviews app (Judge.me / Loox) for star ratings and customer reviews', why: 'A theme cannot show reviews by itself; the reference uses an app.', path: '/apps' },
  { key: 'app_offers', title: 'Offers app (Buy 1 Get 1, bundles, free gift) if your product page needs it', why: 'Discounts beyond a plain sale price need an app or Shopify Discounts.', path: '/discounts' },
  { key: 'app_urgency', title: 'Delivery-estimate / "selling fast" app (optional)', why: 'Delivery dates and stock urgency lines on the product page come from an app.', path: '/apps' },
  { key: 'tracking_app', title: 'Install ShipTrack chat widget + tracking (optional)', why: 'Your own support + tracking, as on the other stores.', path: '/settings/apps' },
];
