import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IncomingMessage } from "node:http";
import jwt from "jsonwebtoken";
import {
  AuthController,
  type AuthDependencies,
} from "../../../src/controllers/auth.controller.js";
import type { User } from "../../../src/domain/user.js";

// ─── Hoisted mocks ─────────────────────────────────────────────────────
// `vi.mock` factory is hoisted to the top of the file, before imports.
// We create the controllable mock function inside `vi.hoisted` so it is
// available when the factory runs.

const { decodeMock } = vi.hoisted(() => ({
  decodeMock: vi.fn(),
}));

vi.mock("jsonwebtoken", async (importActual) => {
  const actual = await importActual<typeof jwt>();
  return {
    default: {
      ...actual,
      decode: (...args: Parameters<typeof jwt.decode>) => decodeMock(...args),
    },
  };
});

// ─── Helpers ───────────────────────────────────────────────────────────

function createResponse() {
  let statusCode: number | undefined;
  let body = "";

  return {
    response: {
      writeHead: (code: number) => {
        statusCode = code;
      },
      end: (responseBody?: string) => {
        body = responseBody ?? "";
      },
      get statusCode() {
        return statusCode;
      },
      get body() {
        return body;
      },
    },
    getStatusCode: () => statusCode,
    getBody: () => body,
  };
}

function createRequest(authorization?: string): IncomingMessage {
  return {
    headers: {
      ...(authorization !== undefined ? { authorization } : {}),
    },
  } as unknown as IncomingMessage;
}

function makeUser(
  overrides: Partial<{
    id: string;
    email: string;
    userName: string;
    passwordHash: string | null;
    role: "admin" | "user";
  }> = {},
): User {
  const passwordHash =
    overrides.passwordHash !== undefined
      ? overrides.passwordHash
      : "hashed-password";

  return {
    id: overrides.id ?? "user-1",
    email: overrides.email ?? "test@example.com",
    userName: overrides.userName ?? "Ada Lovelace",
    passwordHash,
    role: overrides.role ?? "user",
  } as unknown as User;
}

function createMockDependencies() {
  return {
    userService: {
      findByEmail: vi.fn(),
      findUserById: vi.fn(),
    },
    passwordService: {
      hash: vi.fn(),
      verify: vi.fn(),
    },
    tokenService: {
      signAccess: vi.fn(),
      signRefresh: vi.fn(),
      verifyAccess: vi.fn(),
      verifyRefresh: vi.fn(),
    },
    blacklist: {
      add: vi.fn(),
      isBlacklisted: vi.fn(),
    },
  };
}

const TEST_SECRET = "test-secret-for-unit-tests";

// ─── Tests ─────────────────────────────────────────────────────────────

