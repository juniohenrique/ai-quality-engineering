import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { closeDatabase, resetDatabase, testDatabase } from "../setup/db.js";
import { Payment } from "../../src/domain/payment.js";
import {
  DuplicateIdempotencyKeyError,
  PostgresPaymentRepository,
} from "../../src/repositories/postgres-payment.repository.js";
import { PaymentService } from "../../src/services/payment.service.js";
import { isUniqueViolation } from "../../src/utils/postgres-errors.js";

const port = 3300 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}`;
const runDatabaseIntegration = process.env.RUN_DB_INTEGRATION === "true";

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

// ---------------------------------------------------------------------------
// HTTP-level integration tests
// ---------------------------------------------------------------------------

beforeAll(async () => {
  process.env.PORT = String(port);
  process.env.DATABASE_URL = runDatabaseIntegration
    ? (process.env.DATABASE_URL_TEST ?? "postgres://postgres:postgres@localhost:5433/quality_test")
    : "postgresql://127.0.0.1:1/unavailable";

  if (!runDatabaseIntegration) {
    process.env.USER_REPOSITORY = "memory";
    process.env.PAYMENT_REPOSITORY = "memory";
  }

  if (runDatabaseIntegration) {
    await resetDatabase();
  }

  await import("../../src/server.js");
  await waitForServer();
}, 15000);

afterAll(async () => {
  process.emit("SIGTERM");
  await new Promise((r) => setTimeout(r, 50));
  if (runDatabaseIntegration) {
    await closeDatabase();
  }
});

beforeEach(async () => {
  if (runDatabaseIntegration) {
    await resetDatabase();
  }
});

describe("POST /payments — idempotency", () => {
  const validPayload = (overrides: Record<string, unknown> = {}) => ({
    idempotencyKey: "idem-key-1",
    userId: "user-1",
    amount: 100,
    currency: "BRL",
    status: "pending" as const,
    ...overrides,
  });

  it("returns the same payment id when the same idempotency key is used twice", async () => {
    const first = await request("/payments", {
      method: "POST",
      body: JSON.stringify(validPayload({ idempotencyKey: "idem-key-1" })),
      headers: { "content-type": "application/json" },
    });

    const second = await request("/payments", {
      method: "POST",
      body: JSON.stringify(validPayload({ idempotencyKey: "idem-key-1", amount: 999 })),
      headers: { "content-type": "application/json" },
    });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.id).toBeTypeOf("string");
    expect(second.body.id).toBeTypeOf("string");
    expect(second.body.id).toBe(first.body.id);
    // The second request must not alter the original payment
    expect(second.body.amount).toBeUndefined();
    expect(second.body.status).toBe(first.body.status);
  });

  it("creates distinct payments when idempotency keys differ", async () => {
    const first = await request("/payments", {
      method: "POST",
      body: JSON.stringify(validPayload({ idempotencyKey: "idem-key-2" })),
      headers: { "content-type": "application/json" },
    });

    const second = await request("/payments", {
      method: "POST",
      body: JSON.stringify(validPayload({ idempotencyKey: "idem-key-3", status: "completed" })),
      headers: { "content-type": "application/json" },
    });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.id).not.toBe(first.body.id);
  });

  it("is idempotent — three identical requests yield one payment", async () => {
    const key = "idem-triple";
    const responses = await Promise.all(
      Array.from({ length: 3 }, () =>
        request("/payments", {
          method: "POST",
          body: JSON.stringify(validPayload({ idempotencyKey: key })),
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    expect(responses).toHaveLength(3);
    expect(responses.every((r) => r.status === 201)).toBe(true);
    const ids = new Set(responses.map((r) => r.body.id));
    expect(ids.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Database-level integration tests (real PostgreSQL)
// ---------------------------------------------------------------------------

const describeDatabase = runDatabaseIntegration ? describe : describe.skip;

describeDatabase("PaymentService idempotency with PostgreSQL", () => {
  let repository: PostgresPaymentRepository;
  let service: PaymentService;

  beforeAll(async () => {
    repository = new PostgresPaymentRepository(testDatabase);
    service = new PaymentService(repository);
  });

  it("persists a payment and finds it by idempotency key", async () => {
    const input = {
      idempotencyKey: `db-key-${randomUUID()}`,
      userId: "user-1",
      amount: 100,
      currency: "BRL",
      status: "pending" as const,
    };

    const payment = await service.createPayment(input);
    const found = await repository.findByIdempotencyKey(input.idempotencyKey);

    expect(found).toEqual(payment);
  });

  it("returns the existing payment when the same key is used twice", async () => {
    const key = `db-dup-${randomUUID()}`;
    const payload = {
      idempotencyKey: key,
      userId: "user-1",
      amount: 100,
      currency: "USD",
      status: "pending" as const,
    };

    const first = await service.createPayment(payload);
    const second = await service.createPayment(payload);

    expect(second.id).toBe(first.id);
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
  });

  it("catches unique-violation and returns the existing payment (race condition)", async () => {
    const key = `db-race-${randomUUID()}`;

    // Insert a payment directly via the repository.
    const payment = new Payment({
      id: randomUUID(),
      idempotencyKey: key,
      userId: "user-1",
      amount: 100,
      currency: "USD",
      status: "pending",
      createdAt: new Date(),
    });
    await repository.create(payment);

    // Calling create again with the same key must throw a
    // DuplicateIdempotencyKeyError whose `code` is "23505".
    const duplicate = new Payment({
      id: randomUUID(),
      idempotencyKey: key,
      userId: "user-2",
      amount: 200,
      currency: "EUR",
      status: "completed",
      createdAt: new Date(),
    });

    let caught: unknown;
    try {
      await repository.create(duplicate);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(DuplicateIdempotencyKeyError);
    expect(isUniqueViolation(caught)).toBe(true);

    // The service, which wraps the repository, should catch the violation
    // and return the *original* payment instead of throwing.
    const result = await service.createPayment({
      idempotencyKey: key,
      userId: "user-2",
      amount: 200,
      currency: "EUR",
      status: "completed" as const,
    });

    expect(result.id).toBe(payment.id);
    expect(result.idempotencyKey).toBe(key);
  });
});
