import { describe, expect, it } from "vitest";
import { loadEnv } from "../../../src/config/env.js";

describe("loadEnv", () => {
  it("loads and normalizes the application environment", () => {
    expect(
      loadEnv({
        DATABASE_URL: " postgres://localhost/quality ",
        PORT: "3100",
      }),
    ).toEqual({
      databaseUrl: "postgres://localhost/quality",
      port: 3100,
    });
  });

  it("fails when DATABASE_URL is missing", () => {
    expect(() => loadEnv({ PORT: "3000" })).toThrow("DATABASE_URL is required");
  });

  it("fails when PORT is invalid", () => {
    expect(() =>
      loadEnv({ DATABASE_URL: "postgres://localhost/quality", PORT: "invalid" }),
    ).toThrow("PORT must be a valid TCP port");
  });
});
