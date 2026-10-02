import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { resetDatabase, testDatabase } from "../../setup/db.js";

// JWT_SECRET must be present before token.service.ts is imported (it reads the
// env var at module-load time). vi.hoisted runs before any import evaluation.
vi.hoisted(() => {
  vi.stubEnv("JWT_SECRET", "test-jwt-secret-for-integration");
});

const port = 3321 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}`;
const JWT_SECRET = "test-jwt-secret-for-integration";

const passwordHash = await bcrypt.hash("password", 10);

let seededUserId = "";

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
  const result = await testDatabase.query<{ id: string }>(
    `INSERT INTO users (email, user_name, password_hash, role)
       VALUES ('user@example.com', 'User', $1, 'user')
       RETURNING id`,
    [passwordHash],
  );
  seededUserId = result.rows[0]?.id ?? "";
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

async function logout(accessToken: string): Promise<number> {
  const response = await fetch(`${baseUrl}/auth/logout`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}` },
  });
  return response.status;
}

async function me(accessToken: string): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${baseUrl}/auth/me`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const body = response.status === 204 ? undefined : await response.json();
  return { status: response.status, body };
}

beforeAll(async () => {
  process.env.PORT = String(port);
  process.env.DATABASE_URL =
    process.env.DATABASE_URL_TEST ?? "postgres://postgres:postgres@localhost:5433/quality_test";
  process.env.JWT_SECRET = JWT_SECRET;
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

describe("GET /auth/me", () => {
  it("returns 200 with user profile when access token is valid", async () => {
    const { accessToken } = await login();

    const res = await me(accessToken);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: seededUserId,
      email: "user@example.com",
      userName: "User",
      role: "user",
    });
  });

  it("returns 401 unauthorized when Authorization header is missing", async () => {
    const response = await fetch(`${baseUrl}/auth/me`);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({
      error: "unauthorized",
      message: "Unauthorized",
    });
  });

  it("returns 401 unauthorized when Authorization header lacks Bearer scheme", async () => {
    const { accessToken } = await login();
    const response = await fetch(`${baseUrl}/auth/me`, {
      headers: { authorization: `Basic ${accessToken}` },
    });
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({
      error: "unauthorized",
      message: "Unauthorized",
    });
  });

  it("returns 401 unauthorized when Authorization header is Bearer with empty token", async () => {
    const response = await fetch(`${baseUrl}/auth/me`, {
      headers: { authorization: "Bearer " },
    });
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({
      error: "unauthorized",
      message: "Unauthorized",
    });
  });

  it("returns 401 unauthorized when access token is expired", async () => {
    const expiredAccessToken = jwt.sign({ sub: seededUserId, role: "user" }, JWT_SECRET, {
      algorithm: "HS256",
      expiresIn: "-1s",
      jwtid: "expired-jti",
    });

    const res = await me(expiredAccessToken);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: "unauthorized",
      message: "Unauthorized",
    });
  });

  it("returns 401 unauthorized when access token signature is tampered", async () => {
    const { accessToken } = await login();
    const parts = accessToken.split(".");
    const tampered = `${parts[0] ?? ""}.${parts[1] ?? ""}.${flipSignature(parts[2] ?? "")}`;

    const res = await me(tampered);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: "unauthorized",
      message: "Unauthorized",
    });
  });

  it("returns 401 unauthorized when access token is signed with different secret", async () => {
    const differentSecretToken = jwt.sign({ sub: seededUserId, role: "user" }, "different-secret", {
      algorithm: "HS256",
      expiresIn: "1h",
      jwtid: "diff-secret-jti",
    });

    const res = await me(differentSecretToken);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: "unauthorized",
      message: "Unauthorized",
    });
  });

  it("returns 401 unauthorized when access token is revoked (logout then me)", async () => {
    const { accessToken } = await login();
    await logout(accessToken);

    const res = await me(accessToken);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: "unauthorized",
      message: "Unauthorized",
    });
  });
});

/** Flips the last character of the signature to break the JWT signature. */
function flipSignature(signature: string): string {
  const lastChar = signature[signature.length - 1] ?? "A";
  const replacement = lastChar === "A" ? "B" : "A";
  return signature.slice(0, -1) + replacement;
}
