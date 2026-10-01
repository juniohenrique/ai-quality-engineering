import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcrypt";
import { closeDatabase, resetDatabase, testDatabase } from "../setup/db.js";

const port = 3200 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}`;

let adminToken = "";

// Simple client for payments
// eslint-disable-next-line @typescript-eslint/no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
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

async function seedAdminAndLogin(): Promise<string> {
  const hash = await bcrypt.hash("admin-test-12345", 10);
  await testDatabase.query(
    "INSERT INTO users (id, email, user_name, password_hash, role) VALUES ($1, $2, $3, $4, $5)",
    [
      "00000000-0000-0000-0000-000000000099",
      "admin-payments@example.com",
      "Admin Payments",
      hash,
      "admin",
    ],
  );
  const login = await request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "admin-payments@example.com",
      password: "admin-test-12345",
    }),
  });
  return (login.body as { accessToken: string }).accessToken;
}

beforeAll(async () => {
  process.env.PORT = String(port);
  process.env.DATABASE_URL =
    process.env.DATABASE_URL_TEST ?? "postgres://postgres:postgres@localhost:5433/quality_test";
  process.env.RUN_DB_INTEGRATION = "true";
  await import("../../src/server.js");
  await waitForServer();
}, 30000);

beforeEach(async () => {
  await resetDatabase();
  adminToken = await seedAdminAndLogin();
}, 30000);

afterAll(async () => {
  process.emit("SIGTERM");
  await new Promise((r) => setTimeout(r, 50));
  await closeDatabase();
});

describe("POST /payments", () => {
  it("creates payment successfully", async () => {
    const res = await request("/payments", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        idempotencyKey: "key-123",
        userId: "user-1",
        amount: 100,
        currency: "BRL",
        status: "pending",
      }),
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: "pending" });
    expect(res.body.id).toBeTypeOf("string");
  });

  it("rejects negative amount", async () => {
    const res = await request("/payments", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        idempotencyKey: "key-124",
        userId: "user-1",
        amount: -10,
        currency: "BRL",
        status: "pending",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects invalid currency", async () => {
    const res = await request("/payments", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        idempotencyKey: "key-125",
        userId: "user-1",
        amount: 10,
        currency: "XYZ",
        status: "pending",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects missing idempotencyKey", async () => {
    const res = await request("/payments", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        userId: "user-1",
        amount: 10,
        currency: "BRL",
        status: "pending",
      }),
    });
    expect(res.status).toBe(400);
  });
});
