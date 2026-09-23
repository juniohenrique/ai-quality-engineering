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

// Timeout tests require the same infrastructure as the rest of the
// integration suite: real PostgreSQL + RabbitMQ broker (docker-compose),
// gated on RUN_DB_INTEGRATION.
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

/** Publishes a payment message directly to the queue (bypassing the producer). */
async function publishMessage(payload: CreatePaymentDTO, correlationId: string): Promise<void> {
  await withChannel(async (channel) => {
    await assertDeadLetteredQueue(channel, QUEUE);
    channel.sendToQueue(QUEUE, Buffer.from(JSON.stringify(payload)), {
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

/** Polls the repository until a payment with the given idempotency key is persisted. */
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

// --- Test doubles ---

/**
 * `PaymentService` subclass whose `createPayment` sleeps for `delayMs` before
 * delegating to the real implementation. Used to simulate slow processing that
 * should trip the consumer's processing timeout.
 */
class SlowPaymentService extends PaymentService {
  callCount = 0;

  constructor(
    repository: PostgresPaymentRepository,
    private readonly delayMs: number,
  ) {
    super(repository);
  }

  override async createPayment(input: CreatePaymentDTO) {
    this.callCount += 1;
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    return super.createPayment(input);
  }
}

/**
 * `PaymentService` subclass whose `createPayment` succeeds immediately (no
 * delay) and delegates to the real repository-backed implementation.
 */
class FastPaymentService extends PaymentService {
  callCount = 0;

  override async createPayment(input: CreatePaymentDTO) {
    this.callCount += 1;
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

  timeoutWarns(): Array<{ message: string; context: Record<string, unknown> | undefined }> {
    return this.records.filter(
      (r) =>
        r.level === "warn" &&
        r.message === "Payment processing failed, scheduling retry" &&
        typeof r.context?.error === "string" &&
        r.context.error.includes("exceeded timeout"),
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

describeIntegration("RabbitMqConsumer — processing timeout (integration)", () => {
  let repository: PostgresPaymentRepository;
  let service: SlowPaymentService;
  let logger: RecordingLogger;
  let consumer: RabbitMqConsumer;

  beforeAll(async () => {
    await resetDatabase();
    repository = new PostgresPaymentRepository(testDatabase);

    await purgeMainQueue();
    await purgeDlq();

    // Slow service: 2s per call — well above the 500ms processing timeout.
    service = new SlowPaymentService(repository, 2000);
    logger = new RecordingLogger();

    // With maxRetries = 2 the consumer attempts processing 3 times
    // (1 initial + 2 retries) before dead-lettering.
    const config: ConsumerConfig = {
      url: RABBITMQ_URL,
      queue: QUEUE,
      maxRetries: 2,
      retryBaseDelayMs: 50,
      attempts: 5,
      delayMs: 200,
      prefetch: 10,
      processingTimeoutMs: 500,
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

  it("times out on slow processing and routes the message to payments-dlq after exhausting retries", async () => {
    const idempotencyKey = `key-${randomUUID()}`;
    const payload: CreatePaymentDTO = {
      idempotencyKey,
      userId: "user-1",
      amount: 250,
      currency: "BRL",
      status: "pending",
    };

    await publishMessage(payload, "timeout-slow-processing");

    // Wait for the dead-lettered message to arrive in the DLQ.
    await waitForQueueMessage(DLQ_NAME, 15000);

    // The service is called exactly maxRetries + 1 = 3 times (1 initial + 2
    // retries). Each attempt times out after 500ms rather than completing
    // the full 2s slow path.
    expect(service.callCount).toBe(3);

    // Every attempt timed out (2 retries + 1 final attempt that goes to DLQ).
    // Only the 2 retry attempts produce a "scheduling retry" warn; the 3rd
    // (final) attempt produces the DLQ error.
    const timeoutWarns = logger.timeoutWarns();
    expect(timeoutWarns).toHaveLength(2);
    expect(timeoutWarns[0]!.context?.retryCount).toBe(1);
    expect(timeoutWarns[1]!.context?.retryCount).toBe(2);

    // Bounded retry: exactly 2 retry warnings with incrementing retry counts.
    const retryWarns = logger.retryWarns();
    expect(retryWarns).toHaveLength(2);
    expect(retryWarns[0]!.context?.retryCount).toBe(1);
    expect(retryWarns[1]!.context?.retryCount).toBe(2);

    // Final exhaustion logs an error whose reason is the timeout (the 3rd
    // attempt also exceeded the processing timeout before being NACKed).
    const dlqErrors = logger.dlqErrors();
    expect(dlqErrors).toHaveLength(1);
    expect(dlqErrors[0]!.context?.retryCount).toBe(2);
    expect(dlqErrors[0]!.context?.maxRetries).toBe(2);
    expect(dlqErrors[0]!.context?.error).toEqual(expect.stringContaining("exceeded timeout"));

    // No payment should have been persisted — every attempt timed out before
    // `super.createPayment` could complete the INSERT.
    const payment = await repository.findByIdempotencyKey(idempotencyKey);
    expect(payment).toBeUndefined();

    // The original payload must be preserved in the DLQ message.
    await withChannel(async (channel) => {
      const msg = await channel.get(DLQ_NAME, { noAck: false });
      expect(msg).not.toBeNull();
      if (msg) {
        const content = JSON.parse(msg.content.toString()) as CreatePaymentDTO;
        expect(content.idempotencyKey).toBe(idempotencyKey);
        expect(content.userId).toBe("user-1");
        expect(content.amount).toBe(250);
        expect(content.currency).toBe("BRL");
        channel.ack(msg);
      }
    });

    // The consumer must still be alive and actively consuming the main queue.
    expect(consumer.isConsuming).toBe(true);
  }, 30000);

  it("keeps the consumer alive after a timeout and processes a subsequent valid message", async () => {
    // 1. Publish a message that will time out and be dead-lettered.
    const timeoutKey = `key-${randomUUID()}`;
    const timeoutPayload: CreatePaymentDTO = {
      idempotencyKey: timeoutKey,
      userId: "user-1",
      amount: 250,
      currency: "BRL",
      status: "pending",
    };
    await publishMessage(timeoutPayload, "timeout-then-valid-1");
    await waitForQueueMessage(DLQ_NAME, 15000);

    // The slow consumer must still be alive after the timeout / DLQ cycle.
    expect(consumer.isConsuming).toBe(true);

    // 2. Drain any residual retry re-publications so the valid message is next.
    const start = Date.now();
    while (Date.now() - start < 5000) {
      const count = await withChannel(async (channel) => {
        const reply = await assertDeadLetteredQueue(channel, QUEUE);
        return reply.messageCount;
      });
      if (count === 0) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    // 3. Close the slow consumer and start a fast one that completes well
    //    under the 500ms processing timeout.
    await consumer.close();
    await new Promise((resolve) => setTimeout(resolve, 500));

    const fastService = new FastPaymentService(repository);
    const fastConsumer = new RabbitMqConsumer(fastService, {
      url: RABBITMQ_URL,
      queue: QUEUE,
      maxRetries: 2,
      retryBaseDelayMs: 50,
      attempts: 5,
      delayMs: 200,
      prefetch: 10,
      processingTimeoutMs: 500,
      logger,
    });
    await fastConsumer.start();

    // 4. Publish a VALID payment — the fast consumer must process it within
    //    the 500ms timeout and persist it (no fallback to retry/DLQ).
    const validKey = `key-${randomUUID()}`;
    const validPayload: CreatePaymentDTO = {
      idempotencyKey: validKey,
      userId: "user-1",
      amount: 500,
      currency: "BRL",
      status: "pending",
    };
    await publishMessage(validPayload, "timeout-then-valid-2");

    await waitForPayment(repository, validKey, 10000);

    const payment = await repository.findByIdempotencyKey(validKey);
    expect(payment).toBeDefined();
    expect(payment!.idempotencyKey).toBe(validKey);
    expect(payment!.amount).toBe(500);
    expect(payment!.status).toBe("pending");

    // The fast service should have been called exactly once for the valid msg.
    expect(fastService.callCount).toBe(1);

    await fastConsumer.close().catch(() => undefined);
  }, 30000);
});
