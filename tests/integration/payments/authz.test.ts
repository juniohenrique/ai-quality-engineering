import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcrypt";
import { resetDatabase, testDatabase } from "../../setup/db.js";

// JWT_SECRET must be present before token.service.ts is imported (it reads the
// env var at module-load time). vi.hoisted runs before any import evaluation.
vi.hoisted(() => {
  vi.stubEnv("JWT_SECRET", "test-jwt-secret-for-integration");
});

const port = 3341 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}`;
const JWT_SECRET = "test-jwt-secret-for-integration";

const adminPasswordHash = await bcrypt.hash("admin-pass-12345", 10);
const userPasswordHash = await bcrypt.hash("user-pass-12345", 10);

let userId = "";
let paymentId = "";

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

async function seedUsers(): Promise<void> {
  await testDatabase.query<{ id: string }>(
    `INSERT INTO users (email, user_name, password_hash, role)
       VALUES ('admin-payments-authz@example.com', 'Admin Payments Authz', $1, 'admin')`,
    [adminPasswordHash],
  );

  const userResult = await testDatabase.query<{ id: string }>(
    `INSERT INTO users (email, user_name, password_hash, role)
       VALUES ('user-payments-authz@example.com', 'User Payments Authz', $1, 'user')
       RETURNING id`,
    [userPasswordHash],
  );
  userId = userResult.rows[0]?.id ?? "";
}

async function seedPayment(): Promise<void> {
  const result = await testDatabase.query<{ id: string }>(
    `INSERT INTO payments (user_id, amount, currency, status, idempotency_key)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
    [userId, 1000, "BRL", "pending", `idem-authz-${Date.now()}`],
  );
  paymentId = result.rows[0]?.id ?? "";
}

async function loginAdmin(): Promise<string> {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "admin-payments-authz@example.com",
      password: "admin-pass-12345",
    }),
  });
  const body = await response.json();
  return body.accessToken;
}

async function loginUser(): Promise<string> {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "user-payments-authz@example.com", password: "user-pass-12345" }),
  });
  const body = await response.json();
  return body.accessToken;
}

async function request(
  method: string,
  path: string,
  options: { headers?: Record<string, string>; body?: string } = {},
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "content-type": "application/json", ...options.headers },
    body: options.body,
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
  await seedUsers();
  await seedPayment();
}, 15000);

describe("PATCH /payments/:id/status (transition status)", () => {
  const statusChange = { status: "processing" as const };

  it("returns 401 without token", async () => {
    const res = await request("PATCH", `/payments/${paymentId}/status`, {
      body: JSON.stringify(statusChange),
    });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "unauthorized", message: "Unauthorized" });
  });

  it("returns 403 with user role", async () => {
    const token = await loginUser();
    const res = await request("PATCH", `/payments/${paymentId}/status`, {
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify(statusChange),
    });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "forbidden", message: "Forbidden" });
  });

  it("returns 200 with admin role", async () => {
    const token = await loginAdmin();
    const res = await request("PATCH", `/payments/${paymentId}/status`, {
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify(statusChange),
    });
    expect(res.status).toBe(200);
    const body = res.body as { id: string; status: string };
    expect(body).toMatchObject({ id: paymentId, status: "processing" });
  });
});
