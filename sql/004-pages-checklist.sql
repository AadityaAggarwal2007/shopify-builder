-- Part 3: pages, policies, menu, checklist (2026-10-05). Additive, safe to run twice.
-- (001-init.sql never created pages / checklist: they are made here.)
SET ROLE builder_user;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS store_facts jsonb;      -- what the owner typed for the pages (name, email, phone, address, shipping days, return window...)

CREATE TABLE IF NOT EXISTS pages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind        text NOT NULL DEFAULT 'page',          -- page | policy
  handle      text NOT NULL,                         -- about-us, contact, faq, shipping-policy, refund-policy, privacy-policy, terms-of-service
  title       text NOT NULL DEFAULT '',
  body_html   text NOT NULL DEFAULT '',
  status      text NOT NULL DEFAULT 'draft',         -- draft | pushed | error
  shopify_id  text,
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE pages ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS pages_project_handle ON pages(project_id, handle);

CREATE TABLE IF NOT EXISTS checklist (
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  item        text NOT NULL,
  done_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS checklist_project_item ON checklist(project_id, item);
