import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcrypt";
import { resetDatabase, testDatabase } from "../../setup/db.js";

// JWT_SECRET must be present before token.service.ts is imported (it reads the
// env var at module-load time). vi.hoisted runs before any import evaluation.
vi.hoisted(() => {
  vi.stubEnv("JWT_SECRET", "test-jwt-secret-for-integration");
});

const port = 3361 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}`;
const JWT_SECRET = "test-jwt-secret-for-integration";

const adminPasswordHash = await bcrypt.hash("admin-idor-12345", 10);
const user1PasswordHash = await bcrypt.hash("user1-idor-12345", 10);
const user2PasswordHash = await bcrypt.hash("user2-idor-12345", 10);

let user1Id = "";
let user2Id = "";

let adminToken = "";
let user1Token = "";

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
       VALUES ('admin-idor@example.com', 'Admin IDOR', $1, 'admin')
       RETURNING id`,
    [adminPasswordHash],
  );

  const user1Result = await testDatabase.query<{ id: string }>(
    `INSERT INTO users (email, user_name, password_hash, role)
       VALUES ('user1-idor@example.com', 'User1 IDOR', $1, 'user')
       RETURNING id`,
    [user1PasswordHash],
  );
  user1Id = user1Result.rows[0]?.id ?? "";

  const user2Result = await testDatabase.query<{ id: string }>(
    `INSERT INTO users (email, user_name, password_hash, role)
       VALUES ('user2-idor@example.com', 'User2 IDOR', $1, 'user')
       RETURNING id`,
    [user2PasswordHash],
  );
  user2Id = user2Result.rows[0]?.id ?? "";
}

async function seedPayments(): Promise<void> {
  // P1: user1, 1000 BRL, pending
  await testDatabase.query(
    `INSERT INTO payments (user_id, amount, currency, status, idempotency_key)
       VALUES ($1, $2, $3, $4, $5)`,
    [user1Id, 1000, "BRL", "pending", `idem-p1-${Date.now()}`],
  );

  // P2: user1, 5000 BRL, completed
  await testDatabase.query(
    `INSERT INTO payments (user_id, amount, currency, status, idempotency_key)
       VALUES ($1, $2, $3, $4, $5)`,
    [user1Id, 5000, "BRL", "completed", `idem-p2-${Date.now() + 1}`],
  );

  // P3: user2, 200 USD, pending
  await testDatabase.query(
    `INSERT INTO payments (user_id, amount, currency, status, idempotency_key)
       VALUES ($1, $2, $3, $4, $5)`,
    [user2Id, 200, "USD", "pending", `idem-p3-${Date.now() + 2}`],
  );
}

async function login(email: string, password: string): Promise<string> {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
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
  await seedPayments();

  adminToken = await login("admin-idor@example.com", "admin-idor-12345");
  user1Token = await login("user1-idor@example.com", "user1-idor-12345");
});

describe("Payments IDOR edge cases", () => {
  // 1. user comum POST /payments → 403 forbidden
  it("user role POST /payments → 403 forbidden", async () => {
    const res = await request("POST", "/payments", {
      headers: { authorization: `Bearer ${user1Token}` },
      body: JSON.stringify({
        idempotencyKey: "user-create-1",
        userId: user1Id,
        amount: 100,
        currency: "BRL",
        status: "pending",
      }),
    });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "forbidden", message: "Forbidden" });
  });

  // 2. user comum POST /payments com userId do user2 no body → 403 forbidden
  it("user role POST /payments with other userId in body → 403 forbidden", async () => {
    const res = await request("POST", "/payments", {
      headers: { authorization: `Bearer ${user1Token}` },
      body: JSON.stringify({
        idempotencyKey: "user-create-2",
        userId: user2Id,
        amount: 100,
        currency: "BRL",
        status: "pending",
      }),
    });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "forbidden", message: "Forbidden" });
  });

  // 3. admin POST /payments com userId=user1 → 201 + body.userId === user1
  it("admin POST /payments with userId=user1 → 201 and payment.userId === user1", async () => {
    const res = await request("POST", "/payments", {
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        idempotencyKey: "admin-create-1",
        userId: user1Id,
        amount: 100,
        currency: "BRL",
        status: "pending",
      }),
    });
    expect(res.status).toBe(201);
    const body = res.body as { id: string; status: string };
    expect(body.id).toBeDefined();
    expect(body.status).toBe("pending");

    // Verify the payment was created with correct userId by listing as admin
    const listRes = await request("GET", `/payments?userId=${user1Id}`, {
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(listRes.status).toBe(200);
    const listBody = listRes.body as { items: { id: string; userId: string }[] };
    const created = listBody.items.find((p) => p.id === body.id);
    expect(created).toBeDefined();
    expect(created!.userId).toBe(user1Id);
  });

  // 4. user comum GET /payments?userId=user2 → só payments do user1
  it("user role GET /payments?userId=user2 → only user1 payments (anti-IDOR)", async () => {
    const res = await request("GET", `/payments?userId=${user2Id}`, {
      headers: { authorization: `Bearer ${user1Token}` },
    });
    expect(res.status).toBe(200);
    const body = res.body as { total: number; items: { userId: string }[] };
    expect(body.total).toBe(2);
    expect(body.items.every((p) => p.userId === user1Id)).toBe(true);
  });

  // 5. user comum GET /payments?userId=user2&status=completed → só user1 completed
  it("user role GET /payments?userId=user2&status=completed → only user1 completed", async () => {
    const res = await request("GET", `/payments?userId=${user2Id}&status=completed`, {
      headers: { authorization: `Bearer ${user1Token}` },
    });
    expect(res.status).toBe(200);
    const body = res.body as { total: number; items: { userId: string; status: string }[] };
    expect(body.total).toBe(1);
    expect(body.items[0].userId).toBe(user1Id);
    expect(body.items[0].status).toBe("completed");
  });

  // 6. admin GET /payments?userId=user1&status=pending → só user1 pending
  it("admin GET /payments?userId=user1&status=pending → only user1 pending", async () => {
    const res = await request("GET", `/payments?userId=${user1Id}&status=pending`, {
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const body = res.body as { total: number; items: { userId: string; status: string }[] };
    expect(body.total).toBe(1);
    expect(body.items[0].userId).toBe(user1Id);
    expect(body.items[0].status).toBe("pending");
  });

  // 7. admin GET /payments (sem userId) → todos os payments (3)
  it("admin GET /payments without userId → all 3 payments", async () => {
    const res = await request("GET", "/payments", {
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const body = res.body as { total: number; items: unknown[] };
    expect(body.total).toBe(3);
    expect(body.items).toHaveLength(3);
  });
});
