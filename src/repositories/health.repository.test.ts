import { describe, expect, it, vi } from "vitest";
import { HealthRepository } from "./health.repository.js";

describe("HealthRepository", () => {
  it("returns true when the database query succeeds", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const repository = new HealthRepository({ query });

    await expect(repository.checkDatabaseHealth()).resolves.toBe(true);
    expect(query).toHaveBeenCalledWith("SELECT 1");
  });

  it("returns false when the database query fails", async () => {
    const query = vi.fn().mockRejectedValue(new Error("database unavailable"));
    const repository = new HealthRepository({ query });

    await expect(repository.checkDatabaseHealth()).resolves.toBe(false);
  });
});
