import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcrypt";
import { resetDatabase, testDatabase } from "../../setup/db.js";

// JWT_SECRET must be present before token.service.ts is imported (it reads the
// env var at module-load time). vi.hoisted runs before any import evaluation.
vi.hoisted(() => {
  vi.stubEnv("JWT_SECRET", "test-jwt-secret-for-integration");
});

const port = 3413 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}`;

const passwordHash = await bcrypt.hash("password", 12);

async function waitForServer(timeoutMs = 10000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.status === 503 || response.status === 200) {
        return;
      }
    } catch {
      // server not ready yet — keep retrying
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Server did not start within ${timeoutMs}ms`);
}

async function seedUser(): Promise<void> {
  await testDatabase.query(
    `INSERT INTO users (email, user_name, password_hash, role)
       VALUES ('user@example.com', 'User', $1, 'user')`,
    [passwordHash],
  );
}

async function login(): Promise<{ accessToken: string; refreshToken: string }> {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "user@example.com", password: "password" }),
  });
  const body = await response.json();
  return { accessToken: body.accessToken, refreshToken: body.refreshToken };
}

async function logout(accessToken: string): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${baseUrl}/auth/logout`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`,
    },
  });
  const body = response.status === 204 ? undefined : await response.json();
  return { status: response.status, body };
}

async function me(accessToken: string): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${baseUrl}/auth/me`, {
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });
  const body = response.status === 204 ? undefined : await response.json();
  return { status: response.status, body };
}

beforeAll(async () => {
  process.env.PORT = String(port);
  process.env.DATABASE_URL =
    process.env.DATABASE_URL_TEST ?? "postgres://postgres:postgres@localhost:5433/quality_test";
  process.env.JWT_SECRET = "test-jwt-secret-for-integration";
  await import("../../../src/server.js");
  await waitForServer();
}, 15000);

afterAll(async () => {
  process.emit("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 50));
  await testDatabase.end();
});

beforeEach(async () => {
  await resetDatabase();
  await seedUser();
});

describe("POST /auth/logout", () => {
  it("returns 204 with no body on valid logout", async () => {
    const { accessToken } = await login();

    const res = await logout(accessToken);
    expect(res.status).toBe(204);
    expect(res.body).toBeUndefined();
  });

  it("invalidates the access token so GET /auth/me returns 401 afterward", async () => {
    const { accessToken } = await login();

    // Confirm the token works before logout
    const before = await me(accessToken);
    expect(before.status).toBe(200);

    // Logout — blacklists the access token jti
    const out = await logout(accessToken);
    expect(out.status).toBe(204);

    // The same access token must now be rejected
    const after = await me(accessToken);
    expect(after.status).toBe(401);
    expect(after.body).toEqual({
      error: "unauthorized",
      message: "Unauthorized",
    });
  });

  it("returns 401 when no Authorization header is present", async () => {
    const response = await fetch(`${baseUrl}/auth/logout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    const body = await response.json();
    expect(response.status).toBe(401);
    expect(body).toEqual({
      error: "unauthorized",
      message: "Unauthorized",
    });
  });

  it("returns 401 when the access token is invalid", async () => {
    const res = await logout("invalid-token");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: "unauthorized",
      message: "Unauthorized",
    });
  });
});
