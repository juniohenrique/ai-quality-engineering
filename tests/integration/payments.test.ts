import { afterAll, beforeAll, describe, expect, it } from "vitest";

const port = 3200 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}`;

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
      await request("/health");
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
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
});

afterAll(async () => {
  process.emit("SIGTERM");
  await new Promise((r) => setTimeout(r, 50));
});

describe("POST /payments", () => {
  it("creates payment successfully", async () => {
    const res = await request("/payments", {
      method: "POST",
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
