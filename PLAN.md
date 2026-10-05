# Shopify Builder: plan (2026-10-05)

## Context (kyun ban raha hai)

Owner (Jatin) ko apni team ke liye ek web tool chahiye jo naya Shopify store khud khada kar de.
Aaj yeh kaam haath se hota hai: products ek ek karke, theme settings, pages, policies, banners.
Builder me team ek **products CSV** daalegi, **har product pe photos drag-drop** karegi, **banners**
(upload / link / AI se bane) degi, aur ek **reference website** (competitor, ya "jaisi banani hai")
ka link degi. Tool pehle sab **preview** dikhaye, phir **Publish** dabane par store me chala jaye.

Answers jo mile (2026-10-05):

| Sawaal | Jawab |
|---|---|
| Kya | Shopify store khud banaye: products, theme look, pages + policies + menu, store settings |
| Kiske liye | Sirf apni team (SaaS nahi) |
| Kahan | Alag naya repo `shopify-builder`, wahi Hostinger VPS, `merchantbuild.in` |
| Shopify link | Apne stores, Admin API (owner khaali store dega) |
| Reference se | Layout / sections, colors / fonts, likhne ka style + policies, products / categories ka idea |
| AI | Text likhe (descriptions, policies, banner text); banners AI image se bhi bane |
| Input | Shopify ka apna product CSV; photos har product pe haath se drag-drop |
| Theme | Owner har baar theme khud dega; tool usi theme ko bhare (koi fixed theme nahi) |
| Publish | Pehle preview, phir Publish button |
| Login | Sirf owner, ek password |
| Bhasha | English, INR |
| Kitna | 2-5 stores, kabhi kabhi |
| Pehla hissa | CSV + photos -> products preview -> Shopify, 1 hafte me |
| AI model | "Aap decide karo": text DeepSeek chain (ShipTrack jaisa, wahi OpenRouter key); image `google/gemini-2.5-flash-image` via OpenRouter (same key, ~₹3-4 / image) |

## Seedhi baat: kya API se hota hai, kya nahi (fact-check 2026-10-05, Admin API 2026-01)

**Hota hai:** products + variants + photos (`productSet` handle se upsert, 2025-04+), collections
(`collectionCreate`), Online Store pe dikhana (`publishablePublish`, zaroori: API se bana product
by default hidden hota hai), pages (`pageCreate`), policies (`shopPolicyUpdate`: refund, privacy,
terms, shipping, contact), menu (`menuUpdate` on `main-menu` / `footer`), files / logo / banners
(`fileCreate` from public URL), shipping zones (`deliveryProfileUpdate`), theme list, unpublished
theme ka preview link (`?preview_theme_id=`), theme publish.

**Nahi hota** (Shopify deta hi nahi): payment gateway, domain jodna, checkout settings, taxes.
Tool inka **checklist** dikhayega, har item pe Shopify admin ka seedha link; team haath se kare, tool tick rakhe.

**Do dikkatein jo plan badalti hain:**
1. **Jan 2026 se store admin ka "Develop apps" custom app nahi banta.** Naya app Shopify Dev Dashboard
   me banta hai aur permanent token nahi dikhata. Isliye tool me ek chhota **OAuth connect** hoga
   (authorization code grant, offline token = permanent): owner Dev Dashboard me ek app banata hai
   (custom distribution, apne store par install), uska client id / secret env me, tool ka "Connect store"
   button Shopify par le jaata hai, wapas aate hi token encrypted save. Purane store me pehle se legacy
   custom app ho to uska `shpat_` token paste bhi chalega (dono raaste).
2. **Theme files API se likhne ke liye Shopify ki "exemption" lagti hai** (`themeFilesUpsert`,
   `write_themes`): public apps ke liye pakka, custom apps ke liye community me ACCESS_DENIED ke case hain,
   form bharne par 1-2 din me milti hai. Isliye theme ka **safe raasta zip se**: owner theme ka zip TOOL me
   upload kare, tool zip ke andar `config/settings_data.json` + `templates/index.json` bhar ke **naya zip**
   banaye. Phir: (a) exemption mili to `themeCreate` se seedha store me unpublished theme + preview + Publish;
   (b) nahi mili to owner naya zip Shopify admin me "Add theme > Upload zip" se daale (2 click), preview
   wahi, Publish wahi. Exemption pehle din hi request karenge; code dono raaste rakhega.

## Shape of the tool

Ek store = ek **project**. Left sidebar me steps, har step ka apna preview + Publish:

