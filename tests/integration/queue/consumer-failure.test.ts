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
import { assertDeadLetteredQueue } from "../../../src/queue/setup.js";
import type { CreatePaymentDTO } from "../../../src/dto/create-payment.dto.js";
import type { Payment } from "../../../src/domain/payment.js";

const runDatabaseIntegration = process.env.RUN_DB_INTEGRATION === "true";
const RABBITMQ_URL = process.env.RABBITMQ_URL ?? "amqp://guest:guest@localhost:5672";
const QUEUE = "payments";

// Consumer-failure (restart) tests require the same infrastructure as the rest
// of the integration suite: real PostgreSQL + RabbitMQ broker (docker-compose).
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

/** Publishes 3 payment messages directly to the queue (bypassing the producer). */
async function publishThreeMessages(payloads: CreatePaymentDTO[]): Promise<void> {
  await withChannel(async (channel) => {
    await assertDeadLetteredQueue(channel, QUEUE);
    for (const payload of payloads) {
      channel.sendToQueue(QUEUE, Buffer.from(JSON.stringify(payload)), {
        correlationId: payload.idempotencyKey,
        contentType: "application/json",
        headers: { correlationId: payload.idempotencyKey },
      });
    }
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
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    `Payment with idempotency key "${idempotencyKey}" was not processed within ${timeoutMs}ms`,
  );
}

/**
 * Polls the broker until the queue reports zero ready messages, guaranteeing
 * every published message has been delivered to (and consumed by) the
 * consumer before we assert on the database side-effects.
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
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Queue "${QUEUE}" was not drained within ${timeoutMs}ms`);
}

/** Number of ready messages currently sitting in the queue. */
async function queueMessageCount(): Promise<number> {
  return withChannel(async (channel) => {
    const reply = await assertDeadLetteredQueue(channel, QUEUE);
    return reply.messageCount;
  });
}

/** Counts persisted rows that share any of the given idempotency keys. */
async function countPaymentsByKeys(keys: string[]): Promise<number> {
  const result = await testDatabase.query<{ count: string }>(
    "SELECT COUNT(*) FROM payments WHERE idempotency_key = ANY($1)",
    [keys],
  );
  const row = result.rows[0];
  return row ? parseInt(row.count, 10) : 0;
}

/** Builds a fresh, valid payment DTO with a unique idempotency key. */
function makePayload(): CreatePaymentDTO {
  return {
    idempotencyKey: `key-${randomUUID()}`,
    userId: "user-1",
    amount: 100,
    currency: "BRL",
    status: "pending",
  };
}

describeIntegration("RabbitMqConsumer restart / failure recovery (integration)", () => {
  let repository: PostgresPaymentRepository;
  let service: PaymentService;

  beforeAll(async () => {
    await resetDatabase();
    repository = new PostgresPaymentRepository(testDatabase);
    service = new PaymentService(repository);
    await purgeQueue();
  }, 20000);

  afterAll(async () => {
    await purgeQueue().catch(() => undefined);
    await closeDatabase().catch(() => undefined);
  });

  beforeEach(async () => {
    await resetDatabase();
    await purgeQueue();
  });

  it("processes all 3 messages after the consumer is restarted", async () => {
    const payloads = [makePayload(), makePayload(), makePayload()];

    // 1. Publish 3 messages while the consumer is NOT running — the broker
    //    persists them durably in the queue.
    await publishThreeMessages(payloads);

    // Sanity check: the 3 messages are sitting in the queue, unconsumed.
    expect(await queueMessageCount()).toBe(3);

    // 2. Start (restart) the consumer — it should pick up the 3 pending
    //    messages and process them sequentially.
    const consumer = new RabbitMqConsumer(service, {
      url: RABBITMQ_URL,
      queue: QUEUE,
      attempts: 5,
      delayMs: 200,
      prefetch: 10,
      maxRetries: 5,
      retryBaseDelayMs: 50,
    });
    await consumer.start();

    try {
      // 3. Wait until every message has been delivered + ACKed by the consumer.
      await waitForQueueDrained();

      // 4. Verify all 3 payments were persisted, one by one.
      for (const payload of payloads) {
        const payment = await waitForPayment(repository, payload.idempotencyKey);
        expect(payment).toBeDefined();
        expect(payment!.idempotencyKey).toBe(payload.idempotencyKey);
        expect(payment!.userId).toBe(payload.userId);
        expect(payment!.amount).toBe(payload.amount);
        expect(payment!.currency).toBe(payload.currency);
        expect(payment!.status).toBe(payload.status);
      }

      // Also assert the total row count matches exactly (no message lost or
      // duplicated after the restart).
      expect(await countPaymentsByKeys(payloads.map((p) => p.idempotencyKey))).toBe(3);
    } finally {
      await consumer.close().catch(() => undefined);
    }
  }, 25000);

  it("processes 3 new messages on a second restart without redelivering leftovers", async () => {
    // Start the consumer, then immediately close it (simulating an unavailable
    // / restarted process). No messages are published while it runs.
    const consumer1 = new RabbitMqConsumer(service, {
      url: RABBITMQ_URL,
      queue: QUEUE,
      attempts: 5,
      delayMs: 200,
      prefetch: 10,
    });
    await consumer1.start();
    await consumer1.close();

    // Publish 3 new messages after the first consumer is down.
    const payloads2 = [makePayload(), makePayload(), makePayload()];
    await publishThreeMessages(payloads2);

    // All 3 should be waiting in the queue.
    expect(await queueMessageCount()).toBe(3);

    // Restart the consumer (second instance) — it must process exactly these 3.
    const consumer2 = new RabbitMqConsumer(service, {
      url: RABBITMQ_URL,
      queue: QUEUE,
      attempts: 5,
      delayMs: 200,
      prefetch: 10,
    });
    try {
      await consumer2.start();
      await waitForQueueDrained();

      for (const payload of payloads2) {
        const payment = await waitForPayment(repository, payload.idempotencyKey);
        expect(payment).toBeDefined();
        expect(payment!.idempotencyKey).toBe(payload.idempotencyKey);
      }

      // Queue must be empty after processing.
      expect(await queueMessageCount()).toBe(0);

      // Exactly 3 rows persisted — no duplicates from the restart.
      expect(await countPaymentsByKeys(payloads2.map((p) => p.idempotencyKey))).toBe(3);
    } finally {
      await consumer2.close().catch(() => undefined);
    }
  }, 25000);
});
