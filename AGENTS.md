# Shopify Builder — rulebook for agents

Read this whole file before changing anything. Same owner, same way of working as ShipTrack
(`AadityaAggarwal2007/main-tracker-and-customer-support`): the owner is not a developer, talks
Hinglish, deploys from his Mac with one-line `ssh shiptrack-vps ...` commands; code is built, tested,
committed and pushed from the cloud session. Ask 10-12 questions before big work.

## What this is

A private web tool (one login) that builds a Shopify store: upload Shopify's product CSV, drop photos
on each product, write descriptions with AI, make collections, publish to the store; later (parts 2-3):
read a reference website into a style sheet, fill the owner's uploaded theme, make banners (upload /
link / AI image), pages, policies, menu, shipping, and a checklist for what the API cannot do
(payments, domain, checkout, taxes). The plan with every owner answer is in `PLAN.md`.

- Next.js 14 (App Router) + TypeScript (strict) + plain `pg`, PM2 app `builder` on port 3001,
  nginx site `builder`, database `builder` (role `builder_user`), secrets in `/etc/builder/.env`
  (copied to `.env.production.local` on deploy), uploads in `/var/www/builder-uploads` (served at `/uploads/`).
- ShipTrack (`tracker`, port 3000, database `tracking_crm`) runs on the same server: never touch it from here.

## Map of the code

