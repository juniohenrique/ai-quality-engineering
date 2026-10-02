import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import bcrypt from "bcrypt";
import { resetDatabase, testDatabase } from "../setup/db.js";

/*
 * E2E Test — Payments Listing (S06-15)
 *
 * Valida a listagem de pagamentos em /payments.html com:
 * - badges de status coloridos
 * - filtro por status
 * - botão Limpar
 * - redirecionamento quando não autenticado
 *
 * NÃO modifica src/, public/ ou outros testes.
 */

const ADMIN_USER = {
  id: "00000000-0000-0000-0000-000000000010",
  email: "admin@example.com",
  userName: "Admin User",
  role: "admin" as const,
  password: "admin-pass-12345",
};

const USER1 = {
  id: "00000000-0000-0000-0000-000000000030",
  email: "user1@example.com",
  userName: "User One",
  role: "user" as const,
  password: "user1-pass-12345",
};

const USER2 = {
  id: "00000000-0000-0000-0000-000000000040",
  email: "user2@example.com",
  userName: "User Two",
  role: "user" as const,
  password: "user2-pass-12345",
};

async function seedUsers(): Promise<void> {
  const adminHash = await bcrypt.hash(ADMIN_USER.password, 10);
  const user1Hash = await bcrypt.hash(USER1.password, 10);
  const user2Hash = await bcrypt.hash(USER2.password, 10);

  await testDatabase.query(
    "INSERT INTO users (id, email, user_name, password_hash, role) VALUES ($1, $2, $3, $4, $5)",
    [ADMIN_USER.id, ADMIN_USER.email, ADMIN_USER.userName, adminHash, ADMIN_USER.role],
  );
  await testDatabase.query(
    "INSERT INTO users (id, email, user_name, password_hash, role) VALUES ($1, $2, $3, $4, $5)",
    [USER1.id, USER1.email, USER1.userName, user1Hash, USER1.role],
  );
  await testDatabase.query(
    "INSERT INTO users (id, email, user_name, password_hash, role) VALUES ($1, $2, $3, $4, $5)",
    [USER2.id, USER2.email, USER2.userName, user2Hash, USER2.role],
  );
}

/**
 * Helper de login via UI. Navega até /login.html, preenche as credenciais,
 * submete o formulário e aguarda o redirecionamento para /users.
 * Os tokens (auth_access_token / auth_refresh_token) são persistidos no
 * localStorage do browser context por app.js antes da navegação.
 */
async function loginAs(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login.html");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/users/);
  await page.waitForLoadState("networkidle");
}

/**
 * Cria um payment via API usando o request context do Playwright.
 * Retorna o payment criado (incluindo ID).
 */
async function createPayment(
  request: APIRequestContext,
  token: string,
  payload: {
    userId: string;
    amount: number;
    currency: string;
    status: "pending" | "processing" | "completed" | "failed" | "refunded";
    idempotencyKey: string;
  },
): Promise<{ id: string; [key: string]: unknown }> {
  const response = await request.post("http://localhost:3000/payments", {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    data: payload,
  });

  expect(response.ok()).toBeTruthy();
  return response.json();
}

/**
 * Obtém o access token do localStorage após login.
 * O app.js armazena auth_access_token no localStorage.
 */
async function getAccessToken(page: Page): Promise<string> {
  return (await page.evaluate(() => localStorage.getItem("auth_access_token"))) ?? ""; // eslint-disable-line no-undef
}

