import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { connect, type Channel, type ChannelModel } from "amqplib";
import { closeDatabase, resetDatabase, testDatabase } from "../../setup/db.js";
import { PostgresPaymentRepository } from "../../../src/repositories/postgres-payment.repository.js";
import { PaymentService } from "../../../src/services/payment.service.js";
import { RabbitMqConsumer } from "../../../src/queue/consumer.js";
import { assertDeadLetteredQueue } from "../../../src/queue/setup.js";
import type { CreatePaymentDTO } from "../../../src/dto/create-payment.dto.js";
import type { Payment } from "../../../src/domain/payment.js";

const runDatabaseIntegration = process.env.RUN_DB_INTEGRATION === "true";
const RABBITMQ_URL = process.env.RABBITMQ_URL ?? "amqp://guest:guest@localhost:5672";
const QUEUE = "payments";

// Duplicate-message idempotency tests require the same infrastructure as the
// rest of the integration suite: real PostgreSQL + RabbitMQ broker
// (docker-compose), gated on RUN_DB_INTEGRATION.
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

/** Removes every ready message from the queue so tests start from a clean slate. */
async function purgeQueue(): Promise<void> {
  await withChannel(async (channel) => {
    await assertDeadLetteredQueue(channel, QUEUE);
    await channel.purgeQueue(QUEUE);
  });
}

/** Publishes a payment message directly to the queue (bypassing the producer). */
async function publishMessage(
  payload: CreatePaymentDTO,
  correlationId: string,
): Promise<void> {
  await withChannel(async (channel) => {
    await assertDeadLetteredQueue(channel, QUEUE);
    channel.sendToQueue(QUEUE, Buffer.from(JSON.stringify(payload)), {
      correlationId,
      contentType: "application/json",
      headers: { correlationId },
    });
  });
}

/**
 * Polls the repository until a payment with the given idempotency key is
 * persisted or `timeoutMs` elapses.
 */
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
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(
    `Payment with idempotency key "${idempotencyKey}" was not processed within ${timeoutMs}ms`,
  );
}

/**
 * Polls the broker until the queue reports zero ready messages, guaranteeing
 * every published message has been delivered to (and consumed by) the
 * long-running consumer before we assert on the database side-effects.
 */
async function waitForQueueDrained(timeoutMs = 8000): Promise<void> {
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

/** Counts persisted rows that share a given idempotency key. */
async function countPaymentsByKey(key: string): Promise<number> {
  const result = await testDatabase.query<{ count: string }>(
    "SELECT COUNT(*) FROM payments WHERE idempotency_key = $1",
    [key],
  );
  const row = result.rows[0];
  return row ? parseInt(row.count, 10) : 0;
}

/** Counts the total number of rows in the payments table. */
async function countAllPayments(): Promise<number> {
  const result = await testDatabase.query<{ count: string }>(
    "SELECT COUNT(*) FROM payments",
  );
  const row = result.rows[0];
  return row ? parseInt(row.count, 10) : 0;
}

describeIntegration("RabbitMqConsumer — duplicate message (S05-08) (integration)", () => {
  let repository: PostgresPaymentRepository;
  let service: PaymentService;
  let consumer: RabbitMqConsumer;

  beforeAll(async () => {
    await resetDatabase();
    repository = new PostgresPaymentRepository(testDatabase);
    service = new PaymentService(repository);
    await purgeQueue();

    consumer = new RabbitMqConsumer(service, {
      url: RABBITMQ_URL,
      queue: QUEUE,
      attempts: 5,
      delayMs: 200,
      prefetch: 10,
      maxRetries: 3,
      retryBaseDelayMs: 50,
    });
    await consumer.start();
  }, 20000);

  afterAll(async () => {
    // Guard against `beforeAll` failing before `consumer` is assigned so the
    // teardown never masks the original error with a confusing TypeError.
    if (consumer) {
      await consumer.close().catch(() => undefined);
    }
    await purgeQueue().catch(() => undefined);
    await closeDatabase().catch(() => undefined);
  });

  beforeEach(async () => {
    await resetDatabase();
    await purgeQueue();
  });

  it("processes a duplicated message (same correlationId) exactly once", async () => {
    const idempotencyKey = `key-${randomUUID()}`;
    const correlationId = `dup-correlation-${randomUUID()}`;

    const payload: CreatePaymentDTO = {
      idempotencyKey,
      userId: "user-1",
      amount: 100,
      currency: "BRL",
      status: "pending",
    };

    // Publish the *same* message twice with the *same* correlationId, exactly
    // as a misbehaving producer or a broker retry might deliver it.
    await publishMessage(payload, correlationId);
    await publishMessage(payload, correlationId);

    // Wait until at least one payment is persisted (processing is happening),
    // then ensure the queue is fully drained so the 2nd duplicate's idempotent
    // retry path has been exercised by the consumer.
    await waitForPayment(repository, idempotencyKey);
    await waitForQueueDrained();

    // The UNIQUE constraint on the idempotency key plus the service-level
    // idempotency guarantee exactly one row, regardless of delivery order.
    const rowCount = await countPaymentsByKey(idempotencyKey);
    expect(rowCount).toBe(1);

    // Belt-and-suspenders: the entire payments table should hold exactly one
    // row — the single side effect produced by the duplicate messages.
    expect(await countAllPayments()).toBe(1);

    // The persisted payment must match the published payload (idempotency key
    // is the canonical identity, so the duplicate must not have overwritten it).
    const payment = await waitForPayment(repository, idempotencyKey);
    expect(payment.idempotencyKey).toBe(idempotencyKey);
    expect(payment.userId).toBe(payload.userId);
    expect(payment.amount).toBe(payload.amount);
    expect(payment.currency).toBe(payload.currency);
    expect(payment.status).toBe("pending");
  }, 20000);
});