1. **Store** : Connect (OAuth) ya token paste -> `shop` query se test -> encrypted save
2. **Reference** : website link -> tool padhe -> "Style sheet" (colors, fonts, section order, tone, collections ka idea); owner edit kare
3. **Products** : CSV upload -> grid -> photos drag-drop -> AI description -> Publish products
4. **Banners** : hero / collection / offer: upload, link, ya "AI se banao" (product photo + text)
5. **Theme** : theme zip upload -> tool bhare -> naya zip -> store me (API ya haath se) -> preview link -> Publish
6. **Pages, policies, menu** : AI draft (reference ke tone me), owner edit -> Publish
7. **Checklist** : jo API se nahi hota (payments, domain, checkout, taxes) : links + tick

Har Publish **idempotent**: dobara dabao to update ho, duplicate na bane (products / pages handle se,
menu `main-menu` update, files `duplicateResolutionMode: REPLACE`). Har run ka log: kya gaya, kya fail, kyun.
Reference se kabhi text / photo copy nahi, sirf dhaancha + rang + tone.

## Tech (ShipTrack jaisa hi, taaki wahi deploy / fix loop chale)

- Next.js 14 (App Router) + TypeScript + plain `pg` + PM2 + nginx; naya private repo `shopify-builder`.
- **Login**: ShipTrack `src/lib/auth.ts` ka chhota roop: `ADMIN_PASSWORD` + `AUTH_TOKEN_SECRET` env,
  token `v1.<payload>.<hmac>` 7 din, Bearer header, `/login` page, har API route me check;
  10 galat / 15 min lock (copy `src/app/api/auth/login/route.ts`).
- **Shopify client** (`src/lib/shopify/client.ts`, naya): GraphQL Admin API 2026-01, ek `shopifyGraphql(store, query, vars)`:
  token header, `extensions.cost.throttleStatus` padhe, THROTTLED pe wait + retry (3 baar, jitter), `userErrors` ko error banaye.
  OAuth start / callback: ShipTrack `src/app/api/shopify/oauth/*` ka pattern (domain normalise copy; nonce is baar
  store + check karenge, HMAC `timingSafeEqual` se). Scopes: `write_products, write_publications, read_publications,
  write_content, write_legal_policies, write_online_store_navigation, read_themes, write_themes, write_files, write_shipping`.
- **Token storage**: `stores.token_enc` AES-256-GCM, key `BUILDER_DATA_KEY` env (ShipTrack `src/lib/refund/crypto.ts` ka pattern). Plain text kabhi nahi.
- **Images**: upload VPS disk `/var/www/builder-uploads/<project>/...` (repo ke bahar), nginx `/uploads/` se public
  (random names). Shopify ko public URL (`productSet.files` / `fileCreate` `originalSource`), Shopify khud kheenche. Resize `sharp`.
- **AI text**: `openai` SDK -> OpenRouter, `AI_API_KEY`; chain copy of `src/lib/chat/ai-models.ts` (`sideAttemptOrder`: V4 Flash, phir Pro, phir gpt-4.1-mini). Har call `ai_runs` me (tokens, model, cost andaaza).
- **AI images**: OpenRouter `POST /api/v1/images` (model `AI_IMAGE_MODEL`, default `google/gemini-2.5-flash-image`, b64 wapas);
  input product photo + prompt (style sheet ke colors + offer text). Har banner par "AI se banao" + ab tak ka kharcha dikhe.
- **Reference reader** (`src/lib/reference/`): server fetch HTML + CSS (browser nahi): title / meta, nav, headings ka order,
  CSS se top colors + font-family, `/policies/*` text; Shopify store ho to public `/products.json?limit=250` + `/collections.json`
  (429 / block ho to bata de, chalta rahe). AI -> **style sheet JSON** `{palette, fonts, sections[], tone, collections[], offers[]}`.
  Playwright screenshot phase 2 ke end me, sirf agar HTML/CSS kam pade.
- **Theme filler** (`src/lib/theme/`): zip padhe (`config/settings_schema.json`, `settings_data.json`, `templates/index.json`,
  `sections/*.liquid` ke `{% schema %}`) -> AI ko schema + style sheet + banners + collections -> `settings_data.json` (colors,
  fonts, logo `shopify://shop_images/<file>`) + `index.json` (sections order + settings) -> code validate (sirf schema wali keys,
  sahi type, `shopify://collections/<handle>` jo bane hain) -> naya zip. Logo / banners pehle `fileCreate` (REPLACE, fixed filename).
- **CSV**: `papaparse`, Shopify product CSV ke fixed headers (`Handle, Title, Body (HTML), Vendor, Type, Tags, Option1 Name/Value...,
  Variant SKU, Variant Price, Variant Compare At Price, Image Src, Image Position, Status`); ek handle ki kai rows = ek product.
  Server parse, 5 MB, galat rows ki list (row no + reason) turant.

