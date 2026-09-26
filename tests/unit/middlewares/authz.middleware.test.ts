import { describe, expect, it } from "vitest";
import { requireRole } from "../../../src/middlewares/authz.middleware.js";
import type { AuthContext } from "../../../src/middlewares/auth.middleware.js";

function createContext(role: "admin" | "user"): AuthContext {
  return {
    userId: "user-1",
    role,
    jti: "some-jti",
  };
}

describe("requireRole", () => {
  it("returns true when an admin context requires admin", () => {
    const context = createContext("admin");

    expect(requireRole(context, "admin")).toBe(true);
  });

  it("returns false when a user context requires admin", () => {
    const context = createContext("user");

    expect(requireRole(context, "admin")).toBe(false);
  });

  it("returns true when a user context requires user", () => {
    const context = createContext("user");

    expect(requireRole(context, "user")).toBe(true);
  });
});
