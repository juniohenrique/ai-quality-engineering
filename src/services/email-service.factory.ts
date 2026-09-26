/**
 * Factory de construção do `EmailService`.
 *
 * Escolhe o transporte de e-mails de acordo com o ambiente:
 *
 * - **Produção/homologação:** quando `SMTP_HOST` está definido, utiliza
 *   um transporte SMTP real com as credenciais fornecidas.
 * - **Desenvolvimento/testes:** quando `SMTP_HOST` não está definido,
 *   cria uma conta de teste no Ethereal (banco de e-mails de teste
 *   gratuito do nodemailer) e registra as credenciais no console.
 */
import nodemailer from "nodemailer";
import { EmailService } from "./email.service.js";
import type { EmailTransport } from "./email.service.js";

/**
 * Cria e retorna uma instância configurada de `EmailService`.
 *
 * As seguintes variáveis de ambiente são lidas:
 *
 * - `APP_BASE_URL`  — URL base da aplicação (default: "http://localhost:3000").
 * - `SMTP_FROM`     — remetente padrão (default: "no-reply@ai-quality-eng.local").
 * - `SMTP_HOST`     — host do servidor SMTP. Quando definido, ativa o transporte SMTP real.
 * - `SMTP_PORT`     — porta do servidor SMTP (default: 587).
 * - `SMTP_USER`     — usuário de autenticação SMTP.
 * - `SMTP_PASS`     — senha de autenticação SMTP.
 */
export async function createEmailService(): Promise<EmailService> {
  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const from = process.env.SMTP_FROM ?? "no-reply@ai-quality-eng.local";

  const {
    SMTP_HOST: smtpHost,
    SMTP_PORT: smtpPort,
    SMTP_USER: smtpUser,
    SMTP_PASS: smtpPass,
  } = process.env;

  let transport: EmailTransport;

  if (smtpHost) {
    transport = nodemailer.createTransport({
      host: smtpHost,
      port: Number(smtpPort ?? 587),
      auth: {
        user: smtpUser ?? "",
        pass: smtpPass ?? "",
      },
    });
  } else {
    const testAccount = await nodemailer.createTestAccount();

    transport = nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });

    console.info("Ethereal test account:", {
      user: testAccount.user,
      pass: testAccount.pass,
      web: "https://ethereal.email/login",
    });
  }

  return new EmailService({ transport, from, baseUrl });
}
