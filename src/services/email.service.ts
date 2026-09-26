/**
 * Serviço de e-mails transacionais.
 *
 * Responsável por compor e enviar e-mails relacionados a fluxos
 * transacionais da aplicação, como a redefinição de senha. O transporte
 * real de e-mails é abstraído através de `EmailTransport`, permitindo
 * injeção de dependência e substituição por mocks em testes.
 */

/**
 * Transporte de e-mails.
 *
 * Define o contrato mínimo para qualquer transporte capaz de enviar
 * um e-mail. A assinatura de `sendMail` é compatível estruturalmente
 * com `nodemailer.Transporter`, permitindo que um transporte real criado
 * via `nodemailer.createTransport` seja atribuído diretamente a este
 * tipo.
 */
export interface EmailTransport {
  sendMail(options: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<{ messageId: string }>;
}

/**
 * Configuração necessária para a construção de um `EmailService`.
 */
export interface EmailServiceConfig {
  /** Transporte utilizado para o envio dos e-mails. */
  transport: EmailTransport;
  /** Remetente padrão dos e-mails (ex: "no-reply@ai-quality-eng.local"). */
  from: string;
  /** URL base da aplicação, usada para montar links de ações. */
  baseUrl: string;
}

/**
 * Serviço responsável pelo envio de e-mails transacionais.
 */
export class EmailService {
  constructor(private readonly config: EmailServiceConfig) {}

  /**
   * Envia um e-mail de redefinição de senha para o destinatário informado.
   *
   * O e-mail contém um link único com o token bruto, que expira em 15
   * minutos, e é composto tanto em formato texto puro quanto em HTML.
   *
   * @param to        E-mail do destinatário.
   * @param rawToken  Token bruto (não hash) de redefinição de senha.
   * @returns `{ messageId }` retornado pelo transporte após o envio.
   */
  async sendPasswordReset(to: string, rawToken: string): Promise<{ messageId: string }> {
    const link = `${this.config.baseUrl}/reset-password?token=${rawToken}`;
    const subject = "Redefinição de senha";

    const text = [
      "Você está recebendo este e-mail porque solicitou a redefinição de senha da sua conta.",
      "",
      "Clique no link abaixo para redefinir sua senha. O link expira em 15 minutos:",
      "",
      link,
      "",
      "Se você não solicitou a redefinição de senha, ignore este e-mail.",
    ].join("\n");

    const html = [
      "<p>Você está recebendo este e-mail porque solicitou a redefinição de senha da sua conta.</p>",
      "<p>Clique no link abaixo para redefinir sua senha. O link expira em 15 minutos:</p>",
      `<p><a href="${link}">Redefinir senha</a></p>`,
      "<p>Se você não solicitou a redefinição de senha, ignore este e-mail.</p>",
    ].join("\n");

    return this.config.transport.sendMail({
      from: this.config.from,
      to,
      subject,
      text,
      html,
    });
  }
}