### Database (naya DB `builder`, role `builder_user`, wahi PostgreSQL)

`stores` (id, name, shop_domain, token_enc, scopes, last_ok_at) ·
`projects` (id, store_id, name, status, reference_url, style_sheet jsonb, theme_file, shopify_theme_id) ·
`products` (id, project_id, handle, title, body_html, vendor, type, tags[], status draft/ready/pushed/error, shopify_id, error) ·
`variants` (product_id, option names/values, sku, price, compare_at, shopify_id) ·
`images` (id, project_id, product_id null, kind product/banner/logo, path, source upload/link/ai, position, shopify_id) ·
`banners` (id, project_id, slot, image_id, heading, sub, cta) ·
`pages` (id, project_id, kind page/policy, handle, title, body_html, status, shopify_id) ·
`menu_items` (project_id, title, url, position) ·
`publish_runs` (id, project_id, step, started, finished, ok_count, fail_count, log jsonb) ·
`ai_runs` (project_id, kind text/image, model, tokens, cost_est, at) · `checklist` (project_id, item, done_at)

Additive SQL files repo root me (`001-stores.sql` ...), `psql -f` se, ShipTrack jaisa.

## Build order (3 hisse, ~4 hafte)

### Hissa 1 (1 hafta): products end-to-end
- Repo + skeleton + login + `vps-setup/` (port 3001, PM2 `builder`, `/var/www/builder`, `/etc/builder/.env`,
  nginx `sites-available/builder` + certbot `merchantbuild.in`, DB `builder`, uploads dir).
- Store connect (OAuth + token paste) -> test -> encrypted save.
- Project; CSV upload -> products grid (title, price, variants, photos, status chip).
- Product card: photos drag-drop (multi, reorder, delete), edit title / price / tags, "AI description" (ek / sab).
- Collections auto: Type + Tags se (owner tick kare).
- **Publish products**: `productSet` handle upsert + files, collections, `publishablePublish` Online Store; per-product status; dobara = update.
- Tests: CSV parser (real-shape samples), client retry (fake fetch, THROTTLED), CSV -> GraphQL mapper.

### Hissa 2 (2 hafte): reference + theme + banners
- Reference reader + style sheet screen (edit, "phir se padho").
- Theme zip upload -> reader -> AI filler -> validator -> naya zip -> `themeCreate` (ya download + instructions) -> preview link -> Publish (`themePublish`, ya haath se).
- Banners: upload / link / AI; slots theme ke sections se; auto-resize; logo -> `fileCreate`.

### Hissa 3 (1 hafta): pages, policies, menu, shipping, checklist
- AI drafts (reference tone, store ka naam / email / address form se), owner edit, Publish (`pageCreate` / `shopPolicyUpdate` / `menuUpdate`).
- Shipping zone India (free / flat) via `deliveryProfileUpdate`.
- Checklist step (payments, domain, checkout, taxes) with Shopify admin links; project "Done" summary.

## Owner ki taraf se chahiye (pehle din)

1. DNS: `builder` A record -> VPS IP.
2. Naya GitHub repo `shopify-builder` (private) + is session ko access.
3. Shopify Dev Dashboard me ek app "Shopify Builder" (custom distribution), redirect URL `https://merchantbuild.in/api/shopify/callback`,
   client id + secret `/etc/builder/.env` me (`SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`); usi app ke liye theme exemption form bharna (main link + text dunga).
4. Env: `ADMIN_PASSWORD`, `AUTH_TOKEN_SECRET`, `BUILDER_DATA_KEY`, `DATABASE_URL`, `AI_API_KEY`, `AI_IMAGE_MODEL`, `NEXT_PUBLIC_BASE_URL`.
5. Ek dev / test store jisme pehle sab try ho.

## Verification (har hisse ke end par)

- `npm test` (csv, mapper, client retry, theme validator), `npx tsc --noEmit` 0, `npm run build`.
- Test store par end-to-end: 10 products ki real CSV + photos -> Publish -> Shopify admin me check; dobara Publish -> koi duplicate nahi; storefront pe products dikhein.
- Theme: naya zip store me, preview link, phir Publish; home page reference jaisa.
- Deploy owner ke Mac se: `ssh shiptrack-vps 'cd /var/www/builder && bash vps-setup/deploy.sh'`, `pm2 ls`, logs. ShipTrack (`tracker`, port 3000) ko koi chhed nahi.

## Rules jo yahan bhi lagenge
- Secrets sirf `/etc/builder/.env`; `.env.example` me naam. Token encrypted. Reference ka content copy nahi.
- Additive SQL hi; destructive kuch nahi bina owner ke plain words.
- Deploy / SQL owner ke Mac se one-line ssh; code cloud se build + test + commit + push.
