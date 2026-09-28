import { beforeAll, afterAll, describe, it } from "vitest";
import { UserApiClient } from "../helpers/user-api-client.ts";
import { Verifier } from "@pact-foundation/pact";
import type { IncomingMessage } from "node:http";
import { pactOptions, pactBroker } from "./pact.config.ts";
import { loadEnv } from "../../src/config/env.ts";
import { closeDatabase, resetDatabase } from "../setup/db.ts";
import { testDatabase } from "../setup/db.js";
import bcrypt from "bcrypt";

describe("Provider Verification", () => {
  let serverStarted = false;
  let adminToken = "";

  beforeAll(async () => {
    const runDatabaseIntegration = process.env.RUN_DB_INTEGRATION === "true";

    process.env.DATABASE_URL = runDatabaseIntegration
      ? (process.env.DATABASE_URL_TEST ??
        "postgres://postgres:postgres@localhost:5433/quality_test")
      : (process.env.DATABASE_URL ?? "postgresql://127.0.0.1:1/unavailable");
    process.env.PORT = process.env.PORT ?? "3000";

    const { port } = loadEnv();
    const baseUrl = `http://127.0.0.1:${port}`;

    if (!runDatabaseIntegration) {
      process.env.USER_REPOSITORY = "memory";
    }

    // Iniciar servidor real
    await import("../../src/server.ts");

    // Aguardar start
    const client = new UserApiClient(baseUrl);
    let serverReady = false;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try {
        await client.getAll();
        serverReady = true;
        break;
      } catch {
        /* server not ready yet, will retry */
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    if (!serverReady) {
      throw new Error("Server did not start");
    }

    serverStarted = true;

    if (runDatabaseIntegration) {
      await resetDatabase();
      const hash = await bcrypt.hash("admin-pact-12345", 12);
      await testDatabase.query(
        "INSERT INTO users (id, email, user_name, password_hash, role) VALUES ($1, $2, $3, $4, $5)",
        [
          "a7e9f8e3-1c2b-4d5a-9f8e-7c6b5a4d3e2f",
          "admin-pact@example.com",
          "Admin Pact",
          hash,
          "admin",
        ],
      );
      try {
        const login = await client.request("/auth/login", {
          method: "POST",
          body: JSON.stringify({
            email: "admin-pact@example.com",
            password: "admin-pact-12345",
          }),
        });
        if (login.status === 200) {
          const loginBody = login.body as { accessToken: string };
          adminToken = loginBody.accessToken;
        } else {
          console.warn(`Pact provider: admin login returned status ${login.status}`);
        }
      } catch (err) {
        console.warn("Pact provider: failed to obtain admin token", err);
      }
    } else {
      // In-memory mode: generate an admin JWT directly using the same
      // TokenService + JWT_SECRET that the running server uses, so that
      // the requestFilter can attach a valid Authorization header to
      // Pact-verified requests (otherwise authenticated endpoints 401).
      const { TokenService } = await import("../../src/services/token.service.ts");
      const tokenService = new TokenService();
      adminToken = tokenService.signAccess({ sub: "admin", role: "admin" });
    }

    // Prepara o estado "a user with id user-1 exists" uma vez no beforeAll.
    // O /setup e idempotente (Part B), entao chamar aqui e no stateHandler e seguro.
    try {
      await fetch(`${baseUrl}/setup`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          state: "a user with id 00000000-0000-0000-0000-000000000001 exists",
        }),
      });
    } catch (err) {
      console.warn("Pact provider: failed to set up user-1 state", err);
    }
  });

  afterAll(async () => {
    if (serverStarted) {
      process.emit("SIGTERM");
      await new Promise((resolve) => setTimeout(resolve, 50));
      const runDatabaseIntegration = process.env.RUN_DB_INTEGRATION === "true";
      if (runDatabaseIntegration) {
        await closeDatabase();
      }
    }
  });

  it("verifies the consumer contract with the running provider", async () => {
    if (!serverStarted) {
      throw new Error("Server not started, skipping provider verification");
    }

    const { port } = loadEnv();
    const baseUrl = `http://127.0.0.1:${port}`;

    const pactFile = process.env.PACT_PACT_FILE;
    const brokerConfigured = process.env.PACT_BROKER_BASE_URL || pactBroker.token;

    // Skip when no local pact file and no broker configured
    if (!pactFile && !brokerConfigured) {
      console.warn("Skipping provider verification: no PACT_PACT_FILE or PACT_BROKER_BASE_URL set");
      return;
    }

    const verifier = new Verifier({
      provider: pactOptions.provider,
      providerBaseUrl: baseUrl,
      providerVersion: "0.2.0",
      ...(pactFile
        ? { pactUrls: [pactFile] }
        : {
            pactBrokerUrl: pactBroker.baseUrl,
            ...(pactBroker.token ? { pactBrokerToken: pactBroker.token } : {}),
            consumerVersionTags: ["main"],
            publishVerificationResult: true,
          }),
      logLevel: "warn",
      stateHandlers: {
        "a user with id 00000000-0000-0000-0000-000000000001 exists": async () => {
          // O estado ja foi preparado no beforeAll (via fetch para /setup, fora do
          // escopo de interceptacao do Pact). O /setup e idempotente (Part B).
          // Retornamos Promise.resolve({}) para evitar que o Pact Verifier
          // reescreva a URL do fetch para _pactSetup (mock server interno).
          return {};
        },
      },
      requestFilter: ((req: IncomingMessage, _res: unknown, next: () => void) => {
        if (adminToken) {
          req.headers["authorization"] = `Bearer ${adminToken}`;
        }
        next();
      }) as never,
    });

    await verifier.verifyProvider();
  }, 30000);
});
