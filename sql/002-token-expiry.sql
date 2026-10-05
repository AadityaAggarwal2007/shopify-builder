-- Client-credentials tokens (Dev Dashboard app, the owner's own stores) expire after ~24 h and are
-- refreshed by src/lib/stores.ts storeAuth(); OAuth / pasted tokens have no expiry (NULL).
SET ROLE builder_user;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS token_expires_at timestamptz;
