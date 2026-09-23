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

// Integration tests require the real PostgreSQL test database; the RabbitMQ
// broker is expected to be running (docker-compose). Matches the rest of the
// integration suite which is gated on RUN_DB_INTEGRATION.
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

async function purgeQueue(): Promise<void> {
  await withChannel(async (channel) => {
    await assertDeadLetteredQueue(channel, QUEUE);
    await channel.purgeQueue(QUEUE);
  });
}

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

/** Asserts that no payment with the given key is ever persisted (i.e. NACK path). */
async function expectNoPayment(
  repository: PostgresPaymentRepository,
  idempotencyKey: string,
  timeoutMs = 2000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const payment = await repository.findByIdempotencyKey(idempotencyKey);
    expect(
      payment,
      `Payment should not have been persisted: ${payment?.id ?? "undefined"}`,
    ).toBeUndefined();
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

describeIntegration("RabbitMqConsumer (integration)", () => {
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
    });
    await consumer.start();
  }, 20000);

  afterAll(async () => {
    // Guard against `beforeAll` failing (e.g. broker unreachable) before
    // `consumer` is assigned — otherwise the teardown masks the real error
    // with a confusing "Cannot read properties of undefined (reading 'close')".
    if (consumer) {
      await consumer.close().catch(() => undefined);
    }
    await purgeQueue().catch(() => undefined);
    await closeDatabase().catch(() => undefined);
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  it("processes a published payment message and persists it in the database", async () => {
    const payload: CreatePaymentDTO = {
      idempotencyKey: `key-${randomUUID()}`,
      userId: "user-1",
      amount: 100,
      currency: "BRL",
      status: "pending",
    };

    await publishMessage(payload, "integration-correlation-id");

    const payment = await waitForPayment(repository, payload.idempotencyKey);
    expect(payment.idempotencyKey).toBe(payload.idempotencyKey);
    expect(payment.userId).toBe(payload.userId);
    expect(payment.amount).toBe(payload.amount);
    expect(payment.currency).toBe(payload.currency);
    expect(payment.status).toBe("pending");
  }, 15000);

  it("NACKs (drops) an invalid message without persisting a payment", async () => {
    const invalidPayload: CreatePaymentDTO = {
      idempotencyKey: `key-${randomUUID()}`,
      userId: "user-1",
      amount: -10, // rejected by the Payment domain (must be positive)
      currency: "BRL",
      status: "pending",
    };

    await publishMessage(invalidPayload, "integration-nack-id");

    await expectNoPayment(repository, invalidPayload.idempotencyKey);
  }, 15000);
});
