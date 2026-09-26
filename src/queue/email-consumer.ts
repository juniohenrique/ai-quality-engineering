/**
 * Consumer da fila de e-mails transacionais.
 *
 * Existe apenas um tipo de payload (`password-reset`) por enquanto, mas a
 * união `EmailPayload` foi projetada para ser extensível — futuros tipos
 * (ex: `receipt`) podem ser adicionados sem alterar a API pública.
 */
import type { EmailService } from "../services/email.service.js";
import { BaseConsumer, type ConsumerConfig } from "./base-consumer.js";
import { EMAIL_DLQ_NAME, EMAIL_DLX_NAME, EMAIL_QUEUE } from "./email-setup.js";

/** Payload para o e-mail de redefinição de senha. */
export interface PasswordResetEmailPayload {
  type: "password-reset";
  to: string;
  rawToken: string;
}

/** União de todos os payloads suportados pela fila de e-mails. */
export type EmailPayload = PasswordResetEmailPayload;

/**
 * RabbitMQ consumer que consome a fila {@link EMAIL_QUEUE} e despacha
 * e-mails transacionais para o {@link EmailService}.
 */
export class EmailConsumer extends BaseConsumer<EmailPayload> {
  private readonly emailService: EmailService;

  constructor(emailService: EmailService, config: ConsumerConfig = {}) {
    super({
      ...config,
      queue: config.queue ?? EMAIL_QUEUE,
      dlxName: config.dlxName ?? EMAIL_DLX_NAME,
      dlqName: config.dlqName ?? EMAIL_DLQ_NAME,
    });
    this.emailService = emailService;
  }

  /**
   * Handler de domínio: despacha o payload para o {@link EmailService}
   * conforme o discriminador `type`.
   *
   * Rejeições (incluindo erros de payload desconhecido) propagam para o
   * {@link BaseConsumer.processMessage}, acionando o ciclo de retry/DLQ.
   */
  protected override async handlePayload(
    payload: EmailPayload,
    context: { correlationId: string; queue: string },
  ): Promise<void> {
    const { correlationId } = context;

    switch (payload.type) {
      case "password-reset": {
        const result = await this.emailService.sendPasswordReset(payload.to, payload.rawToken);
        this.logger.info("Password reset email sent", {
          correlationId,
          to: payload.to,
          messageId: result.messageId,
        });
        return;
      }
      default:
        throw new Error(`Unknown email payload type: ${(payload as { type?: string }).type}`);
    }
  }
}
