import { describe, expect, it, vi } from "vitest";

// The JWT_SECRET is read at module-load time, so we must set the env var
// BEFORE importing the token service. `vi.hoisted` guarantees this runs
// before the import is evaluated.
vi.hoisted(() => {
  vi.stubEnv("JWT_SECRET", "test-secret-for-unit-tests");
});

import jwt from "jsonwebtoken";
import { TokenService } from "../../../src/services/token.service.js";

const service = new TokenService();
const TEST_SECRET = "test-secret-for-unit-tests";

describe("TokenService", () => {
  describe("round-trip", () => {
    it("signs and verifies an access token", () => {
      const token = service.signAccess({ sub: "user-1", role: "admin" });

      const payload = service.verifyAccess(token);

      expect(payload).toMatchObject({ sub: "user-1", role: "admin" });
    });

    it("signs and verifies a refresh token", () => {
      const token = service.signRefresh({ sub: "user-2" });

      const payload = service.verifyRefresh(token);

      expect(payload).toMatchObject({ sub: "user-2" });
    });
  });

  describe("expired token", () => {
    it("throws when an access token has expired", () => {
      const expiredToken = jwt.sign(
        { sub: "user-1", role: "user" },
        TEST_SECRET,
        { algorithm: "HS256", expiresIn: "-1h" },
      );

      expect(() => service.verifyAccess(expiredToken)).toThrow();
    });

    it("throws when a refresh token has expired", () => {
      const expiredToken = jwt.sign(
        { sub: "user-1" },
        TEST_SECRET,
        { algorithm: "HS256", expiresIn: "-1h" },
      );

      expect(() => service.verifyRefresh(expiredToken)).toThrow();
    });
  });

  describe("invalid signature", () => {
    it("throws when the access token signature is tampered", () => {
      const token = service.signAccess({ sub: "user-1", role: "user" });
      const tampered = tamper(token);

      expect(() => service.verifyAccess(tampered)).toThrow();
    });

    it("throws when the refresh token signature is tampered", () => {
      const token = service.signRefresh({ sub: "user-1" });
      const tampered = tamper(token);

      expect(() => service.verifyRefresh(tampered)).toThrow();
    });
  });

  describe("wrong secret", () => {
    it("throws when the access token was signed with a different secret", () => {
      const token = jwt.sign(
        { sub: "user-1", role: "user" },
        "a-different-secret",
        { algorithm: "HS256", expiresIn: "1h" },
      );

      expect(() => service.verifyAccess(token)).toThrow();
    });

    it("throws when the refresh token was signed with a different secret", () => {
      const token = jwt.sign(
        { sub: "user-1" },
        "a-different-secret",
        { algorithm: "HS256", expiresIn: "1h" },
      );

      expect(() => service.verifyRefresh(token)).toThrow();
    });
  });
});

// --- helpers ----------------------------------------------------------------

/** Flips the last character of the signature to break it. */
function tamper(token: string): string {
  const lastChar = token[token.length - 1] ?? "A";
  const replacement = lastChar === "A" ? "B" : "A";
  return token.slice(0, -1) + replacement;
}
