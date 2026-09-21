import { readFile } from "node:fs/promises";
import { URL } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../../../migrations/002_create_payments.up.sql", import.meta.url);

describe("payments migration", () => {
  it("creates the payments table with an idempotency_key UNIQUE constraint", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS payments/i);
    expect(sql).toMatch(/id\s+UUID PRIMARY KEY/i);
    expect(sql).toMatch(/idempotency_key\s+VARCHAR\(255\)\s+NOT NULL\s+UNIQUE/i);
    expect(sql).toMatch(/user_id\s+VARCHAR\(255\)\s+NOT NULL/i);
    expect(sql).toMatch(/amount\s+INTEGER\s+NOT NULL/i);
    expect(sql).toMatch(/currency\s+VARCHAR\(3\)\s+NOT NULL/i);
    expect(sql).toMatch(/status\s+VARCHAR\(50\)\s+NOT NULL/i);
    expect(sql).toMatch(/created_at\s+TIMESTAMPTZ\s+NOT NULL\s+DEFAULT NOW\(\)/i);
  });
});
