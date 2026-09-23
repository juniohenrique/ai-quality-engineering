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
import { RabbitMqProducer } from "../../../src/queue/producer.js";
import { RabbitMqConsumer } from "../../../src/queue/consumer.js";
import { assertDeadLetteredQueue, DLQ_NAME } from "../../../src/queue/setup.js";
import type { CreatePaymentDTO } from "../../../src/dto/create-payment.dto.js";
import type { Payment } from "../../../src/domain/payment.js";
import type { PaymentContext } from "../../../src/services/payment.service.js";
import type { ConsumerConfig, ConsumerLogger, LogLevel } from "../../../src/queue/consumer.js";

const runDatabaseIntegration = process.env.RUN_DB_INTEGRATION === "true";
const RABBITMQ_URL = process.env.RABBITMQ_URL ?? "amqp://guest:guest@localhost:5672";
const QUEUE = "payments";

// End-to-end correlation-id tests require the real PostgreSQL test database
// (gated on RUN_DB_INTEGRATION, same convention as the rest of the integration
// suite) and a running RabbitMQ broker (docker-compose).
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
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(
    `Payment with idempotency key "${idempotencyKey}" was not processed within ${timeoutMs}ms`,
  );
}

// --- Test doubles ---

/** `PaymentService` spy that records the `correlationId` from each call. */
class RecordingPaymentService extends PaymentService {
  readonly correlationIds: string[] = [];

  /** When true, the first call to `createPayment` throws (simulating a retry). */
  failOnce = false;

  private firstCallDone = false;

  override async createPayment(input: CreatePaymentDTO, context?: PaymentContext): Promise<Payment> {
    this.correlationIds.push(context?.correlationId ?? "(none)");

    if (this.failOnce && !this.firstCallDone) {
      this.firstCallDone = true;
      throw new Error("Transient failure for correlation test");
    }

    return super.createPayment(input, context);
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

  /** Returns log entries that mention a correlation id in their context. */
  correlationLogs(): Array<{
    level: LogLevel;
    message: string;
    context: Record<string, unknown> | undefined;
  }> {
    return this.records.filter(
      (r) => r.context && typeof r.context.correlationId === "string",
    );
  }
}

// --- Tests ---

describeIntegration("Correlation ID (integration)", () => {
  let repository: PostgresPaymentRepository;
  let service: RecordingPaymentService;
  let producer: RabbitMqProducer;
  let consumer: RabbitMqConsumer;
  let logger: RecordingLogger;

  beforeAll(async () => {
    await resetDatabase();
    repository = new PostgresPaymentRepository(testDatabase);

    await purgeMainQueue();
    await purgeDlq();

    logger = new RecordingLogger();
    service = new RecordingPaymentService(repository);

    producer = new RabbitMqProducer({
      url: RABBITMQ_URL,
      attempts: 5,
      delayMs: 200,
    });

    const config: ConsumerConfig = {
      url: RABBITMQ_URL,
      queue: QUEUE,
      attempts: 5,
      delayMs: 200,
      prefetch: 10,
      logger,
    };
    consumer = new RabbitMqConsumer(service, config);

    await consumer.start();
  }, 20000);

  afterAll(async () => {
    if (producer) {
      await producer.close().catch(() => undefined);
    }
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
    service.correlationIds.length = 0;
    logger.records.length = 0;
  });

  it("propagates the producer-supplied correlation id through the service and logs", async () => {
    const payload: CreatePaymentDTO = {
      idempotencyKey: `key-${randomUUID()}`,
      userId: "user-1",
      amount: 100,
      currency: "BRL",
      status: "pending",
    };

    const correlationId = await producer.publish(QUEUE, payload, {
      correlationId: "corr-trace-001",
    });

    expect(correlationId).toBe("corr-trace-001");

    await waitForPayment(repository, payload.idempotencyKey);

    // The service must have received the same correlation id that the producer
    // supplied — this is the core guarantee of the propagation chain.
    expect(service.correlationIds).toEqual(["corr-trace-001"]);

    // The consumer's structured log for the successful payment must carry the
    // same correlation id so operators can trace the whole pipeline.
    const infoLogs = logger.records.filter(
      (r) => r.level === "info" && r.message === "Payment processed",
    );
    expect(infoLogs).toHaveLength(1);
    expect(infoLogs[0]!.context?.correlationId).toBe("corr-trace-001");
  }, 15000);

  it("generates a correlation id when the producer does not supply one", async () => {
    const payload: CreatePaymentDTO = {
      idempotencyKey: `key-${randomUUID()}`,
      userId: "user-1",
      amount: 50,
      currency: "BRL",
      status: "pending",
    };

    const correlationId = await producer.publish(QUEUE, payload);

    // A UUID v4 is always generated by the producer when none is provided.
    expect(correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );

    await waitForPayment(repository, payload.idempotencyKey);

    // The generated id must flow through the service and the log.
    expect(service.correlationIds).toEqual([correlationId]);

    const infoLogs = logger.records.filter(
      (r) => r.level === "info" && r.message === "Payment processed",
    );
    expect(infoLogs).toHaveLength(1);
    expect(infoLogs[0]!.context?.correlationId).toBe(correlationId);
  }, 15000);

  it("preserves the correlation id across retry attempts", async () => {
    const payload: CreatePaymentDTO = {
      idempotencyKey: `key-${randomUUID()}`,
      userId: "user-1",
      amount: 200,
      currency: "BRL",
      status: "pending",
    };

    // Configure the service to fail on the first attempt, then succeed on the
    // retry. This exercises the retry path while keeping the test fast.
    service.failOnce = true;

    const correlationId = await producer.publish(QUEUE, payload, {
      correlationId: "corr-retry-preserved",
    });

    await waitForPayment(repository, payload.idempotencyKey);

    // The correlation id must be the same on both the failed attempt and the
    // successful retry — the consumer re-publishes with the original correlation
    // id preserved in the message properties.
    expect(service.correlationIds).toEqual([
      "corr-retry-preserved",
      "corr-retry-preserved",
    ]);
    expect(correlationId).toBe("corr-retry-preserved");

    // The warn log from the retry path must also carry the correlation id.
    const retryWarn = logger.records.find(
      (r) => r.level === "warn" && r.message === "Payment processing failed, scheduling retry",
    );
    expect(retryWarn).toBeDefined();
    expect(retryWarn!.context?.correlationId).toBe("corr-retry-preserved");
  }, 15000);
});
