import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcrypt";
import { resetDatabase, testDatabase } from "../../setup/db.js";

// JWT_SECRET must be present before token.service.ts is imported (it reads the
// env var at module-load time). vi.hoisted runs before any import evaluation.
vi.hoisted(() => {
  vi.stubEnv("JWT_SECRET", "test-jwt-secret-for-integration");
});

const port = 3401 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}`;
const JWT_SECRET = "test-jwt-secret-for-integration";

const passwordHash = await bcrypt.hash("password", 10);

let seededUserId = "";
let adminToken = "";
let userToken = "";

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

async function seedUser(): Promise<void> {
  const result = await testDatabase.query<{ id: string }>(
    `INSERT INTO users (email, user_name, password_hash, role)
       VALUES ('user@example.com', 'User', $1, 'user')
       RETURNING id`,
    [passwordHash],
  );
  seededUserId = result.rows[0]?.id ?? "";
}

async function seedAdmin(): Promise<void> {
  const adminHash = await bcrypt.hash("admin-pass", 10);
  await testDatabase.query(
    `INSERT INTO users (id, email, user_name, password_hash, role)
       VALUES ('00000000-0000-0000-0000-000000000010', 'admin@example.com', 'Admin', $1, 'admin')`,
    [adminHash],
  );
}

async function login(
  email: string,
  password: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await response.json();
  return { accessToken: body.accessToken, refreshToken: body.refreshToken };
}

async function getAuthTokens(): Promise<void> {
  await seedAdmin();
  const adminLogin = await login("admin@example.com", "admin-pass");
  adminToken = adminLogin.accessToken;
  const userLogin = await login("user@example.com", "password");
  userToken = userLogin.accessToken;
}

async function postJson(
  path: string,
  body: unknown,
  token?: string,
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const responseBody = response.status === 204 ? undefined : await response.json();
  return { status: response.status, body: responseBody };
}

async function getJson(path: string, token?: string): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${baseUrl}${path}`, { headers });
  const responseBody = response.status === 204 ? undefined : await response.json();
  return { status: response.status, body: responseBody };
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
  await seedUser();
  await getAuthTokens();
});

describe("Security Input Validation (S06-04)", () => {
  // 1. POST /auth/login com email = "' OR '1'='1' --" → 401 invalid_credentials
  it("POST /auth/login with SQL injection in email returns 401 invalid_credentials", async () => {
    const res = await postJson("/auth/login", { email: "' OR '1'='1' --", password: "password" });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: "invalid_credentials",
      message: "Invalid credentials",
    });
  });

  // 2. POST /auth/login body JSON malformado "{invalid" → 400 invalid_request
  it("POST /auth/login with malformed JSON returns 400 invalid_request", async () => {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{invalid",
    });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual({
      error: "invalid_request",
      message: "Invalid request",
    });
  });

  // 3. POST /auth/login body = "null" → 400
  it("POST /auth/login with null body returns 400 invalid_request", async () => {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "null",
    });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual({
      error: "invalid_request",
      message: "Invalid request",
    });
  });

  // 4. POST /auth/login body = "[]" (array) → 400
  it("POST /auth/login with array body returns 400 invalid_request", async () => {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "[]",
    });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual({
      error: "invalid_request",
      message: "Invalid request",
    });
  });

  // 5. POST /auth/login email = objeto (tipo errado) → 400
  it("POST /auth/login with email as object returns 400 invalid_request", async () => {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: { foo: "bar" }, password: "password" }),
    });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual({
      error: "invalid_request",
      message: "Invalid request",
    });
  });

  // 6. POST /users (admin) com userName = "<script>alert(1)</script>" →
  //    201 + GET /users retorna string literal (API não sanitiza; fix é no
  //    frontend, comprovado pelo teste B)
  it("POST /users with XSS payload in userName returns 201 and GET /users returns literal string", async () => {
    const xssPayload = "<script>alert(1)</script>";
    const createRes = await postJson(
      "/users",
      {
        userName: xssPayload,
        email: "xss-test@example.com",
      },
      adminToken,
    );
    expect(createRes.status).toBe(201);

    // Verify the user was created and GET /users returns the literal string
    const listRes = await getJson("/users", adminToken);
    expect(listRes.status).toBe(200);
    const users = listRes.body as Array<{ userName: string }>;
    const xssUser = users.find((u) => u.userName === xssPayload);
    expect(xssUser).toBeDefined();
    expect(xssUser?.userName).toBe(xssPayload);
  });

  // 7. GET /users/:id com id = "../../etc/passwd" → 404 (route not found since path traversal doesn't match :id pattern)
  it("GET /users/:id with path traversal id returns 404", async () => {
    const res = await getJson("/users/../../etc/passwd", adminToken);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: "not_found",
      message: "Route not found",
    });
  });

  // 8. GET /payments?limit=999999 → ler código e assertar (400 ou clamp 100)
  it("GET /payments with limit=999999 returns 400 invalid_request", async () => {
    const res = await getJson("/payments?limit=999999", userToken);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "invalid_request",
      message: "Invalid limit (1-100)",
    });
  });

  // 9. GET /payments?status=<script> → 400 invalid status
  it("GET /payments with XSS payload in status returns 400 invalid_request", async () => {
    const res = await getJson("/payments?status=<script>", userToken);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "invalid_request",
      message: "Invalid status: <script>",
    });
  });

  // 10. GET /payments?userId=><script> → só payments do próprio user
  it("GET /payments with XSS payload in userId returns only own payments (filter ignored)", async () => {
    // Create a payment for the user
    await postJson(
      "/payments",
      {
        amount: 1000,
        currency: "BRL",
        idempotencyKey: "test-key-1",
        userId: seededUserId,
        status: "completed",
      },
      adminToken,
    );

    // Try to inject userId with XSS - should only return own payments
    const res = await getJson("/payments?userId=><script>", userToken);
    expect(res.status).toBe(200);
    const body = res.body as { items: Array<{ userId: string }> };
    // Should only return payments for the authenticated user
    expect(body.items.every((p) => p.userId === seededUserId)).toBe(true);
  });
});
