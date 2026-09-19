import { describe, expect, it } from "vitest";
import { projectName } from "../../src/index.js";
import { HealthController } from "../../src/controllers/health.controller.js";
import { HealthService } from "../../src/services/health.service.js";

describe("project bootstrap", () => {
  it("exposes the project name", () => {
    expect(projectName).toBe("ai-quality-engineering");
  });
});

describe("health architecture", () => {
  it("returns the database state from the service layer", async () => {
    const service = new HealthService({
      checkDatabaseHealth: async () => true,
    });

    await expect(service.getHealth()).resolves.toEqual({
      status: "ok",
      database: "connected",
    });
  });

  it("returns a degraded state when the database is unavailable", async () => {
    const service = new HealthService({
      checkDatabaseHealth: async () => false,
    });

    await expect(service.getHealth()).resolves.toEqual({
      status: "degraded",
      database: "unavailable",
    });
  });

  it("writes the http response using the controller without touching the database", async () => {
    const writes: string[] = [];
    const response = {
      writeHead: (statusCode: number, headers: Record<string, string>) => ({
        statusCode,
        headers,
      }),
      end: (body: string) => {
        writes.push(body);
      },
    };

    const controller = new HealthController({
      getHealth: async () => ({ status: "ok", database: "connected" }),
    });

    await controller.handleHealth(response as never);

    expect(writes).toEqual([JSON.stringify({ status: "ok", database: "connected" })]);
  });
});
