-- Migration 003 — Auth columns and password reset tokens table
--
-- Adds password_hash and role columns to the existing `users` table and
-- creates a `password_reset_tokens` table dedicated to one-time password
-- reset tokens. This migration only prepares the schema; no auth logic
-- is introduced here (see scope S06-00b).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Auth columns on users.
-- `password_hash` is nullable because legacy users created before auth
-- were bootstrapped do not yet have a password. `role` defaults to 'user'
-- and is constrained to the supported set ('admin', 'user').
ALTER TABLE users ADD COLUMN password_hash VARCHAR(60) NULL;
ALTER TABLE users
    ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'user'
    CHECK (role IN ('admin', 'user'));

-- One-time password reset tokens.
-- `token_hash` stores a hash (never the raw token) and has an index to
-- speed up lookups. `user_id` cascades on delete so that removing a user
-- automatically purges their outstanding reset tokens.
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash  VARCHAR(64) NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token_hash
    ON password_reset_tokens (token_hash);
