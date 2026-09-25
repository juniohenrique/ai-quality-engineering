import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IncomingMessage } from "node:http";
import jwt from "jsonwebtoken";
import {
  AuthController,
  type AuthDependencies,
} from "../../../src/controllers/auth.controller.js";

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

describe("POST /auth/login – input validation", () => {
  let deps: ReturnType<typeof createMockDependencies>;
  let controller: AuthController;

  beforeEach(() => {
    vi.stubEnv("JWT_SECRET", TEST_SECRET);
    decodeMock.mockReset();
    deps = createMockDependencies();
    controller = new AuthController(deps as unknown as AuthDependencies);
  });

  it.each([
    null,
    {},
    { email: "", password: "password" },
    { email: "test@example.com", password: "" },
    { email: "   ", password: "password" },
    { email: "test@example.com", password: "   " },
  ])("returns 400 for invalid input %p", async (input) => {
    const output = createResponse();

    await controller.handleLogin(input as unknown, output.response as never);

    expect(output.getStatusCode()).toBe(400);
    expect(JSON.parse(output.getBody())).toEqual({
      error: "invalid_request",
      message: "Invalid request",
    });
    expect(deps.userService.findByEmail).not.toHaveBeenCalled();
  });
});

describe("POST /auth/refresh – input validation", () => {
  let deps: ReturnType<typeof createMockDependencies>;
  let controller: AuthController;

  beforeEach(() => {
    vi.stubEnv("JWT_SECRET", TEST_SECRET);
    decodeMock.mockReset();
    deps = createMockDependencies();
    controller = new AuthController(deps as unknown as AuthDependencies);
  });

  it.each([null, {}, { refreshToken: "" }, { refreshToken: "   " }])(
    "returns 400 for invalid input %p",
    async (input) => {
      const output = createResponse();

      await controller.handleRefresh(input as unknown, output.response as never);

      expect(output.getStatusCode()).toBe(400);
      expect(JSON.parse(output.getBody())).toEqual({
        error: "invalid_request",
        message: "Invalid request",
      });
    },
  );
});

describe("POST /auth/refresh – edge cases", () => {
  let deps: ReturnType<typeof createMockDependencies>;
  let controller: AuthController;

  beforeEach(() => {
    vi.stubEnv("JWT_SECRET", TEST_SECRET);
    decodeMock.mockReset();
    deps = createMockDependencies();
    controller = new AuthController(deps as unknown as AuthDependencies);
  });

  it("returns 401 when decode returns null", async () => {
    deps.tokenService.verifyRefresh.mockReturnValue({ sub: "user-1" });
    decodeMock.mockReturnValue(null);

    const output = createResponse();

    await controller.handleRefresh(
      { refreshToken: "some-token" },
      output.response as never,
    );

    expect(output.getStatusCode()).toBe(401);
    expect(JSON.parse(output.getBody())).toEqual({
      error: "invalid_token",
      message: "Invalid token",
    });
  });

  it("returns 401 when refresh token payload lacks sub", async () => {
    deps.tokenService.verifyRefresh.mockReturnValue({});
    decodeMock.mockReturnValue({ jti: "jti-1", exp: Math.floor(Date.now() / 1000) + 3600 });

    const output = createResponse();

    await controller.handleRefresh(
      { refreshToken: "some-token" },
      output.response as never,
    );

    expect(output.getStatusCode()).toBe(401);
  });

  it("returns 401 when refresh token lacks exp", async () => {
    deps.tokenService.verifyRefresh.mockReturnValue({ sub: "user-1" });
    decodeMock.mockReturnValue({ sub: "user-1", jti: "jti-1" });

    const output = createResponse();

    await controller.handleRefresh(
      { refreshToken: "some-token" },
      output.response as never,
    );

    expect(output.getStatusCode()).toBe(401);
  });

  it("passes the exp timestamp (in seconds) converted to milliseconds as a Date to blacklist.add", async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    deps.tokenService.verifyRefresh.mockReturnValue({ sub: "user-1" });
    decodeMock.mockReturnValue({ sub: "user-1", jti: "jti-1", exp });
    deps.blacklist.isBlacklisted.mockReturnValue(false);
    deps.tokenService.signAccess.mockReturnValue("new-access");
    deps.tokenService.signRefresh.mockReturnValue("new-refresh");
    deps.userService.findUserById.mockResolvedValue({
      id: "user-1",
      email: "test@example.com",
      userName: "Test",
      passwordHash: "hash",
      role: "user",
    });

    const output = createResponse();

    await controller.handleRefresh(
      { refreshToken: "some-token" },
      output.response as never,
    );

    expect(deps.blacklist.add).toHaveBeenCalledWith("jti-1", new Date(exp * 1000));
  });
});