test.describe("Payments Listing (S06-15)", () => {
  test.beforeAll(async () => {
    await resetDatabase();
  });

  test.beforeEach(async () => {
    await resetDatabase();
    await seedUsers();
  });

  test.afterAll(async () => {
    await resetDatabase();
  });

  test("lista 3 payments com badges coloridos", async ({ page, request }) => {
    // Login admin para obter token
    await loginAs(page, ADMIN_USER.email, ADMIN_USER.password);
    const token = await getAccessToken(page);

    // Cria 3 payments: P1 pending user1 1000 BRL, P2 completed user1 5000 BRL, P3 failed user2 200 USD
    await createPayment(request, token, {
      userId: USER1.id,
      amount: 1000,
      currency: "BRL",
      status: "pending",
      idempotencyKey: `test-${Date.now()}-1`,
    });
    await createPayment(request, token, {
      userId: USER1.id,
      amount: 5000,
      currency: "BRL",
      status: "completed",
      idempotencyKey: `test-${Date.now()}-2`,
    });
    await createPayment(request, token, {
      userId: USER2.id,
      amount: 200,
      currency: "USD",
      status: "failed",
      idempotencyKey: `test-${Date.now()}-3`,
    });

    // Navega para /payments.html
    await page.goto("/payments.html");
    await page.waitForLoadState("networkidle");

    // Expect tbody rows === 3
    await expect(page.locator("tbody[data-testid='payments-list'] tr")).toHaveCount(3);

    // Expect 3 status badges visíveis
    const statusBadges = page.locator(
      "tbody[data-testid='payments-list'] tr td:nth-child(4) .payment-status",
    );
    await expect(statusBadges).toHaveCount(3);

    // Expect texto contém "Mostrando 3 de 3 pagamentos"
    await expect(page.getByTestId("payments-pagination")).toContainText(
      "Mostrando 3 de 3 pagamentos",
    );
  });

  test("filtro status=completed reduz a lista", async ({ page, request }) => {
    // Login admin para obter token
    await loginAs(page, ADMIN_USER.email, ADMIN_USER.password);
    const token = await getAccessToken(page);

    // Cria os mesmos 3 payments
    await createPayment(request, token, {
      userId: USER1.id,
      amount: 1000,
      currency: "BRL",
      status: "pending",
      idempotencyKey: `test-${Date.now()}-filter-1`,
    });
    await createPayment(request, token, {
      userId: USER1.id,
      amount: 5000,
      currency: "BRL",
      status: "completed",
      idempotencyKey: `test-${Date.now()}-filter-2`,
    });
    await createPayment(request, token, {
      userId: USER2.id,
      amount: 200,
      currency: "USD",
      status: "failed",
      idempotencyKey: `test-${Date.now()}-filter-3`,
    });

    // Navega para /payments.html
    await page.goto("/payments.html");
    await page.waitForLoadState("networkidle");

    // Select option filter-status "completed"
    await page.getByTestId("filter-status").selectOption("completed");

    // Click filter-submit
    await page.getByTestId("filter-submit").click();
    await page.waitForLoadState("networkidle");

    // Expect tbody rows === 1
    await expect(page.locator("tbody[data-testid='payments-list'] tr")).toHaveCount(1);

    // Expect row status "completed"
    const statusCell = page.locator("tbody[data-testid='payments-list'] tr td:nth-child(4)");
    await expect(statusCell).toContainText("completed");
  });

  test("botão Limpar reseta filtros e recarrega lista completa", async ({ page, request }) => {
    // Login admin para obter token
    await loginAs(page, ADMIN_USER.email, ADMIN_USER.password);
    const token = await getAccessToken(page);

    // Cria os mesmos 3 payments
    await createPayment(request, token, {
      userId: USER1.id,
      amount: 1000,
      currency: "BRL",
      status: "pending",
      idempotencyKey: `test-${Date.now()}-clear-1`,
    });
    await createPayment(request, token, {
      userId: USER1.id,
      amount: 5000,
      currency: "BRL",
      status: "completed",
      idempotencyKey: `test-${Date.now()}-clear-2`,
    });
    await createPayment(request, token, {
      userId: USER2.id,
      amount: 200,
      currency: "USD",
      status: "failed",
      idempotencyKey: `test-${Date.now()}-clear-3`,
    });

    // Navega para /payments.html
    await page.goto("/payments.html");
    await page.waitForLoadState("networkidle");

    // Aplica filtro completed (rows === 1)
    await page.getByTestId("filter-status").selectOption("completed");
    await page.getByTestId("filter-submit").click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator("tbody[data-testid='payments-list'] tr")).toHaveCount(1);

    // Click filter-clear
    await page.getByTestId("filter-clear").click();
    await page.waitForLoadState("networkidle");

    // Expect tbody rows === 3
    await expect(page.locator("tbody[data-testid='payments-list'] tr")).toHaveCount(3);
  });

  test("sem login redireciona pra /login.html", async ({ page }) => {
    // Limpa localStorage
    await page.goto("/login.html");
    await page.evaluate(() => {
      // eslint-disable-next-line no-undef
      localStorage.clear();
    });

    // Goto /payments.html
    await page.goto("/payments.html");

    // Expect URL /login.html
    await expect(page).toHaveURL(/\/login/);
  });
});
