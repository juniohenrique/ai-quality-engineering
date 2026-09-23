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
import { assertDeadLetteredQueue, DLX_NAME, DLQ_NAME } from "../../../src/queue/setup.js";
import type { ConsumerConfig, ConsumerLogger, LogLevel } from "../../../src/queue/consumer.js";
import type { CreatePaymentDTO } from "../../../src/dto/create-payment.dto.js";
import { Payment } from "../../../src/domain/payment.js";

const runDatabaseIntegration = process.env.RUN_DB_INTEGRATION === "true";
const RABBITMQ_URL = process.env.RABBITMQ_URL ?? "amqp://guest:guest@localhost:5672";
const QUEUE = "payments";

// DLQ tests require the same infrastructure as the rest of the integration
// suite: real PostgreSQL + RabbitMQ broker (docker-compose).
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

// --- Test doubles ---

/** `PaymentService` subclass whose `createPayment` always rejects. */
class AlwaysFailingPaymentService extends PaymentService {
  callCount = 0;

  override async createPayment(): Promise<Payment> {
    this.callCount++;
    throw new Error("Permanent processing failure");
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

  dlqErrors(): Array<{ message: string; context: Record<string, unknown> | undefined }> {
    return this.records.filter(
      (r) =>
        r.level === "error" &&
                r.message === "Payment processing failed after max retries, routing to DLQ",
    );
  }
}

// --- Tests ---

describeIntegration("Dead Letter Queue (integration)", () => {
  let repository: PostgresPaymentRepository;
  let service: AlwaysFailingPaymentService;
  let logger: RecordingLogger;
  let consumer: RabbitMqConsumer;

  beforeAll(async () => {
    await resetDatabase();
    repository = new PostgresPaymentRepository(testDatabase);

    // Purge both the main queue and the DLQ so the suite starts clean.
    await purgeMainQueue();
    await purgeDlq();

    service = new AlwaysFailingPaymentService(repository);
    logger = new RecordingLogger();

    // Use a small maxRetries (2) and short base delay so the test is fast.
    // With maxRetries = 2, the consumer calls the service 3 times
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

  it("routes a permanently failing message to payments-dlq after exhausting retries", async () => {
    const idempotencyKey = `key-${randomUUID()}`;
    const payload: CreatePaymentDTO = {
      idempotencyKey,
      userId: "user-1",
      amount: 200,
      currency: "BRL",
      status: "pending",
    };

    await publishMessage(payload, "dlq-permanent-failure");

    // Wait for the dead-lettered message to arrive in the DLQ.
    await waitForQueueMessage(DLQ_NAME, 15000);

    // The service should have been called exactly maxRetries + 1 = 3 times.
    expect(service.callCount).toBe(3);

    // An error-level log must have been emitted for the DLQ routing.
    const dlqErrors = logger.dlqErrors();
    expect(dlqErrors).toHaveLength(1);
    expect(dlqErrors[0]!.context?.retryCount).toBe(2);
    expect(dlqErrors[0]!.context?.maxRetries).toBe(2);

    // No payment should have been persisted — the service always threw.
    const payment = await repository.findByIdempotencyKey(idempotencyKey);
    expect(payment).toBeUndefined();

    // The message must actually be in the DLQ with the original payload.
    await withChannel(async (channel) => {
      const msg = await channel.get(DLQ_NAME, { noAck: false });
      expect(msg).not.toBeNull();
      if (msg) {
        const content = JSON.parse(msg.content.toString()) as CreatePaymentDTO;
        expect(content.idempotencyKey).toBe(idempotencyKey);
        expect(content.userId).toBe("user-1");
        expect(content.amount).toBe(200);
        expect(content.currency).toBe("BRL");
        channel.ack(msg);
      }
    });
  }, 20000);

  it("does NOT route a successfully processed message to the DLQ", async () => {
    const idempotencyKey = `key-${randomUUID()}`;
    const payload: CreatePaymentDTO = {
      idempotencyKey,
      userId: "user-1",
      amount: 100,
      currency: "BRL",
      status: "pending",
    };

    // Temporarily override the service to succeed.
    service.createPayment = async function () {
      service.callCount++;
      return new Payment({
        id: `payment-${randomUUID()}`,
        idempotencyKey,
        userId: "user-1",
        amount: 100,
        currency: "BRL",
        status: "pending",
        createdAt: new Date(),
      });
    };

    await publishMessage(payload, "dlq-success-case");

    // Wait for the payment to be persisted.
    const start = Date.now();
    while (Date.now() - start < 10000) {
      const payment = await repository.findByIdempotencyKey(idempotencyKey);
      if (payment) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Give the DLQ some time to receive nothing.
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // The DLQ must be empty.
    const dlqCount = await withChannel(async (channel) => {
      const reply = await channel.assertQueue(DLQ_NAME, { durable: true });
      return reply.messageCount;
    });
    expect(dlqCount).toBe(0);

    // No DLQ error log should have been emitted.
    expect(logger.dlqErrors()).toHaveLength(0);
  }, 15000);

  it("preserves the DLX exchange and DLQ naming in the broker topology", async () => {
    // Verify the exchange and DLQ exist with the expected names.
    await withChannel(async (channel) => {
      const exchange = await channel.assertExchange(DLX_NAME, "direct", {
        durable: true,
      });
      expect(exchange.exchange).toBe(DLX_NAME);

      const dlq = await channel.assertQueue(DLQ_NAME, { durable: true });
      expect(dlq.queue).toBe(DLQ_NAME);

      // The main queue must carry the DLX arguments.
      const mainQueue = await channel.assertQueue(QUEUE, {
        durable: true,
        deadLetterExchange: DLX_NAME,
        deadLetterRoutingKey: DLQ_NAME,
      });
      expect(mainQueue.queue).toBe(QUEUE);
    });
  });
});

