import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { URL } from "node:url";
import bcrypt from "bcrypt";
import { connect, type Channel, type ChannelModel } from "amqplib";
import { resetDatabase, testDatabase } from "../../setup/db.js";

// JWT_SECRET must be present before token.service.ts is imported (it reads the
// env var at module-load time). vi.hoisted runs before any import evaluation.
vi.hoisted(() => {
  vi.stubEnv("JWT_SECRET", "test-jwt-secret-for-integration");
});

import { PostgresUserRepository } from "../../../src/repositories/postgres-user.repository.js";
import { UserService } from "../../../src/services/user.service.js";
import { PasswordService } from "../../../src/services/password.service.js";
import { TokenService } from "../../../src/services/token.service.js";
import { TokenBlacklistService } from "../../../src/services/token-blacklist.service.js";
import { PasswordResetService } from "../../../src/services/password-reset.service.js";
import { RabbitMqProducer } from "../../../src/queue/producer.js";
import { EmailProducer } from "../../../src/queue/email-producer.js";
import { EmailConsumer } from "../../../src/queue/email-consumer.js";
import { assertDeadLetteredQueue } from "../../../src/queue/setup.js";
import { EMAIL_DLQ_NAME, EMAIL_DLX_NAME, EMAIL_QUEUE } from "../../../src/queue/email-setup.js";
import { AuthController } from "../../../src/controllers/auth.controller.js";
import { writeErrorResponse } from "../../../src/http/error-response.js";
import type { EmailService } from "../../../src/services/email.service.js";

const RABBITMQ_URL = process.env.RABBITMQ_URL ?? "amqp://guest:guest@localhost:5672";

// End-to-end auth + queue tests require a running RabbitMQ broker and the
// real PostgreSQL test database (gated on RUN_DB_INTEGRATION, same convention
// as the rest of the integration suite).
const runIntegration = process.env.RUN_DB_INTEGRATION === "true";
const describeIntegration = runIntegration ? describe : describe.skip;