describe("POST /auth/login", () => {
  let deps: ReturnType<typeof createMockDependencies>;
  let controller: AuthController;

  beforeEach(() => {
    vi.stubEnv("JWT_SECRET", TEST_SECRET);
    decodeMock.mockReset();
    deps = createMockDependencies();
    controller = new AuthController(deps as unknown as AuthDependencies);
  });

  it("returns 400 for invalid input", async () => {
    const output = createResponse();

    await controller.handleLogin(null, output.response as never);

    expect(output.getStatusCode()).toBe(400);
    expect(JSON.parse(output.getBody())).toEqual({
      error: "invalid_request",
      message: "Invalid request",
    });
  });

  it("returns 401 when user is not found (timing-safe dummy verify)", async () => {
    deps.userService.findByEmail.mockResolvedValue(undefined);
    deps.passwordService.verify.mockResolvedValue(false);

    const output = createResponse();

    await controller.handleLogin(
      { email: "nobody@example.com", password: "password" },
      output.response as never,
    );

    expect(deps.userService.findByEmail).toHaveBeenCalledWith("nobody@example.com");
    expect(deps.passwordService.verify).toHaveBeenCalledWith("password", expect.stringContaining("$2b$12$"));
    expect(output.getStatusCode()).toBe(401);
    expect(JSON.parse(output.getBody())).toEqual({
      error: "invalid_credentials",
      message: "Invalid credentials",
    });
  });

  it("returns 401 when user has null passwordHash (timing-safe dummy verify)", async () => {
    deps.userService.findByEmail.mockResolvedValue(makeUser({ passwordHash: null }));
    deps.passwordService.verify.mockResolvedValue(false);

    const output = createResponse();

    await controller.handleLogin(
      { email: "test@example.com", password: "password" },
      output.response as never,
    );

    expect(deps.passwordService.verify).toHaveBeenCalledWith("password", expect.stringContaining("$2b$12$"));
    expect(output.getStatusCode()).toBe(401);
  });

  it("returns 401 when password verification fails", async () => {
    deps.userService.findByEmail.mockResolvedValue(makeUser());
    deps.passwordService.verify.mockResolvedValue(false);

    const output = createResponse();

    await controller.handleLogin(
      { email: "test@example.com", password: "wrong" },
      output.response as never,
    );

    expect(deps.passwordService.verify).toHaveBeenCalledWith("wrong", "hashed-password");
    expect(output.getStatusCode()).toBe(401);
    expect(JSON.parse(output.getBody())).toEqual({
      error: "invalid_credentials",
      message: "Invalid credentials",
    });
  });

  it("passes the email through to userService.findByEmail without normalization (service owns normalization)", async () => {
    deps.userService.findByEmail.mockResolvedValue(makeUser());
    deps.passwordService.verify.mockResolvedValue(true);
    deps.tokenService.signAccess.mockReturnValue("access.jwt.token");
    deps.tokenService.signRefresh.mockReturnValue("refresh.jwt.token");

    const output = createResponse();

    await controller.handleLogin(
      { email: "  TEST@EXAMPLE.COM  ", password: "password" },
      output.response as never,
    );

    expect(deps.userService.findByEmail).toHaveBeenCalledWith("  TEST@EXAMPLE.COM  ");
  });

  it("returns 200 with access and refresh tokens on valid login", async () => {
    deps.userService.findByEmail.mockResolvedValue(makeUser({ id: "user-1", role: "admin" }));
    deps.passwordService.verify.mockResolvedValue(true);
    deps.tokenService.signAccess.mockReturnValue("access.jwt.token");
    deps.tokenService.signRefresh.mockReturnValue("refresh.jwt.token");

    const output = createResponse();

    await controller.handleLogin(
      { email: "test@example.com", password: "password" },
      output.response as never,
    );

    expect(deps.tokenService.signAccess).toHaveBeenCalledWith({
      sub: "user-1",
      role: "admin",
    });
    expect(deps.tokenService.signRefresh).toHaveBeenCalledWith({ sub: "user-1" });
    expect(output.getStatusCode()).toBe(200);
    expect(JSON.parse(output.getBody())).toEqual({
      accessToken: "access.jwt.token",
      refreshToken: "refresh.jwt.token",
    });
  });
});

// ─── handleRefresh ─────────────────────────────────────────────────────

