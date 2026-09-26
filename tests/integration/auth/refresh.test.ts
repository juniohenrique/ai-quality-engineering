import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { resetDatabase, testDatabase } from "../../setup/db.js";

// JWT_SECRET must be present before token.service.ts is imported (it reads the
// env var at module-load time). vi.hoisted runs before any import evaluation.
vi.hoisted(() => {
  vi.stubEnv("JWT_SECRET", "test-jwt-secret-for-integration");
});

import { TokenService } from "../../../src/services/token.service.js";

const port = 3311 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}`;
const tokenService = new TokenService();
const JWT_SECRET = "test-jwt-secret-for-integration";

const passwordHash = await bcrypt.hash("password", 12);

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

async function refresh(refreshToken: string): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${baseUrl}/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken }),
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

describe("POST /auth/refresh", () => {
  it("issues a new token pair on valid refresh", async () => {
    const { refreshToken } = await login();

    const res = await refresh(refreshToken);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("accessToken");
    expect(res.body).toHaveProperty("refreshToken");
    expect(typeof (res.body as { accessToken: string }).accessToken).toBe("string");
    expect(typeof (res.body as { refreshToken: string }).refreshToken).toBe("string");
  });

  it("new accessToken carries the correct role from the database", async () => {
    const { refreshToken } = await login();

    // Promote the seeded user to admin in the DB — the refresh must reflect
    // the DB role, not anything embedded in the (role-less) refresh token.
    await testDatabase.query("UPDATE users SET role = 'admin' WHERE id = $1", [
      seededUserId,
    ]);

    const res = await refresh(refreshToken);
    expect(res.status).toBe(200);
    const newAccessToken = (res.body as { accessToken: string }).accessToken;
    const payload = tokenService.verifyAccess(newAccessToken);
    expect(payload).toMatchObject({ sub: seededUserId, role: "admin" });
  });

  it("returns 401 on the second refresh using the same token (blacklist)", async () => {
    const { refreshToken } = await login();

    const first = await refresh(refreshToken);
    expect(first.status).toBe(200);

    // Reusing the same refresh token must be rejected because the controller
    // blacklists the old jti on the first (successful) refresh.
    const second = await refresh(refreshToken);
    expect(second.status).toBe(401);
    expect(second.body).toEqual({
      error: "invalid_token",
      message: "Invalid token",
    });
  });

  it("returns 401 when the refresh token is expired", async () => {
    const expiredRefreshToken = jwt.sign({ sub: seededUserId }, JWT_SECRET, {
      algorithm: "HS256",
      expiresIn: "-1s",
      jwtid: "expired-jti",
    });

    const res = await refresh(expiredRefreshToken);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: "invalid_token",
      message: "Invalid token",
    });
  });

  it("returns 401 when the refresh token signature is tampered", async () => {
    const { refreshToken } = await login();
    const parts = refreshToken.split(".");
    const tampered = `${parts[0] ?? ""}.${parts[1] ?? ""}.${flipSignature(parts[2] ?? "")}`;

    const res = await refresh(tampered);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: "invalid_token",
      message: "Invalid token",
    });
  });
});

/** Flips the last character of the signature to break the JWT signature. */
function flipSignature(signature: string): string {
  const lastChar = signature[signature.length - 1] ?? "A";
  const replacement = lastChar === "A" ? "B" : "A";
  return signature.slice(0, -1) + replacement;
}