describe("POST /auth/logout – edge cases", () => {
  let deps: ReturnType<typeof createMockDependencies>;
  let controller: AuthController;

  beforeEach(() => {
    vi.stubEnv("JWT_SECRET", TEST_SECRET);
    decodeMock.mockReset();
    deps = createMockDependencies();
    controller = new AuthController(deps as unknown as AuthDependencies);
  });

  it("returns 401 for a malformed Authorization header", async () => {
    const output = createResponse();
    const request = createRequest("NotBearer token");

    await controller.handleLogout(request, output.response as never);

    expect(output.getStatusCode()).toBe(401);
  });

  it("returns 401 when Authorization header has empty token", async () => {
    const output = createResponse();
    const request = createRequest("Bearer ");

    await controller.handleLogout(request, output.response as never);

    expect(output.getStatusCode()).toBe(401);
  });

  it("still returns 204 even when exp cannot be decoded from the token", async () => {
    deps.tokenService.verifyAccess.mockReturnValue({ sub: "user-1", role: "user" });
    decodeMock.mockReturnValue({ sub: "user-1", role: "user", jti: "jti-1" });
    deps.blacklist.isBlacklisted.mockReturnValue(false);

    const output = createResponse();
    const request = createRequest("Bearer some-token");

    await controller.handleLogout(request, output.response as never);

    expect(output.getStatusCode()).toBe(204);
    expect(deps.blacklist.add).not.toHaveBeenCalled();
  });

  it("does not blacklist when authenticate returns null for token without jti", async () => {
    deps.tokenService.verifyAccess.mockReturnValue({ sub: "user-1", role: "user" });
    decodeMock.mockReturnValue({ sub: "user-1", role: "user" });

    const output = createResponse();
    const request = createRequest("Bearer no-jti");

    await controller.handleLogout(request, output.response as never);

    expect(output.getStatusCode()).toBe(401);
    expect(deps.blacklist.add).not.toHaveBeenCalled();
  });
});

describe("GET /auth/me – edge cases", () => {
  let deps: ReturnType<typeof createMockDependencies>;
  let controller: AuthController;

  beforeEach(() => {
    vi.stubEnv("JWT_SECRET", TEST_SECRET);
    decodeMock.mockReset();
    deps = createMockDependencies();
    controller = new AuthController(deps as unknown as AuthDependencies);
  });

  it("returns 401 when the Authorization header is missing", async () => {
    const output = createResponse();
    const request = createRequest();

    await controller.handleMe(request, output.response as never);

    expect(output.getStatusCode()).toBe(401);
    expect(deps.userService.findUserById).not.toHaveBeenCalled();
  });

  it("returns 401 when token payload lacks sub (after successful verify)", async () => {
    deps.tokenService.verifyAccess.mockReturnValue({ sub: undefined, role: "user" });
    decodeMock.mockReturnValue({ role: "user", jti: "jti-1" });

    const output = createResponse();
    const request = createRequest("Bearer some-token");

    await controller.handleMe(request, output.response as never);

    expect(output.getStatusCode()).toBe(401);
  });

  it("returns 200 with only safe fields (no passwordHash)", async () => {
    deps.tokenService.verifyAccess.mockReturnValue({ sub: "user-1", role: "admin" });
    decodeMock.mockReturnValue({ sub: "user-1", role: "admin", jti: "valid-jti" });
    deps.blacklist.isBlacklisted.mockReturnValue(false);
    deps.userService.findUserById.mockResolvedValue({
      id: "user-1",
      email: "test@example.com",
      userName: "Ada",
      passwordHash: "secret-hash",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const output = createResponse();
    const request = createRequest("Bearer valid-token");

    await controller.handleMe(request, output.response as never);

    const body = JSON.parse(output.getBody());
    expect(body).toEqual({
      id: "user-1",
      email: "test@example.com",
      userName: "Ada",
      role: "admin",
    });
    expect(body).not.toHaveProperty("passwordHash");
    expect(body).not.toHaveProperty("createdAt");
    expect(body).not.toHaveProperty("updatedAt");
  });
});
