import { beforeAll, afterAll, describe, it } from "vitest";
import { UserApiClient } from "../helpers/user-api-client.ts";
import { Verifier } from "@pact-foundation/pact";
import { pactOptions, pactBroker } from "./pact.config.ts";
import { loadEnv } from "../../src/config/env.ts";
import { closeDatabase, resetDatabase } from "../setup/db.ts";

describe("Provider Verification", () => {
  let serverStarted = false;

  beforeAll(async () => {
    const runDatabaseIntegration = process.env.RUN_DB_INTEGRATION === "true";

    process.env.DATABASE_URL = runDatabaseIntegration
      ? (process.env.DATABASE_URL_TEST ??
        "postgres://postgres:postgres@localhost:5433/quality_test")
      : (process.env.DATABASE_URL ?? "postgresql://127.0.0.1:1/unavailable");
    process.env.PORT = process.env.PORT ?? "3000";

    const { port } = loadEnv();
    const baseUrl = `http://127.0.0.1:${port}`;

    if (runDatabaseIntegration) {
      await resetDatabase();
    }
    if (!runDatabaseIntegration) {
      process.env.USER_REPOSITORY = "memory";
    }

    // Iniciar servidor real
    await import("../../src/server.ts");

    // Aguardar start
    const client = new UserApiClient(baseUrl);
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try {
        await client.getAll();
        serverStarted = true;
        return;
      } catch {
        /* server not ready yet, will retry */
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    throw new Error("Server did not start");
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
      verbose: true,
      providerStatesSetupUrl: `${baseUrl}/setup`,
    });

    await verifier.verifyProvider();
  });
});
