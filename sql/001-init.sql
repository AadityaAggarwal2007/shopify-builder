-- Shopify Builder: first schema (2026-10-05). Additive, safe to run twice:
--   sudo -u postgres psql -d builder -v ON_ERROR_STOP=1 -f sql/001-init.sql
-- The database and role come from vps-setup/setup.sh (CREATE DATABASE builder OWNER builder_user).
-- deploy.sh runs this as postgres; SET ROLE makes builder_user own every table (gen_random_uuid()
-- is built into PostgreSQL 13+, no extension needed).

SET ROLE builder_user;

-- A Shopify store the tool may write to. The token is an AES-256-GCM blob (src/lib/crypto.ts),
-- never plain text.
CREATE TABLE IF NOT EXISTS stores (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  shop_domain  text NOT NULL UNIQUE,            -- xxx.myshopify.com
  token_enc    text NOT NULL,
  scopes       text NOT NULL DEFAULT '',
  connected_via text NOT NULL DEFAULT 'oauth',  -- oauth | token
  last_ok_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- One store build. Steps: products, reference, banners, theme, pages, checklist.
CREATE TABLE IF NOT EXISTS projects (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id         uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name             text NOT NULL,
  status           text NOT NULL DEFAULT 'draft',   -- draft | live | archived
  reference_url    text,
  style_sheet      jsonb,
  theme_file       text,
  shopify_theme_id text,
  publication_id   text,                            -- the Online Store publication (cached)
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS projects_store_idx ON projects(store_id);

-- Products from the CSV (one row per handle), edited in the tool, then pushed.
CREATE TABLE IF NOT EXISTS products (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  handle        text NOT NULL,
  title         text NOT NULL,
  body_html     text NOT NULL DEFAULT '',
  vendor        text NOT NULL DEFAULT '',
  product_type  text NOT NULL DEFAULT '',
  tags          text[] NOT NULL DEFAULT '{}',
  option_names  text[] NOT NULL DEFAULT '{}',      -- e.g. {Size, Color}
  status        text NOT NULL DEFAULT 'draft',     -- draft | pushed | error
  shopify_id    text,
  error         text,
  pushed_at     timestamptz,
  ai_described_at timestamptz,
  position      integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, handle)
);

CREATE TABLE IF NOT EXISTS variants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  position    integer NOT NULL DEFAULT 0,
  options     text[] NOT NULL DEFAULT '{}',        -- values in option_names order
  sku         text NOT NULL DEFAULT '',
  price       numeric(12,2) NOT NULL DEFAULT 0,
  compare_at  numeric(12,2),
  shopify_id  text
);
CREATE INDEX IF NOT EXISTS variants_product_idx ON variants(product_id);

-- Every image the tool holds: product photos, banners, logos. `path` is relative to UPLOADS_DIR
-- and public at /uploads/<path>, which is what Shopify downloads.
CREATE TABLE IF NOT EXISTS images (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  product_id  uuid REFERENCES products(id) ON DELETE CASCADE,
  kind        text NOT NULL DEFAULT 'product',     -- product | banner | logo
  path        text NOT NULL,
  source      text NOT NULL DEFAULT 'upload',      -- upload | link | ai | csv
  source_url  text,
  width       integer,
  height      integer,
  bytes       integer,
  position    integer NOT NULL DEFAULT 0,
  alt         text NOT NULL DEFAULT '',
  shopify_id  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS images_product_idx ON images(product_id);
CREATE INDEX IF NOT EXISTS images_project_idx ON images(project_id);

-- Collections the tool proposes from Type / Tags; `enabled` = the owner's tick.
CREATE TABLE IF NOT EXISTS collections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  handle      text NOT NULL,
  title       text NOT NULL,
  rule_kind   text NOT NULL DEFAULT 'type',        -- type | tag | manual
  rule_value  text NOT NULL DEFAULT '',
  enabled     boolean NOT NULL DEFAULT true,
  shopify_id  text,
  status      text NOT NULL DEFAULT 'draft',
  error       text,
  UNIQUE (project_id, handle)
);

-- One row per Publish press, with the per-item log.
CREATE TABLE IF NOT EXISTS publish_runs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  step        text NOT NULL,                       -- products | collections | theme | pages | menu
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  ok_count    integer NOT NULL DEFAULT 0,
  fail_count  integer NOT NULL DEFAULT 0,
  log         jsonb NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS publish_runs_project_idx ON publish_runs(project_id, started_at DESC);

-- Every AI call (text or image), for the bill.
CREATE TABLE IF NOT EXISTS ai_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid REFERENCES projects(id) ON DELETE SET NULL,
  kind          text NOT NULL,                     -- describe | style | theme | page | image
  model         text NOT NULL,
  prompt_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  images        integer NOT NULL DEFAULT 0,
  cost_usd      numeric(10,5) NOT NULL DEFAULT 0,
  ms            integer NOT NULL DEFAULT 0,
  ok            boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Small key / value settings (the Online Store publication id etc.).
CREATE TABLE IF NOT EXISTS settings (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
