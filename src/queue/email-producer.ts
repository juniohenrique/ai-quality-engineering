/**
 * Wrapper do `RabbitMqProducer` focado em publicar e-mails transacionais.
 *
 * Centraliza a construção do payload tipado (`EmailPayload`) e o wiring da
 * exchange/DLQ de e-mails, de modo que os chamadores não precisem conhecer
 * os detalhes de configuração da fila.
 */
import { RabbitMqProducer, type PublishOptions } from "./producer.js";
import { EMAIL_DLQ_NAME, EMAIL_DLX_NAME, EMAIL_QUEUE } from "./email-setup.js";
import type { EmailPayload, PasswordResetEmailPayload } from "./email-consumer.js";

/**
 * Publica e-mails transacionais na fila {@link EMAIL_QUEUE}.
 */
export class EmailProducer {
  constructor(private readonly producer: RabbitMqProducer) {}

  /**
   * Publica um e-mail de redefinição de senha.
   *
   * @returns O correlation id atribuído à mensagem publicada.
   */
  async publishPasswordReset(to: string, rawToken: string): Promise<string> {
    const payload = {
      type: "password-reset",
      to,
      rawToken,
    } satisfies PasswordResetEmailPayload as EmailPayload;

    const options: PublishOptions = {
      dlxName: EMAIL_DLX_NAME,
      dlqName: EMAIL_DLQ_NAME,
    };

    return this.producer.publish(EMAIL_QUEUE, payload, options);
  }
}
