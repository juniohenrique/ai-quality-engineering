import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcrypt";
import { closeDatabase, resetDatabase, testDatabase } from "../../setup/db.js";

const port = 3300 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}`;

let adminToken = "";
let userToken = "";

// Simple client for dashboard
async function request(
  path: string,
  options: Record<string, unknown> = {},
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${baseUrl}${path}`, options);
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

async function seedUsersAndLogin(): Promise<{ adminToken: string; userToken: string }> {
  const adminHash = await bcrypt.hash("admin-pass-12345", 10);
  await testDatabase.query(
    "INSERT INTO users (id, email, user_name, password_hash, role) VALUES ($1, $2, $3, $4, $5)",
    [
      "00000000-0000-0000-0000-000000000001",
      "admin-dashboard@example.com",
      "Admin Dashboard",
      adminHash,
      "admin",
    ],
  );

  const userHash = await bcrypt.hash("user-pass-12345", 10);
  await testDatabase.query(
    "INSERT INTO users (id, email, user_name, password_hash, role) VALUES ($1, $2, $3, $4, $5)",
    [
      "00000000-0000-0000-0000-000000000002",
      "user-dashboard@example.com",
      "User Dashboard",
      userHash,
      "user",
    ],
  );

  const adminLogin = await request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "admin-dashboard@example.com",
      password: "admin-pass-12345",
    }),
  });
  const adminAccessToken = (adminLogin.body as { accessToken: string }).accessToken;

  const userLogin = await request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "user-dashboard@example.com",
      password: "user-pass-12345",
    }),
  });
  const userAccessToken = (userLogin.body as { accessToken: string }).accessToken;

  return { adminToken: adminAccessToken, userToken: userAccessToken };
}

async function seedPayments(): Promise<void> {
  // Seed 12 payments with various statuses to test cap at 10
  // Generate valid UUIDs for payment IDs
  const baseIds = Array.from(
    { length: 12 },
    (_, i) => `00000000-0000-0000-0000-${String(i + 1).padStart(12, "0")}`,
  );

  const paymentData = [
    {
      id: baseIds[0],
      userId: "00000000-0000-0000-0000-000000000001",
      amount: 100,
      currency: "BRL",
      status: "pending",
      idempotencyKey: "idem-01",
      createdAt: new Date("2024-01-01T10:00:00Z"),
    },
    {
      id: baseIds[1],
      userId: "00000000-0000-0000-0000-000000000001",
      amount: 200,
      currency: "BRL",
      status: "processing",
      idempotencyKey: "idem-02",
      createdAt: new Date("2024-01-02T10:00:00Z"),
    },
    {
      id: baseIds[2],
      userId: "00000000-0000-0000-0000-000000000001",
      amount: 300,
      currency: "BRL",
      status: "completed",
      idempotencyKey: "idem-03",
      createdAt: new Date("2024-01-03T10:00:00Z"),
    },
    {
      id: baseIds[3],
      userId: "00000000-0000-0000-0000-000000000001",
      amount: 400,
      currency: "BRL",
      status: "failed",
      idempotencyKey: "idem-04",
      createdAt: new Date("2024-01-04T10:00:00Z"),
    },
    {
      id: baseIds[4],
      userId: "00000000-0000-0000-0000-000000000001",
      amount: 500,
      currency: "BRL",
      status: "refunded",
      idempotencyKey: "idem-05",
      createdAt: new Date("2024-01-05T10:00:00Z"),
    },
    {
      id: baseIds[5],
      userId: "00000000-0000-0000-0000-000000000001",
      amount: 600,
      currency: "BRL",
      status: "pending",
      idempotencyKey: "idem-06",
      createdAt: new Date("2024-01-06T10:00:00Z"),
    },
    {
      id: baseIds[6],
      userId: "00000000-0000-0000-0000-000000000001",
      amount: 700,
      currency: "BRL",
      status: "processing",
      idempotencyKey: "idem-07",
      createdAt: new Date("2024-01-07T10:00:00Z"),
    },
    {
      id: baseIds[7],
      userId: "00000000-0000-0000-0000-000000000001",
      amount: 800,
      currency: "BRL",
      status: "completed",
      idempotencyKey: "idem-08",
      createdAt: new Date("2024-01-08T10:00:00Z"),
    },
    {
      id: baseIds[8],
      userId: "00000000-0000-0000-0000-000000000001",
      amount: 900,
      currency: "BRL",
      status: "failed",
      idempotencyKey: "idem-09",
      createdAt: new Date("2024-01-09T10:00:00Z"),
    },
    {
      id: baseIds[9],
      userId: "00000000-0000-0000-0000-000000000001",
      amount: 1000,
      currency: "BRL",
      status: "refunded",
      idempotencyKey: "idem-10",
      createdAt: new Date("2024-01-10T10:00:00Z"),
    },
    {
      id: baseIds[10],
      userId: "00000000-0000-0000-0000-000000000001",
      amount: 1100,
      currency: "BRL",
      status: "pending",
      idempotencyKey: "idem-11",
      createdAt: new Date("2024-01-11T10:00:00Z"),
    },
    {
      id: baseIds[11],
      userId: "00000000-0000-0000-0000-000000000001",
      amount: 1200,
      currency: "BRL",
      status: "completed",
      idempotencyKey: "idem-12",
      createdAt: new Date("2024-01-12T10:00:00Z"),
    },
  ];

  for (const p of paymentData) {
    await testDatabase.query(
      "INSERT INTO payments (id, user_id, amount, currency, status, idempotency_key, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [p.id, p.userId, p.amount, p.currency, p.status, p.idempotencyKey, p.createdAt],
    );
  }
}

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
  const tokens = await seedUsersAndLogin();
  adminToken = tokens.adminToken;
  userToken = tokens.userToken;
  await seedPayments();
}, 30000);

