import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { connect, type Channel, type ChannelModel } from "amqplib";
import { closeDatabase, resetDatabase, testDatabase } from "../../setup/db.js";
import { PostgresPaymentRepository } from "../../../src/repositories/postgres-payment.repository.js";
import { PaymentService } from "../../../src/services/payment.service.js";
import { RabbitMqProducer } from "../../../src/queue/producer.js";
import { RabbitMqConsumer } from "../../../src/queue/consumer.js";
import { assertDeadLetteredQueue } from "../../../src/queue/setup.js";
import type { CreatePaymentDTO } from "../../../src/dto/create-payment.dto.js";
import type { Payment } from "../../../src/domain/payment.js";

const runDatabaseIntegration = process.env.RUN_DB_INTEGRATION === "true";
const RABBITMQ_URL = process.env.RABBITMQ_URL ?? "amqp://guest:guest@localhost:5672";
const QUEUE = "payments";

// End-to-end producer/consumer tests require the real PostgreSQL test database
// (gated on RUN_DB_INTEGRATION, same convention as the rest of the integration
// suite) and a running RabbitMQ broker (docker-compose).  The whole pipeline
// is exercised through real amqplib connections — no mocks for the broker.
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

/** Number of ready messages currently sitting in the queue. */
async function queueMessageCount(): Promise<number> {
  return withChannel(async (channel) => {
    const reply = await assertDeadLetteredQueue(channel, QUEUE);
    return reply.messageCount;
  });
}

/**
 * Polls the repository until a payment with the given idempotency key is
 * persisted or `timeoutMs` elapses.  A bounded, deterministic wait (5s by
 * default per the S05-04 contract) instead of an arbitrary sleep.
 */
async function waitForPayment(
  repository: PostgresPaymentRepository,
  idempotencyKey: string,
  timeoutMs = 5000,
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
async function waitForQueueDrained(timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if ((await queueMessageCount()) === 0) {
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

describeIntegration("RabbitMqProducer -> RabbitMqConsumer (integration)", () => {
  let repository: PostgresPaymentRepository;
  let service: PaymentService;
  let producer: RabbitMqProducer;
  let consumer: RabbitMqConsumer;

  beforeAll(async () => {
    await resetDatabase();
    await purgeQueue();

    repository = new PostgresPaymentRepository(testDatabase);
    service = new PaymentService(repository);

    // The producer connects lazily on the first `publish` call, so it only
    // needs to be constructed here; the consumer is started eagerly.
    producer = new RabbitMqProducer({
      url: RABBITMQ_URL,
      attempts: 5,
      delayMs: 200,
    });
    consumer = new RabbitMqConsumer(service, {
      url: RABBITMQ_URL,
      queue: QUEUE,
      attempts: 5,
      delayMs: 200,
      prefetch: 10,
    });

    await consumer.start();
  }, 20000);

  afterAll(async () => {
    // Guard against `beforeAll` failing before the instances are assigned so the
    // teardown never masks the original error with a confusing TypeError.
    if (producer) {
      await producer.close().catch(() => undefined);
    }
    if (consumer) {
      await consumer.close().catch(() => undefined);
    }
    await purgeQueue().catch(() => undefined);
    await closeDatabase().catch(() => undefined);
  });

  // Each test starts with an empty queue and an empty payments table, and
  // every published message uses a fresh idempotency key — this is what keeps
  // the suite deterministic and free of cross-test / cross-run interference.
  beforeEach(async () => {
    await resetDatabase();
    await purgeQueue();
  });

  it("persists a payment published via the producer and processed by the consumer", async () => {
    const payload: CreatePaymentDTO = {
      idempotencyKey: `key-${randomUUID()}`,
      userId: "user-1",
      amount: 42,
      currency: "BRL",
      status: "pending",
    };

    await producer.publish(QUEUE, payload, { correlationId: "producer-it-1" });

    const payment = await waitForPayment(repository, payload.idempotencyKey);

    expect(payment.idempotencyKey).toBe(payload.idempotencyKey);
    expect(payment.userId).toBe(payload.userId);
    expect(payment.amount).toBe(payload.amount);
    expect(payment.currency).toBe(payload.currency);
    expect(payment.status).toBe(payload.status);
  }, 15000);

  it("processes a single payment when the same message is published twice (idempotency)", async () => {
    const payload: CreatePaymentDTO = {
      idempotencyKey: `key-${randomUUID()}`,
      userId: "user-1",
      amount: 100,
      currency: "BRL",
      status: "pending",
    };

    // Same payload (and thus the same idempotency key) published twice, each
    // with its own correlation id, exactly as a retrying client would behave.
    await producer.publish(QUEUE, payload, { correlationId: "idem-once" });
    await producer.publish(QUEUE, payload, { correlationId: "idem-twice" });

    // Confirm at least one row was persisted (processing is happening), then
    // make sure the queue is fully drained so the 2nd message's idempotent
    // retry path has actually been exercised by the consumer.
    await waitForPayment(repository, payload.idempotencyKey);
    await waitForQueueDrained();

    // The UNIQUE constraint on idempotency_key plus the service idempotency
    // guarantee exactly one row, no matter the ordering of the two messages.
    expect(await countPaymentsByKey(payload.idempotencyKey)).toBe(1);
  }, 15000);
});
