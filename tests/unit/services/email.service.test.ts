import { describe, expect, it, vi } from "vitest";
import { EmailService } from "../../../src/services/email.service.js";
import type { EmailTransport } from "../../../src/services/email.service.js";

/**
 * Cria um transporte de e-mails com espiã `sendMail` configurada para
 * resolver com `{ messageId }`. Permite inspecionar os argumentos de
 * cada chamada e simular o retorno do transporte real.
 */
function createTransportMock() {
  const sendMail = vi.fn().mockResolvedValue({ messageId: "test-msg-id" });
  const transport: EmailTransport = { sendMail };
  return { transport, sendMail };
}

/** Configuração padrão usada pelos testes. */
function createDefaultConfig(): { transport: EmailTransport; from: string; baseUrl: string } {
  const { transport } = createTransportMock();
  return {
    transport,
    from: "no-reply@ai-quality-eng.local",
    baseUrl: "http://localhost:3000",
  };
}

describe("EmailService", () => {
  describe("sendPasswordReset", () => {
    const to = "ada@example.com";
    const rawToken = "raw-token-abc123";

    it("chama transport.sendMail com { from, to, subject, text, html }", async () => {
      const { sendMail } = createTransportMock();
      const config = createDefaultConfig();
      config.transport = { sendMail };

      const service = new EmailService(config);

      await service.sendPasswordReset(to, rawToken);

      expect(sendMail).toHaveBeenCalledTimes(1);
      const call = sendMail.mock.calls[0][0];

      expect(call).toEqual({
        from: "no-reply@ai-quality-eng.local",
        to,
        subject: "Redefinição de senha",
        text: expect.any(String),
        html: expect.any(String),
      });
    });

    it("o campo text contém o link com o rawToken", async () => {
      const { sendMail } = createTransportMock();
      const config = createDefaultConfig();
      config.transport = { sendMail };

      const service = new EmailService(config);

      await service.sendPasswordReset(to, rawToken);

      const text = sendMail.mock.calls[0][0].text;
      const expectedLink = `http://localhost:3000/reset-password?token=${rawToken}`;

      expect(text).toContain(expectedLink);
    });

    it("o campo html contém <a href> com o mesmo link", async () => {
      const { sendMail } = createTransportMock();
      const config = createDefaultConfig();
      config.transport = { sendMail };

      const service = new EmailService(config);

      await service.sendPasswordReset(to, rawToken);

      const html = sendMail.mock.calls[0][0].html;
      const expectedLink = `http://localhost:3000/reset-password?token=${rawToken}`;

      expect(html).toContain(`<a href="${expectedLink}">`);
    });

    it("usa o baseUrl injetado na construção (não hardcoded)", async () => {
      const baseUrl = "https://app.example.com";
      const { sendMail } = createTransportMock();
      const config = createDefaultConfig();
      config.baseUrl = baseUrl;
      config.transport = { sendMail };

      const service = new EmailService(config);

      await service.sendPasswordReset(to, rawToken);

      const text = sendMail.mock.calls[0][0].text;
      const html = sendMail.mock.calls[0][0].html;
      const expectedLink = `${baseUrl}/reset-password?token=${rawToken}`;

      expect(text).toContain(expectedLink);
      expect(html).toContain(expectedLink);
    });

    it("o subject não é vazio nem a string 'undefined'", async () => {
      const { sendMail } = createTransportMock();
      const config = createDefaultConfig();
      config.transport = { sendMail };

      const service = new EmailService(config);

      await service.sendPasswordReset(to, rawToken);

      const subject: string = sendMail.mock.calls[0][0].subject;

      expect(subject).not.toBe("");
      expect(subject).not.toBe("undefined");
      expect(subject.length).toBeGreaterThan(0);
    });

    it("retorna { messageId } propagado do transport", async () => {
      const transport = {
        sendMail: vi.fn().mockResolvedValue({ messageId: "propagated-id" }),
      };
      const config = { ...createDefaultConfig(), transport };

      const service = new EmailService(config);

      const result = await service.sendPasswordReset(to, rawToken);

      expect(result).toEqual({ messageId: "propagated-id" });
    });
  });
});