| Area | Where |
|---|---|
| Login (one password from the env, signed 7-day tokens, Bearer header) | `src/lib/auth.ts`, `src/app/api/auth/*`, `src/app/login/page.tsx`, `src/components/AppShell.tsx` (sends to /login, warns about missing env) |
| Store tokens at rest (AES-256-GCM, `BUILDER_DATA_KEY`, fail closed) | `src/lib/crypto.ts`, `src/lib/stores.ts` (`storeAuth` = the only place a token is decrypted; never sent to a screen) |
| Shopify connect: OAuth (Dev Dashboard app, offline token), "Connect directly" (client credentials grant for a store of the app's own organization; ~24 h token renewed by `storeAuth`, `sql/002-token-expiry.sql`), or a pasted legacy `shpat_` token | `src/lib/shopify/oauth.ts` (`normalizeShop`, `SCOPES`, HMAC check, one-time state), `src/app/api/shopify/connect` + `callback`, `src/app/api/stores/*`, `src/app/stores/page.tsx` |
| Shopify GraphQL client (Admin API `2026-01`, throttle wait, retry on THROTTLED / 429 / 5xx, never on 401 / 403) | `src/lib/shopify/client.ts` (`shopifyGraphql`, `assertNoUserErrors`); the calls in `src/lib/shopify/admin.ts` (`getShop`, `onlineStorePublicationId`, `productSet` upsert by handle, `ensureCollection`, `addProductsToCollection`, `publishToOnlineStore`) |
| Product CSV reader (Shopify's export format; pure) | `src/lib/csv/product-csv.ts` (`parseProductCsv`: products by handle, variants, image links, per-row problems, caps) |
| Products -> Shopify input, proposed collections (pure) | `src/lib/products/mapper.ts` (`toProductSetInput`, `proposeCollections`) |
| Publish products run (per-item log in `publish_runs`) | `src/lib/publish/products.ts` (`publishProducts`), route `POST /api/projects/[id]/publish` |
| Uploads (sharp re-encode, random names, outside the repo) | `src/lib/uploads.ts`, `src/app/uploads/[...path]/route.ts` (dev / fallback; nginx alias in production), routes under `/api/projects/[id]/products/[pid]/images`, CSV links via `/api/projects/[id]/images/fetch` |
| AI (OpenRouter through the openai SDK: cheap model first, chain, `ai_runs` bill) | `src/lib/ai/models.ts` (`askText`, `textModels`, `imageModel`), `describe.ts` (the description prompt + `cleanHtml`), `describe-run.ts` |
| Reference site (part 2a, owner 2026-10-05) | `src/lib/reference/read-site.ts` (fetch the page, stylesheets, /policies/*, Shopify public products.json / collections.json; structure only), `style-sheet.ts` (pure: `STYLE_SYSTEM` never copies text, `parseStyleSheet` strict, `cleanStyleSheet` for edits), `reference-run.ts`; route `/api/projects/[id]/reference` (GET / POST read / PATCH edits); `ReferenceStep.tsx`. The stored read drops the text sample and policy text (rule 4). Tests `scripts/tests/reference.js` |
| Theme (part 2b) | `src/lib/theme/theme-zip.ts` (jszip read / write, folder prefix), `theme-schema.ts` (pure: settings_schema, section `{% schema %}`, index.json, home-page-only sections), `theme-plan.ts` (pure: `PLAN_SYSTEM` + `planPrompt` with the theme's REAL ids, `validatePlan` drops anything the schema does not have, `applyPlan` writes settings_data.json `current` + a new templates/index.json, images as `banner:<slot>` tokens -> `shopify://shop_images/<file>`; **header / footer groups (2026-10-05, owner: "logo, collection kuch nai aya")**: `theme-zip.ts` also reads `sections/*-group.json`, `theme-schema.ts` `parseGroup` lists the sections each group holds (`groups`) and keeps every section schema (`allSections`), the prompt lists them by key (`groupLines`, image / text settings only) and asks for the logo (`banner:logo`), the announcement line and a collection handle on EVERY collection block; the plan's `groups` (file -> key -> settings) is validated against the existing sections only and `applyGroup` writes them back into the group file, order untouched), `theme-run.ts` (upload zip to `UPLOADS_DIR/themes/<project>.zip`, plan, build = `fileCreate` of the used banners / logo with fixed names + the built zip at `/uploads/themes/<project>-built.zip`, push = `themeCreate` from that URL (ACCESS_DENIED -> tell the owner to upload the zip by hand), preview `?preview_theme_id=`, `themePublish`); routes under `/api/projects/[id]/theme/*`; `ThemeStep.tsx`. Tests `scripts/tests/theme.js` |
| Pages, policies, menus (part 3) | `sql/004-pages-checklist.sql` (projects.store_facts, pages.updated_at, unique pages(project_id, handle) / checklist(project_id, item)). `src/lib/pages/pages-ai.ts` (pure: `StoreFacts` / `cleanFacts` = the facts form, `PAGE_KINDS` = about-us, contact, faq + the 4 policies, `PAGES_SYSTEM` / `pagesPrompt` (facts + the style sheet's tone + product types; never an invented fact), `parsePages` / `cleanHtml` (p, h2, h3, lists, strong, em, br, a only; at least 4 pages), `menuItems` = main menu (Home, Shop all, up to 5 collections, About, Contact) + footer (Search, FAQ, the policies)), `pages-run.ts` (`saveFacts`, `draftPages` = one `askText` call, rows in `pages`, `publishPages` = `pageUpsert` by handle for pages, `shopPolicyUpdate` for the 4 policies (`POLICY_TYPES`), then `menuUpsert` main-menu + footer), route `GET/POST/PATCH /api/projects/[id]/pages` (POST actions facts / draft / publish; PATCH edits one page's title / body), `PagesStep.tsx`. Tests `scripts/tests/pages.js` |
| Checklist (part 3) | `src/lib/pages/checklist.ts` (`CHECKLIST`: 11 things the Admin API cannot set: currency INR, store details, payments, checkout, shipping, taxes, domain, storefront password, read the policies, notification emails, the ShipTrack widget; each with its admin path), table `checklist(project_id, item, done_at)`, route `GET/PATCH /api/projects/[id]/checklist`, `ChecklistStep.tsx` (link to `https://admin.shopify.com/store/<name><path>` + a tick). |
| Banners (part 2c) | `src/lib/ai/images.ts` (`generateImage` through OpenRouter chat completions with `modalities: ['image','text']`, the product photo as input; `bannerPrompt`), route `/api/projects/[id]/banners` (GET / POST upload-link-ai / DELETE; one image per slot, `images.kind` banner or logo, `alt` = `<slot>|<description>`; slots logo, hero, hero_mobile, offer, about, collection_1..4), `BannersStep.tsx`. Each AI image is an `ai_runs` row (~$0.04) |
| Screens | `src/app/projects/page.tsx` (list / create), `src/app/projects/[id]/page.tsx` (steps sidebar) + `_components/` (`ProductsStep`, `ProductDialog`, `CollectionsPanel`, `PublishPanel`) |
| Database | `sql/*.sql`, additive only, applied by `vps-setup/deploy.sh` on every deploy (safe to run twice) |
| Tests | `npm test` = `scripts/tests/{csv,mapper,client,auth}.js` (transpile the src file under test; a fake fetch for the client). Keep `npx tsc --noEmit` at 0 and `npm run build` green. |
| VPS | `vps-setup/setup.sh` (once: folders, database, nginx, SSL), `vps-setup/configure.sh` (fills `/etc/builder/.env` by asking; generates the secrets; never prints them), `vps-setup/deploy.sh` (every deploy) |

## Rules

1. **Secrets never in Git.** Real values only in `/etc/builder/.env`; every `process.env.X` the code reads is in `.env.example` with no value. Never print a token, never log one.
2. **Store tokens are always encrypted** (`seal` / `open` in `crypto.ts`). A plain-text token column is a bug.
3. **Nothing in Shopify is ever deleted by this tool.** Deleting a project / product / store here changes the tool only. Publishing is an upsert by handle: pressing again updates, never duplicates.
4. **Reference websites are never copied**: only structure, colours, fonts, tone. No text, no photos.
5. **Additive SQL only**; nothing that drops or deletes rows without the owner's plain-words OK.
6. **The owner deploys**: `ssh shiptrack-vps 'cd /var/www/builder && bash vps-setup/deploy.sh'`; check with `pm2 ls` and `pm2 logs builder --lines 50 --nostream`. Never edit files on the server.
7. What the Admin API cannot set (payment providers, domain, checkout settings, taxes) is a checklist with links, never a fake "done".

## Known API facts (verified 2026-10-05, see PLAN.md)

- Legacy admin-created custom apps cannot be created since 2026-01-01: new stores connect through OAuth; old `shpat_` tokens still work.
- `productSet(identifier: {handle})` upserts (2025-04+); products and collections must be published to the Online Store (`publishablePublish`) or they stay hidden.
- Theme file writes (`themeFilesUpsert`, part 2) may need Shopify's write_themes exemption for this app; the zip path (owner uploads the built zip) is the fallback.
