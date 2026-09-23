import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { randomUUID } from "node:crypto";
import { connect, type Channel, type ChannelModel } from "amqplib";
import { closeDatabase, resetDatabase, testDatabase } from "../../setup/db.js";
import { PostgresPaymentRepository } from "../../../src/repositories/postgres-payment.repository.js";
import { PaymentService } from "../../../src/services/payment.service.js";
import { RabbitMqConsumer } from "../../../src/queue/consumer.js";
import { assertDeadLetteredQueue, DLQ_NAME } from "../../../src/queue/setup.js";
import type { ConsumerConfig, ConsumerLogger, LogLevel } from "../../../src/queue/consumer.js";
import type { CreatePaymentDTO } from "../../../src/dto/create-payment.dto.js";

const runDatabaseIntegration = process.env.RUN_DB_INTEGRATION === "true";
const RABBITMQ_URL = process.env.RABBITMQ_URL ?? "amqp://guest:guest@localhost:5672";
const QUEUE = "payments";

// Invalid-message tests require the same infrastructure as the rest of the
// integration suite: real PostgreSQL + RabbitMQ broker (docker-compose), gated
// on RUN_DB_INTEGRATION.
const describeIntegration = runDatabaseIntegration ? describe : describe.skip;

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

/** Removes every ready message from the main `payments` queue. */
async function purgeMainQueue(): Promise<void> {
  await withChannel(async (channel) => {
    await assertDeadLetteredQueue(channel, QUEUE);
    await channel.purgeQueue(QUEUE);
  });
}

/** Removes every ready message from the `payments-dlq` queue. */
async function purgeDlq(): Promise<void> {
  await withChannel(async (channel) => {
    await channel.assertQueue(DLQ_NAME, { durable: true });
    await channel.purgeQueue(DLQ_NAME);
  });
}

/** Publishes raw (possibly malformed) content directly to the main queue. */
async function publishRaw(content: Buffer, correlationId: string): Promise<void> {
  await withChannel(async (channel) => {
    await assertDeadLetteredQueue(channel, QUEUE);
    channel.sendToQueue(QUEUE, content, {
      correlationId,
      contentType: "application/json",
      headers: { correlationId },
    });
  });
}

/** Polls the given queue until at least one message is ready or `timeoutMs` elapses. */
async function waitForQueueMessage(queueName: string, timeoutMs = 15000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const count = await withChannel(async (channel) => {
      const reply = await channel.assertQueue(queueName, { durable: true });
      return reply.messageCount;
    });
    if (count > 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`No message arrived in queue "${queueName}" within ${timeoutMs}ms`);
}

/**
 * Polls the repository until a payment with the given idempotency key is
 * persisted or `timeoutMs` elapses.
 */
async function waitForPayment(
  repository: PostgresPaymentRepository,
  idempotencyKey: string,
  timeoutMs = 10000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const payment = await repository.findByIdempotencyKey(idempotencyKey);
    if (payment) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    `Payment with idempotency key "${idempotencyKey}" was not processed within ${timeoutMs}ms`,
  );
}

/**
 * Polls the broker until the main queue reports zero ready messages, guaranteeing
 * every published message has been delivered to (and consumed by) the consumer
 * before we proceed to the next step.
 */
