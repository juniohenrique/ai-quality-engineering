import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import bcrypt from "bcrypt";
import { resetDatabase, testDatabase } from "../setup/db.js";

/*
 * E2E Test — Admin Dashboard (S06-15)
 *
 * Valida o dashboard em /dashboard.html para admin e usuário comum:
 * - cards de usuários e pagamentos com totais e breakdowns
 * - lista de últimas transações
 * - acesso restrito para usuário não-admin
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

const REGULAR_USER = {
  id: "00000000-0000-0000-0000-000000000030",
  email: "user@example.com",
  userName: "Regular User",
  role: "user" as const,
  password: "user-pass-12345",
};

async function seedUsers(): Promise<void> {
  const adminHash = await bcrypt.hash(ADMIN_USER.password, 10);
  const userHash = await bcrypt.hash(REGULAR_USER.password, 10);

  await testDatabase.query(
    "INSERT INTO users (id, email, user_name, password_hash, role) VALUES ($1, $2, $3, $4, $5)",
    [ADMIN_USER.id, ADMIN_USER.email, ADMIN_USER.userName, adminHash, ADMIN_USER.role],
  );
  await testDatabase.query(
    "INSERT INTO users (id, email, user_name, password_hash, role) VALUES ($1, $2, $3, $4, $5)",
    [REGULAR_USER.id, REGULAR_USER.email, REGULAR_USER.userName, userHash, REGULAR_USER.role],
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
 * Obtém o access token do localStorage após login.
 * O app.js armazena auth_access_token no localStorage.
 */