const port = 3351 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}`;

// ── RabbitMQ helpers (mesmo padrão do producer-consumer.test.ts) ───────────

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

// ── waitFor helper (pattern igual waitForPayment do consumer.test.ts) ──────

/** Polls until `predicate` returns truthy or `timeoutMs` elapses. */
async function waitFor<T>(
  predicate: () => T | undefined,
  timeoutMs = 10000,
  interval = 100,
): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = predicate();
    if (result) {
      return result as T;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error(`Condition was not met within ${timeoutMs}ms`);
}

// ── readRequestBody (mesmo padrão do server.ts) ─────────────────────────────

const readRequestBody = async (request: IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
};

describeIntegration("POST /auth/password-reset (integration)", () => {
  let rabbitMqProducer: RabbitMqProducer;
  let emailProducer: EmailProducer;
  let emailConsumer: EmailConsumer;
  let emailServiceMock: { sendPasswordReset: ReturnType<typeof vi.fn> };
  let server: Server;

  beforeAll(async () => {
    await purgeQueue();

    // Real services against the real test database pool (DATABASE_URL_TEST).
    const userRepository = new PostgresUserRepository(testDatabase);
    const userService = new UserService(userRepository);
    const passwordService = new PasswordService();
    const tokenService = new TokenService();
    const tokenBlacklist = new TokenBlacklistService();
    const passwordResetService = new PasswordResetService(testDatabase, userService);

    // Real RabbitMQ producer / consumer — same RABBITMQ_URL as producer-consumer.test.ts
    rabbitMqProducer = new RabbitMqProducer({ url: RABBITMQ_URL, attempts: 5, delayMs: 200 });
    emailProducer = new EmailProducer(rabbitMqProducer);

    // Mock email service injected into the real consumer
    emailServiceMock = {
      sendPasswordReset: vi.fn().mockResolvedValue({ messageId: "test-msg" }),
    };

    emailConsumer = new EmailConsumer(emailServiceMock as unknown as EmailService, {
      url: RABBITMQ_URL,
      attempts: 5,
      delayMs: 200,
    });

    const authController = new AuthController({
      userService,
      passwordService,
      tokenService,
      blacklist: tokenBlacklist,
      passwordResetService,
      emailProducer,
    });

    // createServer com rotas: POST /auth/forgot-password, /auth/reset-password,
    // /auth/login (padrão readRequestBody + JSON.parse + writeErrorResponse)
    server = createServer(async (request, response) => {
      const requestUrl = new URL(request.url ?? "/", "http://_internal_");

      if (requestUrl.pathname === "/auth/forgot-password" && request.method === "POST") {
        try {
          const body = await readRequestBody(request);
          await authController.handleForgotPassword(JSON.parse(body), response);
        } catch {
          writeErrorResponse(response, 400, "invalid_request", "Invalid request");
        }
        return;
      }

      if (requestUrl.pathname === "/auth/reset-password" && request.method === "POST") {
        try {
          const body = await readRequestBody(request);
          await authController.handleResetPassword(JSON.parse(body), response);
        } catch {
          writeErrorResponse(response, 400, "invalid_request", "Invalid request");
        }
        return;
      }

      if (requestUrl.pathname === "/auth/login" && request.method === "POST") {
        try {
          const body = await readRequestBody(request);
          await authController.handleLogin(JSON.parse(body), response);
        } catch {
          writeErrorResponse(response, 400, "invalid_request", "Invalid request");
        }
        return;
      }

      if (requestUrl.pathname === "/health" && request.method === "GET") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ status: "ok" }));
        return;
      }

      writeErrorResponse(response, 404, "not_found", "Route not found");
    });

    await emailConsumer.start();

    await new Promise<void>((resolve, reject) => {
      server.listen(port, () => resolve());
      server.on("error", reject);
    });
  }, 30000);

  afterAll(async () => {
    if (emailConsumer) {
      await emailConsumer.close().catch(() => undefined);
    }
    if (rabbitMqProducer) {
      await rabbitMqProducer.close().catch(() => undefined);
    }
    await purgeQueue().catch(() => undefined);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await testDatabase.end();
  }, 30000);

  beforeEach(async () => {
    await resetDatabase();
    await purgeQueue();

    const hash = await bcrypt.hash("old-password", 12);
    await testDatabase.query(
      `INSERT INTO users (id, email, user_name, password_hash, role)
         VALUES ('00000000-0000-0000-0000-000000000010',
                 'reset-test@example.com', 'Reset Test', $1, 'user')`,
      [hash],
    );

    emailServiceMock.sendPasswordReset.mockClear();
  }, 15000);

  // ── Testes ───────────────────────────────────────────────────────────────

  it("POST /auth/forgot-password returns 204 and publishes email", async () => {
    const response = await fetch(`${baseUrl}/auth/forgot-password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "reset-test@example.com" }),
    });

    expect(response.status).toBe(204);

    await waitFor(
      () => {
        if (emailServiceMock.sendPasswordReset.mock.calls.length >= 1) {
          return emailServiceMock.sendPasswordReset.mock.calls[0];
        }
        return undefined;
      },
      10000,
      100,
    );

    expect(emailServiceMock.sendPasswordReset).toHaveBeenCalledTimes(1);
    expect(emailServiceMock.sendPasswordReset).toHaveBeenCalledWith(
      "reset-test@example.com",
      expect.stringMatching(/^[0-9a-f]{64}$/),
    );
  }, 15000);

  it("POST /auth/forgot-password returns 204 for unknown email (anti-enumeration)", async () => {
    const response = await fetch(`${baseUrl}/auth/forgot-password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "ghost@example.com" }),
    });

    expect(response.status).toBe(204);

    // Dar chance do consumer processar algo errado
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(emailServiceMock.sendPasswordReset).not.toHaveBeenCalled();
  }, 15000);

  it("full flow: forgot → reset → login with new password", async () => {
    // 1. POST /auth/forgot-password
    const forgotResponse = await fetch(`${baseUrl}/auth/forgot-password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "reset-test@example.com" }),
    });

    expect(forgotResponse.status).toBe(204);

    // Captura rawToken do mock
    const rawToken = await waitFor(
      () => {
        if (emailServiceMock.sendPasswordReset.mock.calls.length >= 1) {
          return emailServiceMock.sendPasswordReset.mock.calls[0][1] as string;
        }
        return undefined;
      },
      10000,
      100,
    );

    // 2. POST /auth/reset-password
    const resetResponse = await fetch(`${baseUrl}/auth/reset-password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: rawToken, newPassword: "new-45678" }),
    });

    expect(resetResponse.status).toBe(204);

    // 3. POST /auth/login with new password → 200
    const loginNew = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "reset-test@example.com",
        password: "new-45678",
      }),
    });

    expect(loginNew.status).toBe(200);

    // 4. POST /auth/login with old password → 401
    const loginOld = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "reset-test@example.com",
        password: "old-password",
      }),
    });

    expect(loginOld.status).toBe(401);
    const oldBody = await loginOld.json();
    expect(oldBody).toEqual({
      error: "invalid_credentials",
      message: "Invalid credentials",
    });
  }, 15000);

  it("reset-password rejects already-used token", async () => {
    // 1. POST /auth/forgot-password
    await fetch(`${baseUrl}/auth/forgot-password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "reset-test@example.com" }),
    });

    // Captura rawToken
    const rawToken = await waitFor(
      () => {
        if (emailServiceMock.sendPasswordReset.mock.calls.length >= 1) {
          return emailServiceMock.sendPasswordReset.mock.calls[0][1] as string;
        }
        return undefined;
      },
      10000,
      100,
    );

    // 2. First reset (should succeed)
    const firstReset = await fetch(`${baseUrl}/auth/reset-password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: rawToken, newPassword: "new-45678" }),
    });

    expect(firstReset.status).toBe(204);

    // 3. Second reset with same token (should fail)
    const secondReset = await fetch(`${baseUrl}/auth/reset-password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: rawToken, newPassword: "new-45678" }),
    });

    expect(secondReset.status).toBe(400);
    const body = await secondReset.json();
    expect(body).toEqual({
      error: "invalid_token",
      message: "Invalid or expired token",
    });
  }, 15000);

  it("reset-password rejects tampered token", async () => {
    const response = await fetch(`${baseUrl}/auth/reset-password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "0".repeat(64), newPassword: "new-45678" }),
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual({
      error: "invalid_token",
      message: "Invalid or expired token",
    });
  }, 15000);

  it("reset-password rejects short password", async () => {
    const response = await fetch(`${baseUrl}/auth/reset-password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "abc", newPassword: "short" }),
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual({
      error: "invalid_request",
      message: "Invalid request",
    });
  }, 15000);
});