async function waitForMainQueueDrained(timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const count = await withChannel(async (channel) => {
      const reply = await assertDeadLetteredQueue(channel, QUEUE);
      return reply.messageCount;
    });
    if (count === 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Queue "${QUEUE}" was not drained within ${timeoutMs}ms`);
}

// --- Test doubles ---

/** `PaymentService` subclass that counts `createPayment` invocations. */
class TrackingPaymentService extends PaymentService {
  callCount = 0;

  override async createPayment(input: CreatePaymentDTO) {
    this.callCount++;
    return super.createPayment(input);
  }
}

/** `ConsumerLogger` that records every log entry for assertion in tests. */
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
    return this.records.filter(
      (r) =>
        r.level === "warn" && r.message === "Payment processing failed, scheduling retry",
    );
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

describeIntegration("RabbitMqConsumer — invalid messages (integration)", () => {
  let repository: PostgresPaymentRepository;
  let service: TrackingPaymentService;
  let logger: RecordingLogger;
  let consumer: RabbitMqConsumer;

  beforeAll(async () => {
    await resetDatabase();
    repository = new PostgresPaymentRepository(testDatabase);

    await purgeMainQueue();
    await purgeDlq();

    service = new TrackingPaymentService(repository);
    logger = new RecordingLogger();

    // Use a small maxRetries (2) and short base delay so the retry cycle is
    // fast. With maxRetries = 2, the consumer attempts processing 3 times
    // (1 initial + 2 retries) before dead-lettering.
    const config: ConsumerConfig = {
      url: RABBITMQ_URL,
      queue: QUEUE,
      maxRetries: 2,
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
    await purgeMainQueue().catch(() => undefined);
    await purgeDlq().catch(() => undefined);
    await closeDatabase().catch(() => undefined);
  });

  beforeEach(async () => {
    await resetDatabase();
    await purgeMainQueue();
    await purgeDlq();
    service.callCount = 0;
    logger.records.length = 0;
  });

  it("routes a malformed JSON message to payments-dlq after exhausting retries", async () => {
    const correlationId = `invalid-json-${randomUUID()}`;
    const malformedContent = "not valid json{{";

    await publishRaw(Buffer.from(malformedContent), correlationId);

    // Wait for the dead-lettered message to arrive in the DLQ.
    await waitForQueueMessage(DLQ_NAME, 15000);

    // parsePayload throws before createPayment is ever called, so the service
    // must never be invoked for a malformed JSON payload.
    expect(service.callCount).toBe(0);

    // With maxRetries = 2 the consumer should emit exactly 2 retry warnings
    // (retry counts 1 and 2) and then 1 DLQ error — no infinite loop.
    const retryWarns = logger.retryWarns();
    expect(retryWarns).toHaveLength(2);
    expect(retryWarns[0]!.context?.retryCount).toBe(1);
    expect(retryWarns[1]!.context?.retryCount).toBe(2);

    const dlqErrors = logger.dlqErrors();
    expect(dlqErrors).toHaveLength(1);
    expect(dlqErrors[0]!.context?.retryCount).toBe(2);
    expect(dlqErrors[0]!.context?.maxRetries).toBe(2);

    // The raw (malformed) content must be preserved intact in the DLQ message.
    await withChannel(async (channel) => {
      const msg = await channel.get(DLQ_NAME, { noAck: false });
      expect(msg).not.toBeNull();
      if (msg) {
        expect(msg.content.toString()).toBe(malformedContent);
        channel.ack(msg);
      }
    });

    // The consumer must still be alive and actively consuming the main queue.
    expect(consumer.isConsuming).toBe(true);
  }, 20000);

  it("routes a payload missing required fields to payments-dlq after exhausting retries", async () => {
    const correlationId = `missing-fields-${randomUUID()}`;
    // Valid JSON object but missing every required DTO field — PaymentService
    // will throw when calling `.trim()` on undefined values.
    const incompletePayload = { foo: "bar" };

    await publishRaw(Buffer.from(JSON.stringify(incompletePayload)), correlationId);

    await waitForQueueMessage(DLQ_NAME, 15000);

    // The service is called maxRetries + 1 = 3 times (1 initial + 2 retries)
    // before the message is dead-lettered.
    expect(service.callCount).toBe(3);

    // Bounded retry: exactly 2 retry warnings with incrementing retry counts.
    const retryWarns = logger.retryWarns();
    expect(retryWarns).toHaveLength(2);
    expect(retryWarns[0]!.context?.retryCount).toBe(1);
    expect(retryWarns[1]!.context?.retryCount).toBe(2);

    // Final exhaustion logs an error with the last retry count.
    const dlqErrors = logger.dlqErrors();
    expect(dlqErrors).toHaveLength(1);
    expect(dlqErrors[0]!.context?.retryCount).toBe(2);
    expect(dlqErrors[0]!.context?.maxRetries).toBe(2);

    // No payment should have been persisted — the service always threw.
    const rowCount = await withChannel(async () => {
      const result = await testDatabase.query<{ count: string }>(
        "SELECT COUNT(*) FROM payments",
      );
      return parseInt(result.rows[0]!.count, 10);
    });
    expect(rowCount).toBe(0);

    // The original payload must be preserved in the DLQ.
    await withChannel(async (channel) => {
      const msg = await channel.get(DLQ_NAME, { noAck: false });
      expect(msg).not.toBeNull();
      if (msg) {
        const content = JSON.parse(msg.content.toString());
        expect(content).toEqual(incompletePayload);
        channel.ack(msg);
      }
    });

    expect(consumer.isConsuming).toBe(true);
  }, 20000);

  it("keeps the consumer alive and processes a valid message after invalid ones", async () => {
    // 1. Publish a malformed JSON message — should be dead-lettered, not break
    //    the consumer.
    await publishRaw(Buffer.from("<<<not-json>>>"), `invalid-${randomUUID()}`);
    await waitForQueueMessage(DLQ_NAME, 15000);
    expect(consumer.isConsuming).toBe(true);

    // 2. Publish a payload missing required fields.
    const incompletePayload = { userId: "user-1" };
    await publishRaw(
      Buffer.from(JSON.stringify(incompletePayload)),
      `missing-${randomUUID()}`,
    );
    await waitForQueueMessage(DLQ_NAME, 15000);
    expect(consumer.isConsuming).toBe(true);

    // 3. Drain any residual retry re-publications so the valid message is the
    //    next one delivered to the consumer.
    await waitForMainQueueDrained(5000);

    // 4. Publish a VALID payment — the consumer must still process it
    //    successfully, proving it did not break or enter an infinite retry.
    const idempotencyKey = `key-${randomUUID()}`;
    const validPayload: CreatePaymentDTO = {
      idempotencyKey,
      userId: "user-1",
      amount: 250,
      currency: "BRL",
      status: "pending",
    };

    await publishRaw(
      Buffer.from(JSON.stringify(validPayload)),
      "valid-after-invalid",
    );

    await waitForPayment(repository, idempotencyKey, 10000);

    const payment = await repository.findByIdempotencyKey(idempotencyKey);
    expect(payment).toBeDefined();
    expect(payment!.idempotencyKey).toBe(idempotencyKey);
    expect(payment!.userId).toBe("user-1");
    expect(payment!.amount).toBe(250);
    expect(payment!.currency).toBe("BRL");
    expect(payment!.status).toBe("pending");

    // The main queue should be empty after the valid payment is processed.
    await waitForMainQueueDrained(5000);
  }, 30000);
});
