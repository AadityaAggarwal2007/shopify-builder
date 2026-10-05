-- Part 2: reference site + theme (2026-10-05). Additive, safe to run twice.
SET ROLE builder_user;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS reference_read jsonb;     -- what the reader found (facts)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS reference_read_at timestamptz;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS theme_plan jsonb;         -- the filled settings / index the AI proposed
ALTER TABLE projects ADD COLUMN IF NOT EXISTS theme_built_at timestamptz;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS theme_preview_url text;
