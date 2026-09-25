import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { request } from "../helpers/http-client.js";
import { issueTokenWithExpiry } from "../../src/utils/jwt.js";

const port = 3400 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}`;

interface LoginResponse {
  token: string;
}

interface ErrorResponse {
  error: string;
  message: string;
}

interface ProfileResponse {
  user: { sub: string; email: string };
}

interface LogoutResponse {
  message: string;
}

async function login(
  email: string,
  password: string,
): Promise<{ status: number; body: LoginResponse | ErrorResponse | undefined }> {
  return request<LoginResponse | ErrorResponse>(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

async function accessProtected(token: string): Promise<{
  status: number;
  body: ProfileResponse | ErrorResponse | undefined;
}> {
  return request<ProfileResponse | ErrorResponse>(`${baseUrl}/auth/profile`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function logout(token: string): Promise<{
  status: number;
  body: LogoutResponse | ErrorResponse | undefined;
}> {
  return request<LogoutResponse | ErrorResponse>(`${baseUrl}/auth/logout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function waitForServer(timeoutMs = 10000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await request(`${baseUrl}/health`, { method: "GET" });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error("Server did not start");
}

beforeAll(async () => {
  process.env.PORT = String(port);
  process.env.DATABASE_URL = "postgresql://127.0.0.1:1/unavailable";
  process.env.USER_REPOSITORY = "memory";
  process.env.PAYMENT_REPOSITORY = "memory";

  await import("../../src/server.js");
  await waitForServer();
}, 15000);

afterAll(async () => {
  process.emit("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 50));
});

describe("Authentication — POST /auth/login", () => {
  it("returns 200 and a valid JWT token for valid credentials", async () => {
    const response = await login("test@example.com", "password");

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("token");
    expect(typeof (response.body as LoginResponse).token).toBe("string");
    expect((response.body as LoginResponse).token.length).toBeGreaterThan(0);
  });

  it("returns 401 for invalid credentials", async () => {
    const response = await login("test@example.com", "wrong-password");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: "invalid_credentials",
      message: "Invalid credentials",
    });
  });
});

describe("Authentication — token validation on protected route", () => {
  it("returns 401 when token is missing", async () => {
    const response = await accessProtected("");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: "missing_token",
      message: "Authorization header is required",
    });
  });

  it("returns 401 for an expired token", async () => {
    const expiredToken = issueTokenWithExpiry(
      { sub: "test@example.com", email: "test@example.com" },
      "-10s",
    );

    const response = await accessProtected(expiredToken);

    expect(response.status).toBe(401);
    expect((response.body as ErrorResponse).error).toBe("token_expired");
  });

  it("returns 401 for a malformed token", async () => {
    const response = await accessProtected("not.a.valid.token");

    expect(response.status).toBe(401);
    expect((response.body as ErrorResponse).error).toBe("token_invalid");
  });
});

describe("Authentication — POST /auth/logout", () => {
  it("invalidates the token after logout", async () => {
    const loginResponse = await login("test@example.com", "password");
    const token = (loginResponse.body as LoginResponse).token;

    const accessBefore = await accessProtected(token);
    expect(accessBefore.status).toBe(200);

    const logoutResponse = await logout(token);
    expect(logoutResponse.status).toBe(200);
    expect(logoutResponse.body).toEqual({ message: "Logged out" });

    const accessAfter = await accessProtected(token);
    expect(accessAfter.status).toBe(401);
    expect((accessAfter.body as ErrorResponse).error).toBe("token_revoked");
  });
});
