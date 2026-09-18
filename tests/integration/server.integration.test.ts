import { afterAll, beforeAll, describe, expect, it } from "vitest";

const port = 3100 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}`;

interface ApiUser {
  id: string;
  email: string;
  name: string;
}

beforeAll(async () => {
  process.env.PORT = String(port);
  process.env.DATABASE_URL = "postgresql://127.0.0.1:1/unavailable";
  await import("../../src/server.js");

  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      await fetch(`${baseUrl}/users`);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  throw new Error("Server did not start");
});

afterAll(async () => {
  process.emit("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 50));
});

describe("HTTP API", () => {
  it("supports health, users, and missing route requests", async () => {
    const health = await fetch(`${baseUrl}/health`);
    expect(health.status).toBe(503);
    expect(await health.json()).toEqual({
      status: "degraded",
      database: "unavailable",
    });

    const users = await fetch(`${baseUrl}/users`);
    expect(users.status).toBe(200);
    expect(await users.json()).toEqual([]);

    const missingRoute = await fetch(`${baseUrl}/unknown`);
    expect(missingRoute.status).toBe(404);
    expect(await missingRoute.json()).toEqual({
      error: "not_found",
      message: "Route not found",
    });
  });

  it("creates, finds, updates, and deletes a user", async () => {
    const created = await fetch(`${baseUrl}/users`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "ada@example.com", name: "Ada Lovelace" }),
    });
    expect(created.status).toBe(201);
    const user = (await created.json()) as ApiUser;
    expect(user).toMatchObject({ email: "ada@example.com", name: "Ada Lovelace" });

    const found = await fetch(`${baseUrl}/users/${user.id}`);
    expect(found.status).toBe(200);
    expect(await found.json()).toEqual(user);

    const updated = await fetch(`${baseUrl}/users/${user.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "ada.updated@example.com", name: "Ada Byron Lovelace" }),
    });
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({
      id: user.id,
      email: "ada.updated@example.com",
      name: "Ada Byron Lovelace",
    });

    const deleted = await fetch(`${baseUrl}/users/${user.id}`, { method: "DELETE" });
    expect(deleted.status).toBe(204);
  });

  it("rejects invalid POST and PUT payloads", async () => {
    const invalidPost = await fetch(`${baseUrl}/users`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{invalid",
    });
    expect(invalidPost.status).toBe(400);

    const invalidPut = await fetch(`${baseUrl}/users/user-1`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: "{invalid",
    });
    expect(invalidPut.status).toBe(400);
  });
});
