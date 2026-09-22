import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { closeDatabase, resetDatabase, testDatabase } from "../setup/db.js";
import { PostgresPaymentRepository } from "../../src/repositories/postgres-payment.repository.js";
import { PaymentService } from "../../src/services/payment.service.js";

const port = 3500 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}`;
const runDatabaseIntegration = process.env.RUN_DB_INTEGRATION === "true";

// ---------------------------------------------------------------------------
// Typed HTTP helper (no `any`)
// ---------------------------------------------------------------------------

interface PaymentResponse {
  id: string;
  status: string;
}

interface PaymentRequestBody {
  idempotencyKey: string;
  userId: string;
  amount: number;
  currency: string;
  status: "pending" | "completed" | "failed";
}

interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<{ status: number; body: T | undefined }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method,
    headers: { "content-type": "application/json", ...options.headers },
    body: options.body,
  });

  const parsed = response.status === 204 ? undefined : await response.json();

  return {
    status: response.status,
    body: parsed as T | undefined,
  };
}

async function waitForServer(timeoutMs = 10000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await request("/health");
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`Server did not start within ${timeoutMs}ms`);
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
  await new Promise((resolve) => setTimeout(resolve, 50));
  if (runDatabaseIntegration) {
    await closeDatabase();
  }
});

beforeEach(async () => {
  if (runDatabaseIntegration) {
    await resetDatabase();
  }
});

describe("POST /payments — S04-10 concurrency (100 simultaneous requests)", () => {
  const CONCURRENT_REQUESTS = 100;

  const buildPayload = (idempotencyKey: string): PaymentRequestBody => ({
    idempotencyKey,
    userId: "user-1",
    amount: 100,
    currency: "BRL",
    status: "pending",
  });

  it("registers a single payment when 100 identical requests race", async () => {
    const key = `concurrent-${randomUUID()}`;

    const start = Date.now();
    const responses = await Promise.all(
      Array.from({ length: CONCURRENT_REQUESTS }, () =>
        request<PaymentResponse>("/payments", {
          method: "POST",
          body: JSON.stringify(buildPayload(key)),
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const durationMs = Date.now() - start;

    // Every request must be served (no server failures / 5xx).
    expect(responses).toHaveLength(CONCURRENT_REQUESTS);
    expect(responses.every((response) => response.status === 201)).toBe(true);
    const serverErrors = responses.filter((response) => response.status >= 500);
    expect(serverErrors).toHaveLength(0);

    // Every response must reference the same payment id.
    const paymentIds = new Set(responses.map((response) => response.body?.id));
    expect(paymentIds.size).toBe(1);

    // Only one charge must exist at the database level.
    if (runDatabaseIntegration) {
      const result = await testDatabase.query<{ count: string }>(
        "SELECT COUNT(*) FROM payments WHERE idempotency_key = $1",
        [key],
      );
      const row = result.rows[0];
      expect(row).toBeDefined();
      expect(parseInt(row!.count, 10)).toBe(1);
    }

    console.log(
      `S04-10 concurrency: ${CONCURRENT_REQUESTS} requests in ${durationMs.toFixed(2)}ms (${(durationMs / 1000).toFixed(2)}s) | 1 payment recorded | 0 server errors`,
    );
  }, 20000);

  it("is deterministic across repeated bursts", async () => {
    const bursts = 3;

    for (let run = 0; run < bursts; run += 1) {
      const key = `concurrent-burst-${randomUUID()}`;

      const start = Date.now();
      const responses = await Promise.all(
        Array.from({ length: CONCURRENT_REQUESTS }, () =>
          request<PaymentResponse>("/payments", {
            method: "POST",
            body: JSON.stringify(buildPayload(key)),
            headers: { "content-type": "application/json" },
          }),
        ),
      );
      const durationMs = Date.now() - start;

      expect(responses.every((response) => response.status === 201)).toBe(true);
      expect(responses.filter((response) => response.status >= 500)).toHaveLength(0);

      const paymentIds = new Set(responses.map((response) => response.body?.id));
      expect(paymentIds.size).toBe(1);

      if (runDatabaseIntegration) {
        const result = await testDatabase.query<{ count: string }>(
          "SELECT COUNT(*) FROM payments WHERE idempotency_key = $1",
          [key],
        );
        const row = result.rows[0];
        expect(row).toBeDefined();
        expect(parseInt(row!.count, 10)).toBe(1);
      }

      console.log(
        `run ${run + 1}/${bursts}: ${CONCURRENT_REQUESTS} requests in ${durationMs.toFixed(2)}ms | 1 payment | 0 errors`,
      );
    }
  }, 60000);
});

// ---------------------------------------------------------------------------
// Database-level integration tests (real PostgreSQL)
// ---------------------------------------------------------------------------

const describeDatabase = runDatabaseIntegration ? describe : describe.skip;

describeDatabase("PaymentService absorbs a 100-way race on a single idempotency key", () => {
  let repository: PostgresPaymentRepository;
  let service: PaymentService;

  beforeAll(() => {
    repository = new PostgresPaymentRepository(testDatabase);
    service = new PaymentService(repository);
  });

  const buildPayload = (key: string): PaymentRequestBody => ({
    idempotencyKey: key,
    userId: "user-1",
    amount: 100,
    currency: "BRL",
    status: "pending",
  });

  it("persists exactly one payment despite concurrent createPayment calls", async () => {
    const key = `db-concurrent-${randomUUID()}`;

    const start = Date.now();
    const results = await Promise.all(
      Array.from({ length: 100 }, () => service.createPayment(buildPayload(key))),
    );
    const durationMs = Date.now() - start;

    expect(results).toHaveLength(100);
    const ids = new Set(results.map((payment) => payment.id));
    expect(ids.size).toBe(1);

    const result = await testDatabase.query<{ count: string }>(
      "SELECT COUNT(*) FROM payments WHERE idempotency_key = $1",
      [key],
    );
    const row = result.rows[0];
    expect(row).toBeDefined();
    expect(parseInt(row!.count, 10)).toBe(1);

    console.log(
      `service-level: 100 concurrent createPayment in ${durationMs.toFixed(2)}ms | 1 row persisted`,
    );
  }, 20000);
});