describe("POST /auth/refresh", () => {
  let deps: ReturnType<typeof createMockDependencies>;
  let controller: AuthController;

  beforeEach(() => {
    vi.stubEnv("JWT_SECRET", TEST_SECRET);
    decodeMock.mockReset();
    deps = createMockDependencies();
    controller = new AuthController(deps as unknown as AuthDependencies);
  });

  it("returns 400 for invalid input", async () => {
    const output = createResponse();

    await controller.handleRefresh(null, output.response as never);

    expect(output.getStatusCode()).toBe(400);
    expect(JSON.parse(output.getBody())).toEqual({
      error: "invalid_request",
      message: "Invalid request",
    });
  });

  it("returns 401 when refresh token is invalid", async () => {
    deps.tokenService.verifyRefresh.mockImplementation(() => {
      throw new Error("invalid token");
    });

    const output = createResponse();

    await controller.handleRefresh(
      { refreshToken: "invalid-token" },
      output.response as never,
    );

    expect(output.getStatusCode()).toBe(401);
    expect(JSON.parse(output.getBody())).toEqual({
      error: "invalid_token",
      message: "Invalid token",
    });
  });

  it("returns 401 when refresh token has no jti", async () => {
    deps.tokenService.verifyRefresh.mockReturnValue({ sub: "user-1" });
    decodeMock.mockReturnValue({ sub: "user-1" });

    const output = createResponse();

    await controller.handleRefresh(
      { refreshToken: "token-without-jti" },
      output.response as never,
    );

    expect(output.getStatusCode()).toBe(401);
    expect(JSON.parse(output.getBody())).toEqual({
      error: "invalid_token",
      message: "Invalid token",
    });
  });

  it("returns 401 when refresh token jti is blacklisted", async () => {
    const refreshToken = "a.real.refresh.jwt";
    deps.tokenService.verifyRefresh.mockReturnValue({ sub: "user-1" });
    decodeMock.mockReturnValue({
      sub: "user-1",
      jti: "old-jti",
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    deps.blacklist.isBlacklisted.mockReturnValue(true);

    const output = createResponse();

    await controller.handleRefresh(
      { refreshToken },
      output.response as never,
    );

    expect(deps.blacklist.isBlacklisted).toHaveBeenCalledWith("old-jti");
    expect(output.getStatusCode()).toBe(401);
    expect(JSON.parse(output.getBody())).toEqual({
      error: "invalid_token",
      message: "Invalid token",
    });
  });

  it("issues a new token pair and blacklists the old jti on success (rotation)", async () => {
    const oldJti = "old-refresh-jti";
    const oldExp = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
    const refreshToken = "a.real.refresh.jwt";
    deps.tokenService.verifyRefresh.mockReturnValue({ sub: "user-1" });
    decodeMock.mockReturnValue({
      sub: "user-1",
      jti: oldJti,
      exp: oldExp,
    });
    deps.blacklist.isBlacklisted.mockReturnValue(false);
    deps.tokenService.signAccess.mockReturnValue("new-access-token");
    deps.tokenService.signRefresh.mockReturnValue("new-refresh-token");
    deps.userService.findUserById.mockResolvedValue(
      makeUser({ id: "user-1", role: "admin" }),
    );

    const output = createResponse();

    await controller.handleRefresh(
      { refreshToken },
      output.response as never,
    );

    expect(deps.blacklist.isBlacklisted).toHaveBeenCalledWith(oldJti);
    expect(deps.blacklist.add).toHaveBeenCalledWith(oldJti, new Date(oldExp * 1000));
    expect(deps.userService.findUserById).toHaveBeenCalledWith("user-1");
    expect(deps.tokenService.signAccess).toHaveBeenCalledWith({ sub: "user-1", role: "admin" });
    expect(deps.tokenService.signRefresh).toHaveBeenCalledWith({ sub: "user-1" });
    expect(output.getStatusCode()).toBe(200);
    expect(JSON.parse(output.getBody())).toEqual({
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
    });
  });

  it("uses the current user role from the database, not the token role", async () => {
    const oldJti = "old-refresh-jti";
    const oldExp = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
    const refreshToken = "a.real.refresh.jwt";
    deps.tokenService.verifyRefresh.mockReturnValue({ sub: "user-1" });
    // The refresh token carries no role claim at all.
    decodeMock.mockReturnValue({
      sub: "user-1",
      jti: oldJti,
      exp: oldExp,
    });
    deps.blacklist.isBlacklisted.mockReturnValue(false);
    deps.tokenService.signAccess.mockReturnValue("new-access-token");
    deps.tokenService.signRefresh.mockReturnValue("new-refresh-token");
    // User is an admin in the DB — the new access token must carry role "admin".
    deps.userService.findUserById.mockResolvedValue(
      makeUser({ id: "user-1", role: "admin" }),
    );

    const output = createResponse();

    await controller.handleRefresh(
      { refreshToken },
      output.response as never,
    );

    expect(deps.userService.findUserById).toHaveBeenCalledWith("user-1");
    expect(deps.tokenService.signAccess).toHaveBeenCalledWith({
      sub: "user-1",
      role: "admin",
    });
    expect(output.getStatusCode()).toBe(200);
  });

  it("returns 401 when user no longer exists during refresh", async () => {
    const oldJti = "old-refresh-jti";
    const oldExp = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
    const refreshToken = "a.real.refresh.jwt";
    deps.tokenService.verifyRefresh.mockReturnValue({ sub: "user-1" });
    decodeMock.mockReturnValue({
      sub: "user-1",
      jti: oldJti,
      exp: oldExp,
    });
    deps.blacklist.isBlacklisted.mockReturnValue(false);
    deps.userService.findUserById.mockResolvedValue(undefined);

    const output = createResponse();

    await controller.handleRefresh(
      { refreshToken },
      output.response as never,
    );

    expect(deps.userService.findUserById).toHaveBeenCalledWith("user-1");
    expect(deps.tokenService.signAccess).not.toHaveBeenCalled();
    expect(deps.tokenService.signRefresh).not.toHaveBeenCalled();
    expect(output.getStatusCode()).toBe(401);
    expect(JSON.parse(output.getBody())).toEqual({
      error: "invalid_token",
      message: "Invalid token",
    });
  });
});

// ─── handleLogout ───────────────────────────────────────────────────────

describe("POST /auth/logout", () => {
  let deps: ReturnType<typeof createMockDependencies>;
  let controller: AuthController;

  beforeEach(() => {
    vi.stubEnv("JWT_SECRET", TEST_SECRET);
    decodeMock.mockReset();
    deps = createMockDependencies();
    controller = new AuthController(deps as unknown as AuthDependencies);
  });

  it("returns 401 when no Authorization header is present", async () => {
    const output = createResponse();
    const request = createRequest();

    await controller.handleLogout(request, output.response as never);

    expect(output.getStatusCode()).toBe(401);
  });

  it("returns 401 when the access token is invalid", async () => {
    deps.tokenService.verifyAccess.mockImplementation(() => {
      throw new Error("invalid token");
    });
    const output = createResponse();
    const request = createRequest("Bearer invalid-token");

    await controller.handleLogout(request, output.response as never);

    expect(output.getStatusCode()).toBe(401);
  });

  it("returns 401 when the access token has no jti", async () => {
    deps.tokenService.verifyAccess.mockReturnValue({ sub: "user-1", role: "user" });
    decodeMock.mockReturnValue({ sub: "user-1", role: "user" });

    const output = createResponse();
    const request = createRequest("Bearer no-jti-token");

    await controller.handleLogout(request, output.response as never);

    expect(output.getStatusCode()).toBe(401);
  });

  it("returns 401 when the access token jti is blacklisted", async () => {
    deps.tokenService.verifyAccess.mockReturnValue({ sub: "user-1", role: "user" });
    decodeMock.mockReturnValue({ sub: "user-1", role: "user", jti: "blacklisted-jti" });
    deps.blacklist.isBlacklisted.mockReturnValue(true);

    const output = createResponse();
    const request = createRequest("Bearer blacklisted-token");

    await controller.handleLogout(request, output.response as never);

    expect(output.getStatusCode()).toBe(401);
  });

  it("blacklists the access token jti and returns 204 on valid logout", async () => {
    const exp = Math.floor(Date.now() / 1000) + 900;
    deps.tokenService.verifyAccess.mockReturnValue({ sub: "user-1", role: "user" });
    decodeMock.mockReturnValue({ sub: "user-1", role: "user", jti: "access-jti", exp });
    deps.blacklist.isBlacklisted.mockReturnValue(false);

    const output = createResponse();
    const request = createRequest("Bearer valid-token");

    await controller.handleLogout(request, output.response as never);

    expect(deps.blacklist.add).toHaveBeenCalledWith("access-jti", new Date(exp * 1000));
    expect(output.getStatusCode()).toBe(204);
    expect(output.getBody()).toBe("");
  });
});

// ─── handleMe ───────────────────────────────────────────────────────────

describe("GET /auth/me", () => {
  let deps: ReturnType<typeof createMockDependencies>;
  let controller: AuthController;

  beforeEach(() => {
    vi.stubEnv("JWT_SECRET", TEST_SECRET);
    decodeMock.mockReset();
    deps = createMockDependencies();
    controller = new AuthController(deps as unknown as AuthDependencies);
  });

  it("returns 401 when no Authorization header is present", async () => {
    const output = createResponse();
    const request = createRequest();

    await controller.handleMe(request, output.response as never);

    expect(output.getStatusCode()).toBe(401);
    expect(deps.userService.findUserById).not.toHaveBeenCalled();
  });

  it("returns 401 when the access token is invalid", async () => {
    deps.tokenService.verifyAccess.mockImplementation(() => {
      throw new Error("invalid token");
    });
    const output = createResponse();
    const request = createRequest("Bearer invalid-token");

    await controller.handleMe(request, output.response as never);

    expect(output.getStatusCode()).toBe(401);
  });

  it("returns 401 when the access token has no jti", async () => {
    deps.tokenService.verifyAccess.mockReturnValue({ sub: "user-1", role: "user" });
    decodeMock.mockReturnValue({ sub: "user-1", role: "user" });

    const output = createResponse();
    const request = createRequest("Bearer no-jti-token");

    await controller.handleMe(request, output.response as never);

    expect(output.getStatusCode()).toBe(401);
  });

  it("returns 401 when the access token jti is blacklisted", async () => {
    deps.tokenService.verifyAccess.mockReturnValue({ sub: "user-1", role: "user" });
    decodeMock.mockReturnValue({ sub: "user-1", role: "user", jti: "blacklisted-jti" });
    deps.blacklist.isBlacklisted.mockReturnValue(true);

    const output = createResponse();
    const request = createRequest("Bearer blacklisted-token");

    await controller.handleMe(request, output.response as never);

    expect(output.getStatusCode()).toBe(401);
  });

  it("returns 200 with user data (without passwordHash) on valid token", async () => {
    deps.tokenService.verifyAccess.mockReturnValue({ sub: "user-1", role: "admin" });
    decodeMock.mockReturnValue({ sub: "user-1", role: "admin", jti: "valid-jti" });
    deps.blacklist.isBlacklisted.mockReturnValue(false);
    deps.userService.findUserById.mockResolvedValue(
      makeUser({ id: "user-1", email: "test@example.com", userName: "Ada Lovelace", role: "admin" }),
    );

    const output = createResponse();
    const request = createRequest("Bearer valid-token");

    await controller.handleMe(request, output.response as never);

    expect(deps.userService.findUserById).toHaveBeenCalledWith("user-1");
    expect(output.getStatusCode()).toBe(200);
    const body = JSON.parse(output.getBody());
    expect(body).toEqual({
      id: "user-1",
      email: "test@example.com",
      userName: "Ada Lovelace",
      role: "admin",
    });
    expect(body).not.toHaveProperty("passwordHash");
  });

  it("returns 401 when user is not found", async () => {
    deps.tokenService.verifyAccess.mockReturnValue({ sub: "missing-user", role: "user" });
    decodeMock.mockReturnValue({ sub: "missing-user", role: "user", jti: "valid-jti" });
    deps.blacklist.isBlacklisted.mockReturnValue(false);
    deps.userService.findUserById.mockResolvedValue(undefined);

    const output = createResponse();
    const request = createRequest("Bearer valid-token");

    await controller.handleMe(request, output.response as never);

    expect(output.getStatusCode()).toBe(401);
  });
});
