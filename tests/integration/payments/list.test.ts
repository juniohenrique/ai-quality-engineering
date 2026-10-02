import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcrypt";
import { closeDatabase, resetDatabase, testDatabase } from "../../setup/db.js";

const port = 3200 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
async function request(
  path: string,
  options: Record<string, unknown> = {},
): Promise<{ status: number; body: unknown }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await fetch(`${baseUrl}${path}`, options as any);
  const body = response.status === 204 ? undefined : await response.json();
  return { status: response.status, body };
}

async function waitForServer(timeoutMs = 10000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.status === 200 || response.status === 503) {
        return;
      }
    } catch {
      // server not ready yet — keep retrying
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Server did not start");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function seedAndLogin(email: string, password: string): Promise<string> {
  const hash = await bcrypt.hash(password, 10);
  const role = email === "admin@list.com" ? "admin" : "user";
  const userName = `${email.split("@")[0]} list`;
  const id =
    email === "admin@list.com"
      ? "00000000-0000-0000-0000-000000000001"
      : email === "user1@list.com"
        ? "00000000-0000-0000-0000-000000000002"
        : "00000000-0000-0000-0000-000000000003";

  await testDatabase.query(
    "INSERT INTO users (id, email, user_name, password_hash, role) VALUES ($1, $2, $3, $4, $5)",
    [id, email, userName, hash, role],
  );

  const login = await request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return (login.body as { accessToken: string }).accessToken;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createPayment(
  adminToken: string,
  payload: Record<string, unknown>,
): Promise<string> {
  const res = await request("/payments", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify(payload),
  });
  return (res.body as { id: string }).id;
}

const ADMIN_EMAIL = "admin@list.com";
const ADMIN_PASSWORD = "admin-list-12345";
const USER1_EMAIL = "user1@list.com";
const USER1_PASSWORD = "user1-list-12345";
const USER2_EMAIL = "user2@list.com";
const USER2_PASSWORD = "user2-list-12345";

let adminToken = "";
let user1Token = "";
let user1Id = "";
let user2Id = "";

beforeAll(async () => {
  process.env.PORT = String(port);
  process.env.DATABASE_URL =
    process.env.DATABASE_URL_TEST ?? "postgres://postgres:postgres@localhost:5433/quality_test";
  process.env.RUN_DB_INTEGRATION = "true";
  await import("../../../src/server.js");
  await waitForServer();
}, 30000);

beforeEach(async () => {
  await resetDatabase();
  adminToken = await seedAndLogin(ADMIN_EMAIL, ADMIN_PASSWORD);
  user1Token = await seedAndLogin(USER1_EMAIL, USER1_PASSWORD);
  await seedAndLogin(USER2_EMAIL, USER2_PASSWORD);

  user1Id = (await testDatabase.query("SELECT id FROM users WHERE email = $1", [USER1_EMAIL]))
    .rows[0].id as string;
  user2Id = (await testDatabase.query("SELECT id FROM users WHERE email = $1", [USER2_EMAIL]))
    .rows[0].id as string;

  // P1: user1, 1000 BRL, pending
  // P2: user1, 5000 BRL, completed
  // P3: user2, 200 USD, failed
  // P4: user1, 15000 BRL, processing
  await createPayment(adminToken, {
    idempotencyKey: "p1-key",
    userId: user1Id,
    amount: 1000,
    currency: "BRL",
    status: "pending",
  });
  await createPayment(adminToken, {
    idempotencyKey: "p2-key",
    userId: user1Id,
    amount: 5000,
    currency: "BRL",
    status: "completed",
  });
  await createPayment(adminToken, {
    idempotencyKey: "p3-key",
    userId: user2Id,
    amount: 200,
    currency: "USD",
    status: "failed",
  });
  await createPayment(adminToken, {
    idempotencyKey: "p4-key",
    userId: user1Id,
    amount: 15000,
    currency: "BRL",
    status: "processing",
  });
}, 30000);

afterAll(async () => {
  process.emit("SIGTERM");
  await new Promise((r) => setTimeout(r, 50));
  await closeDatabase();
});

describe("GET /payments (list with filters)", () => {
  it("GET /payments without token → 401", async () => {
    const response = await request("/payments");
    expect(response.status).toBe(401);
  });

  it("admin lists all 4 payments", async () => {
    const response = await request("/payments", {
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.status).toBe(200);
    const body = response.body as { total: number; items: unknown[] };
    expect(body.total).toBe(4);
    expect(body.items).toHaveLength(4);
  });

  it("admin filters by status=completed", async () => {
    const response = await request("/payments?status=completed", {
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.status).toBe(200);
    const body = response.body as { total: number; items: { status: string }[] };
    expect(body.total).toBe(1);
    expect(body.items[0].status).toBe("completed");
  });

  it("admin filters by minAmount=2000", async () => {
    const response = await request("/payments?minAmount=2000", {
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.status).toBe(200);
    const body = response.body as { total: number; items: unknown[] };
    expect(body.total).toBe(2);
  });

  it("admin filters by userId=user1-id", async () => {
    const response = await request(`/payments?userId=${user1Id}`, {
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.status).toBe(200);
    const body = response.body as { total: number; items: unknown[] };
    expect(body.total).toBe(3);
  });

  it("user role sees only own payments even with userId=user2 query (anti-IDOR)", async () => {
    const response = await request(`/payments?userId=${user2Id}`, {
      headers: { authorization: `Bearer ${user1Token}` },
    });
    expect(response.status).toBe(200);
    const body = response.body as { total: number; items: { userId: string }[] };
    expect(body.total).toBe(3);
    expect(body.items.every((p) => p.userId === user1Id)).toBe(true);
  });

  it("user role filters by status works within own scope", async () => {
    const response = await request("/payments?status=completed", {
      headers: { authorization: `Bearer ${user1Token}` },
    });
    expect(response.status).toBe(200);
    const body = response.body as { total: number; items: unknown[] };
    expect(body.total).toBe(1);
  });
});
