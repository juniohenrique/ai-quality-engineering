-- Rollback migration 003 — removes password reset tokens table and
-- auth columns added to `users`. Reverses `003_auth_columns.up.sql`.

DROP INDEX IF EXISTS idx_password_reset_tokens_token_hash;
DROP TABLE IF EXISTS password_reset_tokens;

ALTER TABLE users DROP COLUMN IF EXISTS role;
ALTER TABLE users DROP COLUMN IF EXISTS password_hash;