afterAll(async () => {
  process.emit("SIGTERM");
  await new Promise((r) => setTimeout(r, 50));
  await closeDatabase();
});

describe("GET /admin/dashboard", () => {
  it("returns 401 without token", async () => {
    const res = await request("/admin/dashboard");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: "unauthorized",
      message: "Unauthorized",
    });
  });

  it("returns 403 with user role", async () => {
    const res = await request("/admin/dashboard", {
      headers: {
        authorization: `Bearer ${userToken}`,
      },
    });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: "forbidden",
      message: "Forbidden",
    });
  });

  it("returns 200 for admin with aggregates", async () => {
    const res = await request("/admin/dashboard", {
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.status).toBe(200);
    const body = res.body as {
      users: { total: number; byRole: { admin: number; user: number } };
      payments: { total: number; byStatus: Record<string, number> };
      recentPayments: Array<{
        id: string;
        userId: string;
        amount: number;
        currency: string;
        status: string;
        createdAt: string;
      }>;
    };

    expect(body).toHaveProperty("users");
    expect(body.users).toHaveProperty("total", 2);
    expect(body.users.byRole).toEqual({ admin: 1, user: 1 });

    expect(body).toHaveProperty("payments");
    expect(body.payments).toHaveProperty("total", 12);
    expect(body.payments.byStatus).toEqual({
      pending: 3,
      processing: 2,
      completed: 3,
      failed: 2,
      refunded: 2,
    });

    expect(body).toHaveProperty("recentPayments");
    expect(Array.isArray(body.recentPayments)).toBe(true);
    expect(body.recentPayments.length).toBe(10); // capped at 10

    // Verify ordering: most recent first
    for (let i = 1; i < body.recentPayments.length; i++) {
      const prev = new Date(body.recentPayments[i - 1].createdAt).getTime();
      const curr = new Date(body.recentPayments[i].createdAt).getTime();
      expect(prev).toBeGreaterThanOrEqual(curr);
    }

    // Verify payment structure
    const firstPayment = body.recentPayments[0];
    expect(firstPayment).toMatchObject({
      id: expect.any(String),
      userId: expect.any(String),
      amount: expect.any(Number),
      currency: expect.any(String),
      status: expect.any(String),
      createdAt: expect.any(String),
    });
  });

  it("recentPayments cap at 10", async () => {
    const res = await request("/admin/dashboard", {
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.status).toBe(200);
    const body = res.body as { recentPayments: Array<{ id: string; createdAt: string }> };
    expect(body.recentPayments.length).toBe(10);
    // Should be ordered by createdAt descending (most recent first)
    for (let i = 1; i < body.recentPayments.length; i++) {
      const prev = new Date(body.recentPayments[i - 1].createdAt).getTime();
      const curr = new Date(body.recentPayments[i].createdAt).getTime();
      expect(prev).toBeGreaterThanOrEqual(curr);
    }
    // Most recent should be from 2024-01-12 (last seeded)
    expect(body.recentPayments[0].createdAt).toBe("2024-01-12T10:00:00.000Z");
  });

  it("does not leak password_hash or idempotency_key", async () => {
    const res = await request("/admin/dashboard", {
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.status).toBe(200);
    const body = res.body as {
      users: { total: number; byRole: { admin: number; user: number } };
      payments: { total: number; byStatus: Record<string, number> };
      recentPayments: Array<Record<string, unknown>>;
    };

    // Check users object
    expect(body.users).not.toHaveProperty("password_hash");
    expect(body.users).not.toHaveProperty("passwordHash");

    // Check payments stats object
    expect(body.payments).not.toHaveProperty("password_hash");
    expect(body.payments).not.toHaveProperty("passwordHash");

    // Check recentPayments array - each item should not have password_hash or idempotency_key
    for (const payment of body.recentPayments) {
      expect(payment).not.toHaveProperty("password_hash");
      expect(payment).not.toHaveProperty("passwordHash");
      expect(payment).not.toHaveProperty("idempotency_key");
      expect(payment).not.toHaveProperty("idempotencyKey");
    }
  });
});
