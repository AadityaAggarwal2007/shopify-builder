-- Part 3: pages, policies, menu, checklist (2026-10-05). Additive, safe to run twice.
SET ROLE builder_user;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS store_facts jsonb;      -- what the owner typed for the pages (name, email, phone, address, shipping days, return window...)
ALTER TABLE pages ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS pages_project_handle ON pages(project_id, handle);
CREATE UNIQUE INDEX IF NOT EXISTS checklist_project_item ON checklist(project_id, item);