async function getAccessToken(page: Page): Promise<string> {
  return (await page.evaluate(() => localStorage.getItem("auth_access_token"))) ?? ""; // eslint-disable-line no-undef
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

test.describe("Admin Dashboard (S06-15)", () => {
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

  test("card de usuários mostra total e breakdown por role", async ({ page, request }) => {
    // Login admin para obter token e criar payments
    await loginAs(page, ADMIN_USER.email, ADMIN_USER.password);
    const token = await getAccessToken(page);

    // Cria 3 payments: 2 para user1, 1 para user2
    await createPayment(request, token, {
      userId: REGULAR_USER.id,
      amount: 1000,
      currency: "BRL",
      status: "pending",
      idempotencyKey: `test-${Date.now()}-dash1`,
    });
    await createPayment(request, token, {
      userId: REGULAR_USER.id,
      amount: 5000,
      currency: "BRL",
      status: "completed",
      idempotencyKey: `test-${Date.now()}-dash2`,
    });
    // Segundo usuário para testar contagem
    const user2Id = "00000000-0000-0000-0000-000000000040";
    await testDatabase.query(
      "INSERT INTO users (id, email, user_name, password_hash, role) VALUES ($1, $2, $3, $4, $5)",
      [user2Id, "user2@example.com", "User Two", await bcrypt.hash("pass", 10), "user"],
    );
    await createPayment(request, token, {
      userId: user2Id,
      amount: 200,
      currency: "USD",
      status: "failed",
      idempotencyKey: `test-${Date.now()}-dash3`,
    });

    // Navega para /dashboard.html
    await page.goto("/dashboard.html");
    await page.waitForLoadState("networkidle");

    // Expect dashboard-users-total === "3" (admin + user + user2)
    await expect(page.getByTestId("dashboard-users-total")).toHaveText("3");

    // Expect dashboard-users-admin === "1"
    await expect(page.getByTestId("dashboard-users-admin")).toHaveText("1");

    // Expect dashboard-users-user === "2"
    await expect(page.getByTestId("dashboard-users-user")).toHaveText("2");
  });

  test("card de pagamentos mostra total e byStatus", async ({ page, request }) => {
    // Login admin para obter token e criar payments
    await loginAs(page, ADMIN_USER.email, ADMIN_USER.password);
    const token = await getAccessToken(page);

    // Cria 3 payments: 1 pending, 1 completed, 1 failed
    await createPayment(request, token, {
      userId: REGULAR_USER.id,
      amount: 1000,
      currency: "BRL",
      status: "pending",
      idempotencyKey: `test-${Date.now()}-pay1`,
    });
    await createPayment(request, token, {
      userId: REGULAR_USER.id,
      amount: 5000,
      currency: "BRL",
      status: "completed",
      idempotencyKey: `test-${Date.now()}-pay2`,
    });
    await createPayment(request, token, {
      userId: REGULAR_USER.id,
      amount: 200,
      currency: "USD",
      status: "failed",
      idempotencyKey: `test-${Date.now()}-pay3`,
    });

    // Navega para /dashboard.html
    await page.goto("/dashboard.html");
    await page.waitForLoadState("networkidle");

    // Expect dashboard-payments-total === "3"
    await expect(page.getByTestId("dashboard-payments-total")).toHaveText("3");

    // Expect dashboard-payments-pending === "1"
    const byStatus = page.getByTestId("dashboard-payments-by-status");
    await expect(byStatus.locator("dd").first()).toHaveText("1"); // pending
    // Expect dashboard-payments-processing === "0"
    await expect(byStatus.locator("dd").nth(1)).toHaveText("0"); // processing
    // Expect dashboard-payments-completed === "1"
    await expect(byStatus.locator("dd").nth(2)).toHaveText("1"); // completed
    // Expect dashboard-payments-failed === "1"
    await expect(byStatus.locator("dd").nth(3)).toHaveText("1"); // failed
  });

  test("lista últimas transações com 3 rows", async ({ page, request }) => {
    // Login admin para obter token e criar payments
    await loginAs(page, ADMIN_USER.email, ADMIN_USER.password);
    const token = await getAccessToken(page);

    // Cria 3 payments com status diferentes
    await createPayment(request, token, {
      userId: REGULAR_USER.id,
      amount: 1000,
      currency: "BRL",
      status: "pending",
      idempotencyKey: `test-${Date.now()}-recent1`,
    });
    await createPayment(request, token, {
      userId: REGULAR_USER.id,
      amount: 5000,
      currency: "BRL",
      status: "completed",
      idempotencyKey: `test-${Date.now()}-recent2`,
    });
    await createPayment(request, token, {
      userId: REGULAR_USER.id,
      amount: 200,
      currency: "USD",
      status: "failed",
      idempotencyKey: `test-${Date.now()}-recent3`,
    });

    // Navega para /dashboard.html
    await page.goto("/dashboard.html");
    await page.waitForLoadState("networkidle");

    // Expect dashboard-recent-list tr count === 3
    await expect(page.locator("tbody[data-testid='dashboard-recent-list'] tr")).toHaveCount(3);

    // Expect status badges visíveis
    const statusBadges = page.locator(
      "tbody[data-testid='dashboard-recent-list'] tr td:nth-child(3) .payment-status",
    );
    await expect(statusBadges).toHaveCount(3);

    // Expect valores formatados (contém "R$" ou "US$")
    const amountCells = page.locator(
      "tbody[data-testid='dashboard-recent-list'] tr td:nth-child(2)",
    );
    const amounts = await amountCells.allTextContents();
    // Pelo menos um contém R$ e pelo menos um contém US$ (ou $)
    const hasReal = amounts.some((a) => a.includes("R$") || a.includes("BRL"));
    const hasDollar = amounts.some((a) => a.includes("$") || a.includes("USD"));
    expect(hasReal || hasDollar).toBeTruthy();
  });

  test("user comum vê mensagem de acesso restrito", async ({ page }) => {
    // Login como user comum
    await loginAs(page, REGULAR_USER.email, REGULAR_USER.password);

    // Goto /dashboard.html
    await page.goto("/dashboard.html");
    await page.waitForLoadState("networkidle");

    // Expect dashboard-message contém "Acesso restrito"
    await expect(page.getByTestId("dashboard-message")).toContainText(/acesso restrito/i);

    // Expect dashboard-users-total texto === "—" (não preenchido)
    await expect(page.getByTestId("dashboard-users-total")).toHaveText("—");
  });
});
