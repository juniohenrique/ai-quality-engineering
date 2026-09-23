import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { connect, type Channel, type ChannelModel } from "amqplib";
import { closeDatabase, resetDatabase, testDatabase } from "../../setup/db.js";
import { PostgresPaymentRepository } from "../../../src/repositories/postgres-payment.repository.js";
import { PaymentService } from "../../../src/services/payment.service.js";
import { RabbitMqConsumer } from "../../../src/queue/consumer.js";
import type { ConsumerConfig, ConsumerLogger, LogLevel } from "../../../src/queue/consumer.js";
import type { CreatePaymentDTO } from "../../../src/dto/create-payment.dto.js";
import type { Payment } from "../../../src/domain/payment.js";

const runDatabaseIntegration = process.env.RUN_DB_INTEGRATION === "true";
const RABBITMQ_URL = process.env.RABBITMQ_URL ?? "amqp://guest:guest@localhost:5672";
const QUEUE = "payments";

// Retry tests require the real PostgreSQL test database (gated on
// RUN_DB_INTEGRATION, same convention as the rest of the integration suite)
// and a running RabbitMQ broker (docker-compose).
const describeIntegration = runDatabaseIntegration ? describe : describe.skip;

// --- Test infrastructure (mirrors the patterns in consumer.test.ts) ---

/** Opens a short-lived channel/connection, runs `operation`, then tears down. */
async function withChannel<T>(operation: (channel: Channel) => Promise<T>): Promise<T> {
  const connection: ChannelModel = await connect(RABBITMQ_URL);
  const channel: Channel = await connection.createChannel();
  try {
    return await operation(channel);
  } finally {
    await channel.close().catch(() => undefined);
    await connection.close().catch(() => undefined);
  }
}

async function purgeQueue(): Promise<void> {
  await withChannel(async (channel) => {
    await channel.assertQueue(QUEUE, { durable: true });
    await channel.purgeQueue(QUEUE);
  });
}

async function publishMessage(payload: CreatePaymentDTO, correlationId: string): Promise<void> {
  await withChannel(async (channel) => {
    await channel.assertQueue(QUEUE, { durable: true });
    channel.sendToQueue(QUEUE, Buffer.from(JSON.stringify(payload)), {
      correlationId,
      contentType: "application/json",
      headers: { correlationId },
    });
  });
}

async function waitForPayment(
  repository: PostgresPaymentRepository,
  idempotencyKey: string,
  timeoutMs = 10000,
): Promise<Payment> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const payment = await repository.findByIdempotencyKey(idempotencyKey);
    if (payment) {
      return payment;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    `Payment with idempotency key "${idempotencyKey}" was not processed within ${timeoutMs}ms`,
  );
}

// --- Test doubles ---

/**
 * `PaymentService` subclass that throws on the first `failCount` calls per
 * idempotency key, then delegates to the real repository.
 *
 * `failCount` is mutable so a single instance can serve different test
 * scenarios without needing separate consumers.
 */
class TransientFailurePaymentService extends PaymentService {
  private readonly callCounts = new Map<string, number>();
  failCount: number;

  constructor(repository: PostgresPaymentRepository, failCount: number) {
    super(repository);
    this.failCount = failCount;
  }

  override async createPayment(input: CreatePaymentDTO): Promise<Payment> {
    const count = (this.callCounts.get(input.idempotencyKey) ?? 0) + 1;
    this.callCounts.set(input.idempotencyKey, count);

    if (count <= this.failCount) {
      throw new Error(`Transient failure (attempt ${count})`);
    }

    return super.createPayment(input);
  }

  getCallCount(idempotencyKey: string): number {
    return this.callCounts.get(idempotencyKey) ?? 0;
  }

  resetCallCounts(): void {
    this.callCounts.clear();
  }
}

/**
 * `ConsumerLogger` that records every log entry so tests can assert on
 * structured fields like `retryCount` and `backoffMs`.
 */
class RecordingLogger implements ConsumerLogger {
  readonly records: Array<{
    level: LogLevel;
    message: string;
    context: Record<string, unknown> | undefined;
  }> = [];

  info(message: string, context?: Record<string, unknown>): void {
    this.records.push({ level: "info", message, context });
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.records.push({ level: "warn", message, context });
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.records.push({ level: "error", message, context });
  }

  retryWarns(): Array<{ message: string; context: Record<string, unknown> | undefined }> {
    return this.records.filter((r) => r.level === "warn");
  }

  dlqErrors(): Array<{ message: string; context: Record<string, unknown> | undefined }> {
    return this.records.filter(
      (r) =>
        r.level === "error" &&
        r.message === "Payment processing failed after max retries, routing to DLQ",
    );
  }
}

// --- Tests ---

