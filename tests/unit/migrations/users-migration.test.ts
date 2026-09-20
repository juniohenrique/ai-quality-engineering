import { readFile } from "node:fs/promises";
import { URL } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../../../migrations/001_create_users.up.sql", import.meta.url);

describe("users migration", () => {
  it("defines the users table and its required constraints", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toMatch(/CREATE TABLE users/i);
    expect(sql).toMatch(/id UUID PRIMARY KEY/i);
    expect(sql).toMatch(/email VARCHAR\(255\) NOT NULL UNIQUE/i);
    expect(sql).toMatch(/user_name VARCHAR\(255\) NOT NULL/i);
    expect(sql).toMatch(/created_at TIMESTAMPTZ NOT NULL DEFAULT NOW\(\)/i);
    expect(sql).toMatch(/updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW\(\)/i);
  });
});
