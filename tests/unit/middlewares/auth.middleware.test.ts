import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IncomingMessage } from "node:http";
import jwt from "jsonwebtoken";
import { authenticate, type AuthContext } from "../../../src/middlewares/auth.middleware.js";

// The JWT_SECRET is read at module-load time by TokenService, so we must set
// the env var BEFORE importing the middleware (which imports TokenService).
// We also create the blacklist mock inside vi.hoisted so it is available when
// the mocked TokenBlacklistService is instantiated during module load.
const { isBlacklistedMock } = vi.hoisted(() => {
  vi.stubEnv("JWT_SECRET", "test-secret-for-unit-tests");

  return { isBlacklistedMock: vi.fn() };
});

// Mock the blacklist service with a shared, controllable vi.fn().
vi.mock("../../../src/services/token-blacklist.service.js", () => ({
  TokenBlacklistService: class {
    isBlacklisted = isBlacklistedMock;
  },
}));

const TEST_SECRET = "test-secret-for-unit-tests";

function createRequest(headers: Record<string, string | undefined>): IncomingMessage {
  return { headers } as unknown as IncomingMessage;
}

function signAccess(payload: { sub: string; role: string; jti?: string }): string {
  return jwt.sign(payload, TEST_SECRET, { algorithm: "HS256" });
}

describe("authenticate", () => {
  beforeEach(() => {
    isBlacklistedMock.mockReset();
    // By default, tokens are NOT blacklisted.
    isBlacklistedMock.mockReturnValue(false);
  });

  it("returns AuthContext with userId, role and jti for a valid token", () => {
    const token = signAccess({ sub: "user-1", role: "admin", jti: "token-jti-1" });
    const request = createRequest({ authorization: `Bearer ${token}` });

    const context = authenticate(request);

    expect(context).toEqual<AuthContext>({
      userId: "user-1",
      role: "admin",
      jti: "token-jti-1",
    });
  });

  it("returns null when the Authorization header is absent", () => {
    const request = createRequest({});

    expect(authenticate(request)).toBeNull();
  });

  it("returns null when the Authorization header is malformed", () => {
    const request = createRequest({ authorization: "NotBearer some-token" });

    expect(authenticate(request)).toBeNull();
  });

  it("returns null when the token is invalid", () => {
    const request = createRequest({ authorization: "Bearer not-a-real-jwt" });

    expect(authenticate(request)).toBeNull();
  });

  it("returns null when the token has expired", () => {
    const expiredToken = jwt.sign(
      { sub: "user-1", role: "user", jti: "expired-jti" },
      TEST_SECRET,
      { algorithm: "HS256", expiresIn: "-1h" },
    );
    const request = createRequest({ authorization: `Bearer ${expiredToken}` });

    expect(authenticate(request)).toBeNull();
  });

  it("returns null when the token is blacklisted", () => {
    const token = signAccess({ sub: "user-1", role: "user", jti: "blacklisted-jti" });
    isBlacklistedMock.mockReturnValue(true);
    const request = createRequest({ authorization: `Bearer ${token}` });

    expect(authenticate(request)).toBeNull();
  });
});
