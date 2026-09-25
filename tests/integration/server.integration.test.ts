import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, resetDatabase } from "../setup/db.js";
import { UserApiClient } from "../helpers/user-api-client.js";

const port = 3100 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}`;
const runDatabaseIntegration = process.env.RUN_DB_INTEGRATION === "true";
const userApi = new UserApiClient(baseUrl);

async function waitForServer(timeoutMs = 10000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await userApi.getAll();
      return;
    } catch {
      // server not ready yet — keep retrying
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Server did not start within ${timeoutMs}ms`);
}

beforeAll(async () => {
  process.env.PORT = String(port);
  process.env.DATABASE_URL = runDatabaseIntegration
    ? (process.env.DATABASE_URL_TEST ?? "postgres://postgres:postgres@localhost:5433/quality_test")
    : "postgresql://127.0.0.1:1/unavailable";
  if (!runDatabaseIntegration) {
    process.env.USER_REPOSITORY = "memory";
  }
  if (runDatabaseIntegration) {
    await resetDatabase();
  }
  await import("../../src/server.js");

  await waitForServer();
}, 15000);

afterAll(async () => {
  process.emit("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 50));
  if (runDatabaseIntegration) {
    await closeDatabase();
  }
});

beforeEach(async () => {
  if (runDatabaseIntegration) {
    await resetDatabase();
  }
});

describe("HTTP API", () => {
  it("supports health, users, and missing route requests", async () => {
    const health = await userApi.getHealth();
    expect(health.status).toBe(runDatabaseIntegration ? 200 : 503);
    expect(health.body).toEqual({
      status: runDatabaseIntegration ? "ok" : "degraded",
      database: runDatabaseIntegration ? "connected" : "unavailable",
    });

    const users = await userApi.getAll();
    expect(users.status).toBe(200);
    expect(users.body).toEqual([]);

    const missingRoute = await userApi.request<{ error: string; message: string }>("/unknown");
    expect(missingRoute.status).toBe(404);
    expect(missingRoute.body).toEqual({
      error: "not_found",
      message: "Route not found",
    });
  });

  it("creates, finds, updates, and deletes a user", async () => {
    const created = await userApi.create({ email: "ada@example.com", userName: "Ada Lovelace" });
    expect(created.status).toBe(201);
    const user = created.body;
    expect(user).toMatchObject({ email: "ada@example.com", userName: "Ada Lovelace" });

    const found = await userApi.getById(user.id);
    expect(found.status).toBe(200);
    expect(found.body).toEqual(user);

    const updated = await userApi.update(user.id, {
      email: "ada.updated@example.com",
      userName: "Ada Byron Lovelace",
    });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({
      id: user.id,
      email: "ada.updated@example.com",
      userName: "Ada Byron Lovelace",
    });

    const deleted = await userApi.delete(user.id);
    expect(deleted.status).toBe(204);
  });

  it("rejects invalid POST and PUT payloads", async () => {
    const invalidPost = await userApi.request("/users", {
      method: "POST",
      body: "{invalid",
    });
    expect(invalidPost.status).toBe(400);

    const invalidPut = await userApi.request("/users/user-1", {
      method: "PUT",
      body: "{invalid",
    });
    expect(invalidPut.status).toBe(400);
  });

  it("authenticates the login endpoint", async () => {
    const login = await userApi.request<{ token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "test@example.com", password: "password" }),
    });
    expect(login.status).toBe(200);
    expect(login.body).toHaveProperty("token");
    expect(typeof login.body.token).toBe("string");
    expect(login.body.token.length).toBeGreaterThan(0);

    const invalidLogin = await userApi.request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "test@example.com", password: "wrong" }),
    });
    expect(invalidLogin.status).toBe(401);
  });
});
