import { describe, expect, it, vi } from "vitest";
import { EmailConsumer, type EmailPayload } from "../../../src/queue/email-consumer.js";
import { EMAIL_DLQ_NAME, EMAIL_DLX_NAME, EMAIL_QUEUE } from "../../../src/queue/email-setup.js";
import type { ConsumerLogger } from "../../../src/queue/base-consumer.js";
import type { EmailService } from "../../../src/services/email.service.js";

/** Cria um mock mínimo de `EmailService` com espiã em `sendPasswordReset`. */
function createEmailServiceMock(): {
  emailService: EmailService;
  sendPasswordReset: ReturnType<typeof vi.fn>;
} {
  const sendPasswordReset = vi.fn().mockResolvedValue({ messageId: "test-msg-id" });
  return {
    emailService: { sendPasswordReset } as unknown as EmailService,
    sendPasswordReset,
  };
}

/** Cria um logger estruturado mockado com espiãs. */
function createLoggerMock(): {
  logger: ConsumerLogger;
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
} {
  const info = vi.fn();
  const warn = vi.fn();
  const error = vi.fn();
  return { logger: { info, warn, error }, info, warn, error };
}

/**
 * Acesso a membros protegidos/private de `EmailConsumer` para testes de
 * unidade. O cast duplo (`as unknown as`) contorna os checadores de acesso
 * da linguagem, mas os membros existem em runtime.
 */
function getInternals(consumer: EmailConsumer): {
  handlePayload(
    payload: EmailPayload,
    context: { correlationId: string; queue: string },
  ): Promise<void>;
  queue: string;
  dlxName: string;
  dlqName: string;
} {
  return consumer as unknown as {
    handlePayload(
      payload: EmailPayload,
      context: { correlationId: string; queue: string },
    ): Promise<void>;
    queue: string;
    dlxName: string;
    dlqName: string;
  };
}

describe("EmailConsumer", () => {
  describe("handlePayload", () => {
    it("chama sendPasswordReset com (to, rawToken) para payload password-reset", async () => {
      const { emailService, sendPasswordReset } = createEmailServiceMock();
      const consumer = new EmailConsumer(emailService);

      await getInternals(consumer).handlePayload(
        { type: "password-reset", to: "user@example.com", rawToken: "token-123" },
        { correlationId: "corr-1", queue: EMAIL_QUEUE },
      );

      expect(sendPasswordReset).toHaveBeenCalledTimes(1);
      expect(sendPasswordReset).toHaveBeenCalledWith("user@example.com", "token-123");
    });

    it('loga "Password reset email sent" com messageId, to e correlationId', async () => {
      const { emailService } = createEmailServiceMock();
      const { logger, info } = createLoggerMock();
      const consumer = new EmailConsumer(emailService, { logger });

      await getInternals(consumer).handlePayload(
        { type: "password-reset", to: "user@example.com", rawToken: "token-123" },
        { correlationId: "corr-1", queue: EMAIL_QUEUE },
      );

      expect(info).toHaveBeenCalledWith("Password reset email sent", {
        correlationId: "corr-1",
        to: "user@example.com",
        messageId: "test-msg-id",
      });
    });

    it("lança erro para type desconhecido e não chama sendPasswordReset", async () => {
      const { emailService, sendPasswordReset } = createEmailServiceMock();
      const consumer = new EmailConsumer(emailService);

      const unknownPayload = { type: "unknown" } as unknown as EmailPayload;

      await expect(
        getInternals(consumer).handlePayload(unknownPayload, {
          correlationId: "corr",
          queue: EMAIL_QUEUE,
        }),
      ).rejects.toThrow("Unknown email payload type: unknown");

      expect(sendPasswordReset).not.toHaveBeenCalled();
    });
  });

  describe("defaults", () => {
    it("usa EMAIL_QUEUE/EMAIL_DLX_NAME/EMAIL_DLQ_NAME por padrão", () => {
      const { emailService } = createEmailServiceMock();
      const consumer = new EmailConsumer(emailService);
      const internals = getInternals(consumer);

      expect(internals.queue).toBe(EMAIL_QUEUE);
      expect(internals.dlxName).toBe(EMAIL_DLX_NAME);
      expect(internals.dlqName).toBe(EMAIL_DLQ_NAME);
    });
  });
});
