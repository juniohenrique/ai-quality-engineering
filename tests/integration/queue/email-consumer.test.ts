import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { connect, type Channel, type ChannelModel } from "amqplib";
import { RabbitMqProducer } from "../../../src/queue/producer.js";
import { EmailConsumer } from "../../../src/queue/email-consumer.js";
import { EmailProducer } from "../../../src/queue/email-producer.js";
import { EMAIL_DLQ_NAME, EMAIL_DLX_NAME, EMAIL_QUEUE } from "../../../src/queue/email-setup.js";
import { assertDeadLetteredQueue } from "../../../src/queue/setup.js";
import type { ConsumerLogger } from "../../../src/queue/base-consumer.js";
import type { EmailService } from "../../../src/services/email.service.js";

const runIntegration = process.env.RUN_DB_INTEGRATION === "true";
const RABBITMQ_URL = process.env.RABBITMQ_URL ?? "amqp://guest:guest@localhost:5672";

const describeIntegration = runIntegration ? describe : describe.skip;

/** Abre um canal/connection de curta duração, executa `operation`, encerra. */
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

/** Esvazia a fila de e-mails antes de cada teste. */
async function purgeQueue(): Promise<void> {
  await withChannel(async (channel) => {
    await assertDeadLetteredQueue(channel, EMAIL_QUEUE, EMAIL_DLX_NAME, EMAIL_DLQ_NAME);
    await channel.purgeQueue(EMAIL_QUEUE);
  });
}

/** Polls until `predicate` returns truthy or `timeoutMs` elapses. */
async function waitFor<T>(predicate: () => T | undefined, timeoutMs = 5000): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = predicate();
    if (result) {
      return result as T;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Condition was not met within ${timeoutMs}ms`);
}

describeIntegration("EmailProducer -> EmailConsumer (integration)", () => {
  let producer: RabbitMqProducer;
  let emailProducer: EmailProducer;
  let consumer: EmailConsumer;
  let sendPasswordReset: ReturnType<typeof vi.fn>;
  let loggerInfo: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    await purgeQueue();

    sendPasswordReset = vi.fn().mockResolvedValue({ messageId: "integration-msg-id" });
    const emailService = { sendPasswordReset } as unknown as EmailService;

    loggerInfo = vi.fn();
    const logger: ConsumerLogger = {
      info: loggerInfo,
      warn: vi.fn(),
      error: vi.fn(),
    };

    producer = new RabbitMqProducer({ url: RABBITMQ_URL, attempts: 5, delayMs: 200 });
    consumer = new EmailConsumer(emailService, {
      url: RABBITMQ_URL,
      attempts: 5,
      delayMs: 200,
      logger,
    });
    emailProducer = new EmailProducer(producer);

    await consumer.start();
  }, 20000);

  afterAll(async () => {
    if (producer) {
      await producer.close().catch(() => undefined);
    }
    if (consumer) {
      await consumer.close().catch(() => undefined);
    }
    await purgeQueue().catch(() => undefined);
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    // Rebind spy implementations after clearAllMocks
    sendPasswordReset.mockResolvedValue({ messageId: "integration-msg-id" });
    loggerInfo.mockImplementation(() => undefined);
    await purgeQueue();
  }, 15000);

  it("publica e processa um e-mail de redefinição de senha via fila real", async () => {
    await emailProducer.publishPasswordReset("user@example.com", "raw-123");

    // Aguarda o consumer processar a mensagem (polling com timeout padrão).
    await waitFor(() => {
      if (sendPasswordReset.mock.calls.length >= 1) {
        return sendPasswordReset.mock.calls[0];
      }
      return undefined;
    });

    expect(sendPasswordReset).toHaveBeenCalledTimes(1);
    expect(sendPasswordReset).toHaveBeenCalledWith("user@example.com", "raw-123");
  }, 15000);

  it('loga "Password reset email sent" com messageId', async () => {
    await emailProducer.publishPasswordReset("user@example.com", "raw-123");

    await waitFor(() => {
      const calls = loggerInfo.mock.calls;
      for (const call of calls) {
        if (call[0] === "Password reset email sent") {
          return call;
        }
      }
      return undefined;
    });

    expect(loggerInfo).toHaveBeenCalledWith(
      "Password reset email sent",
      expect.objectContaining({
        to: "user@example.com",
        messageId: "integration-msg-id",
      }),
    );
  }, 15000);
});
