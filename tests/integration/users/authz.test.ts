import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcrypt";
import { resetDatabase, testDatabase } from "../../setup/db.js";

// JWT_SECRET must be present before token.service.ts is imported (it reads the
// env var at module-load time). vi.hoisted runs before any import evaluation.
vi.hoisted(() => {
  vi.stubEnv("JWT_SECRET", "test-jwt-secret-for-integration");
});

const port = 3331 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}`;
const JWT_SECRET = "test-jwt-secret-for-integration";

const adminPasswordHash = await bcrypt.hash("admin-pass-12345", 10);
const userPasswordHash = await bcrypt.hash("user-pass-12345", 10);

let adminId = "";
let userId = "";

async function waitForServer(timeoutMs = 10000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.status === 503 || response.status === 200) {
        return;
      }
    } catch {
      // server not ready yet — keep retrying
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Server did not start within ${timeoutMs}ms`);
}

async function seedUsers(): Promise<void> {
  const adminResult = await testDatabase.query<{ id: string }>(
    `INSERT INTO users (email, user_name, password_hash, role)
       VALUES ('admin-authz@example.com', 'Admin Authz', $1, 'admin')
       RETURNING id`,
    [adminPasswordHash],
  );
  adminId = adminResult.rows[0]?.id ?? "";

  const userResult = await testDatabase.query<{ id: string }>(
    `INSERT INTO users (email, user_name, password_hash, role)
       VALUES ('user-authz@example.com', 'User Authz', $1, 'user')
       RETURNING id`,
    [userPasswordHash],
  );
  userId = userResult.rows[0]?.id ?? "";
}

async function loginAdmin(): Promise<string> {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "admin-authz@example.com", password: "admin-pass-12345" }),
  });
  const body = await response.json();
  return body.accessToken;
}

async function loginUser(): Promise<string> {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "user-authz@example.com", password: "user-pass-12345" }),
  });
  const body = await response.json();
  return body.accessToken;
}

async function request(
  method: string,
  path: string,
  options: { headers?: Record<string, string>; body?: string } = {},
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "content-type": "application/json", ...options.headers },
    body: options.body,
  });
  const body = response.status === 204 ? undefined : await response.json();
  return { status: response.status, body };
}

beforeAll(async () => {
  process.env.PORT = String(port);
  process.env.DATABASE_URL =
    process.env.DATABASE_URL_TEST ?? "postgres://postgres:postgres@localhost:5433/quality_test";
  process.env.JWT_SECRET = JWT_SECRET;
  await import("../../../src/server.js");
  await waitForServer();
}, 15000);

afterAll(async () => {
  process.emit("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 50));
  await testDatabase.end();
});

beforeEach(async () => {
  await resetDatabase();
  await seedUsers();
}, 15000);

describe("GET /users (list)", () => {
  it("returns 401 without token", async () => {
    const res = await request("GET", "/users");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "unauthorized", message: "Unauthorized" });
  });

  it("returns 403 with user role", async () => {
    const token = await loginUser();
    const res = await request("GET", "/users", { headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "forbidden", message: "Forbidden" });
  });

  it("returns 200 with admin role", async () => {
    const token = await loginAdmin();
    const res = await request("GET", "/users", { headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    const body = res.body as Array<{ id: string; email: string; userName: string; role: string }>;
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(2);
  });
});

describe("POST /users (create)", () => {
  const validUser = { email: "new@example.com", userName: "New User" };

  it("returns 401 without token", async () => {
    const res = await request("POST", "/users", { body: JSON.stringify(validUser) });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "unauthorized", message: "Unauthorized" });
  });

  it("returns 403 with user role", async () => {
    const token = await loginUser();
    const res = await request("POST", "/users", {
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify(validUser),
    });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "forbidden", message: "Forbidden" });
  });

  it("returns 201 with admin role", async () => {
    const token = await loginAdmin();
    const res = await request("POST", "/users", {
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify(validUser),
    });
    expect(res.status).toBe(201);
    const body = res.body as { id: string; email: string; userName: string; role: string };
    expect(body).toMatchObject({ email: "new@example.com", userName: "New User", role: "user" });
    expect(body.id).toBeDefined();
  });
});

describe("PUT /users/:id (update)", () => {
  const updateData = { email: "updated@example.com", userName: "Updated Name" };

  it("returns 401 without token", async () => {
    const res = await request("PUT", `/users/${userId}`, { body: JSON.stringify(updateData) });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "unauthorized", message: "Unauthorized" });
  });

  it("returns 403 with user role", async () => {
    const token = await loginUser();
    const res = await request("PUT", `/users/${userId}`, {
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify(updateData),
    });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "forbidden", message: "Forbidden" });
  });

  it("returns 200 with admin role", async () => {
    const token = await loginAdmin();
    const res = await request("PUT", `/users/${userId}`, {
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify(updateData),
    });
    expect(res.status).toBe(200);
    const body = res.body as { id: string; email: string; userName: string; role: string };
    expect(body).toMatchObject({
      email: "updated@example.com",
      userName: "Updated Name",
      role: "user",
    });
  });
});

describe("DELETE /users/:id (delete)", () => {
  it("returns 401 without token", async () => {
    const res = await request("DELETE", `/users/${userId}`);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "unauthorized", message: "Unauthorized" });
  });

  it("returns 403 with user role", async () => {
    const token = await loginUser();
    const res = await request("DELETE", `/users/${userId}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "forbidden", message: "Forbidden" });
  });

  it("returns 204 with admin role", async () => {
    const token = await loginAdmin();
    const res = await request("DELETE", `/users/${userId}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(204);
    expect(res.body).toBeUndefined();
  });
});

describe("PATCH /users/:id/role (change role)", () => {
  const roleChange = { role: "admin" as const };

  it("returns 401 without token", async () => {
    const res = await request("PATCH", `/users/${userId}/role`, {
      body: JSON.stringify(roleChange),
    });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "unauthorized", message: "Unauthorized" });
  });

  it("returns 403 with user role", async () => {
    const token = await loginUser();
    const res = await request("PATCH", `/users/${userId}/role`, {
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify(roleChange),
    });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "forbidden", message: "Forbidden" });
  });

  it("returns 200 with admin role changing another user", async () => {
    const token = await loginAdmin();
    const res = await request("PATCH", `/users/${userId}/role`, {
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify(roleChange),
    });
    expect(res.status).toBe(200);
    const body = res.body as { id: string; email: string; userName: string; role: string };
    expect(body).toMatchObject({ role: "admin" });
  });

  it("returns 403 when admin tries to change own role", async () => {
    const token = await loginAdmin();
    const res = await request("PATCH", `/users/${adminId}/role`, {
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify(roleChange),
    });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "forbidden", message: "Cannot change your own role" });
  });
});
