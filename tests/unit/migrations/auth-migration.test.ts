import { readFile } from "node:fs/promises";
import { URL } from "node:url";
import { describe, expect, it } from "vitest";

const upPath = new URL("../../../migrations/003_auth_columns.up.sql", import.meta.url);
const downPath = new URL("../../../migrations/003_auth_columns.down.sql", import.meta.url);

describe("auth columns migration", () => {
  it("adds password_hash and role to users and creates password_reset_tokens", async () => {
    const sql = await readFile(upPath, "utf8");

    expect(sql).toMatch(/ALTER TABLE users ADD COLUMN password_hash VARCHAR\(60\) NULL/i);
    expect(sql).toMatch(/ALTER TABLE users\s+ADD COLUMN role VARCHAR\(20\) NOT NULL DEFAULT 'user'/i);
    expect(sql).toMatch(/CHECK \(role IN \('admin',\s*'user'\)\)/i);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS password_reset_tokens/i);
    expect(sql).toMatch(/id\s+UUID PRIMARY KEY DEFAULT gen_random_uuid\(\)/i);
    expect(sql).toMatch(/user_id\s+UUID NOT NULL REFERENCES users \(id\) ON DELETE CASCADE/i);
    expect(sql).toMatch(/token_hash\s+VARCHAR\(64\)\s+NOT NULL/i);
    expect(sql).toMatch(/expires_at\s+TIMESTAMPTZ\s+NOT NULL/i);
    expect(sql).toMatch(/used_at\s+TIMESTAMPTZ\s+NULL/i);
    expect(sql).toMatch(/created_at\s+TIMESTAMPTZ\s+NOT NULL\s+DEFAULT NOW\(\)/i);
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token_hash/i);
    expect(sql).toMatch(/ON password_reset_tokens \(token_hash\)/i);
  });

  it("reverts by dropping the table and columns", async () => {
    const sql = await readFile(downPath, "utf8");

    expect(sql).toMatch(/DROP TABLE IF EXISTS password_reset_tokens/i);
    expect(sql).toMatch(/ALTER TABLE users DROP COLUMN IF EXISTS role/i);
    expect(sql).toMatch(/ALTER TABLE users DROP COLUMN IF EXISTS password_hash/i);
  });
});