describeIntegration("RabbitMqConsumer retry with exponential backoff (integration)", () => {
  let repository: PostgresPaymentRepository;
  let service: TransientFailurePaymentService;
  let logger: RecordingLogger;
  let consumer: RabbitMqConsumer;

  beforeAll(async () => {
    await resetDatabase();
    repository = new PostgresPaymentRepository(testDatabase);

    await purgeQueue();

    service = new TransientFailurePaymentService(repository, 2);
    logger = new RecordingLogger();

    const config: ConsumerConfig = {
      url: RABBITMQ_URL,
      queue: QUEUE,
      maxRetries: 3,
      retryBaseDelayMs: 50,
      attempts: 5,
      delayMs: 200,
      prefetch: 10,
      logger,
    };
    consumer = new RabbitMqConsumer(service, config);
    await consumer.start();
  }, 20000);

  afterAll(async () => {
    if (consumer) {
      await consumer.close().catch(() => undefined);
    }
    await purgeQueue().catch(() => undefined);
    await closeDatabase().catch(() => undefined);
  });

  beforeEach(async () => {
    await resetDatabase();
    await purgeQueue();
    service.resetCallCounts();
    logger.records.length = 0;
  });

  afterEach(() => {
    service.failCount = 2;
  });

  it("retries a transient failure and succeeds on the 3rd attempt", async () => {
    const idempotencyKey = `key-${randomUUID()}`;
    const payload: CreatePaymentDTO = {
      idempotencyKey,
      userId: "user-1",
      amount: 150,
      currency: "BRL",
      status: "pending",
    };

    const start = Date.now();
    await publishMessage(payload, "retry-transient-1");

    const payment = await waitForPayment(repository, idempotencyKey);
    const elapsed = Date.now() - start;

    // The payment was persisted despite 2 transient failures
    expect(payment.idempotencyKey).toBe(idempotencyKey);
    expect(payment.amount).toBe(payload.amount);

    // The service was called 3 times: 2 failures + 1 success
    expect(service.getCallCount(idempotencyKey)).toBe(3);

    // Exponential backoff: 50 ms (retry 0→1) + 100 ms (retry 1→2) = 150 ms minimum
    expect(elapsed).toBeGreaterThanOrEqual(140);

    // Verify the x-retry-count header was propagated via log assertions.
    // The consumer logs `retryCount` (the *next* count) and `backoffMs` on
    // each retry so we can observe the header propagation end-to-end.
    const retryWarns = logger.retryWarns();
    expect(retryWarns).toHaveLength(2);

    expect(retryWarns[0]!.context?.retryCount).toBe(1);
    expect(retryWarns[0]!.context?.backoffMs).toBe(50);
    expect(retryWarns[1]!.context?.retryCount).toBe(2);
    expect(retryWarns[1]!.context?.backoffMs).toBe(100);

    // A success log must be present after the retries
    const successLogs = logger.records.filter(
      (r) => r.level === "info" && r.message === "Payment processed",
    );
    expect(successLogs).toHaveLength(1);
  }, 15000);

  it("NACKs a message after exhausting all retries without persisting", async () => {
    service.failCount = Infinity;

    const idempotencyKey = `key-${randomUUID()}`;
    const payload: CreatePaymentDTO = {
      idempotencyKey,
      userId: "user-1",
      amount: 100,
      currency: "BRL",
      status: "pending",
    };

    await publishMessage(payload, "retry-exhaustion-1");

    // Wait for all 4 service calls to complete (1 initial + 3 retries).
    // We poll the call count rather than the queue length because a message
    // delivered to the consumer but still in a backoff delay appears as
    // "unacknowledged" (not "ready"), making `waitForQueueDrained` return
    // prematurely.
    const start = Date.now();
    while (service.getCallCount(idempotencyKey) < 4 && Date.now() - start < 8000) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    // No payment should have been persisted — the service always threw
    const payment = await repository.findByIdempotencyKey(idempotencyKey);
    expect(payment).toBeUndefined();

    // The service was called 4 times: 1 initial + 3 retries (maxRetries)
    expect(service.getCallCount(idempotencyKey)).toBe(4);

    // All 3 retry attempts log a "scheduling retry" warning showing the
    // retry count incrementing 1 → 2 → 3
    const retryWarns = logger.retryWarns();
    expect(retryWarns).toHaveLength(3);
    expect(retryWarns[0]!.context?.retryCount).toBe(1);
    expect(retryWarns[0]!.context?.backoffMs).toBe(50);
    expect(retryWarns[1]!.context?.retryCount).toBe(2);
    expect(retryWarns[1]!.context?.backoffMs).toBe(100);
    expect(retryWarns[2]!.context?.retryCount).toBe(3);
    expect(retryWarns[2]!.context?.backoffMs).toBe(200);

    // The final exhaustion path logs an error with retryCount = 3
    const dlqErrors = logger.dlqErrors();
    expect(dlqErrors).toHaveLength(1);
    expect(dlqErrors[0]!.context?.retryCount).toBe(3);
  }, 15000);
});
