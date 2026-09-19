import { describe, expect, it, vi } from "vitest";
import { waitForDatabase } from "../../../src/db/client.js";

describe("waitForDatabase", () => {
  it("returns true when the database responds", async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };

    await expect(waitForDatabase(pool, { delayMs: 0 })).resolves.toBe(true);
    expect(pool.query).toHaveBeenCalledWith("SELECT 1");
  });

  it("retries and returns false when the database stays unavailable", async () => {
    const pool = { query: vi.fn().mockRejectedValue(new Error("unavailable")) };

    await expect(waitForDatabase(pool, { attempts: 3, delayMs: 0 })).resolves.toBe(false);
    expect(pool.query).toHaveBeenCalledTimes(3);
  });
});
